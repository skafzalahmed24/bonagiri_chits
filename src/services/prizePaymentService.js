const { PrizePayment, Auction, Enrollment, Member, PaymentAccount, ChitsGroup, CustomerPayment, Surety, Sequelize } = require('../models');
const db = require('../models');
const fcmService = require('./fcmService');
const { ticketWin, holderNamesByEnrollment, holderMembersOf } = require('../utils/jointHolders');
const { getGroupCompanySeats } = require('../utils/schemeHelpers');
const { generateReceiptNumber } = require('../utils/receiptGenerator');

function round2(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

/** Active joint holders of a ticket (the main holder is not included): [{ name, share_percent }]. */
async function jointHolderList(enrollmentId) {
  const { EnrollmentJointHolder } = require('../models');
  const rows = await EnrollmentJointHolder.findAll({
    where: { enrollment_id: enrollmentId, removed_on: null },
    include: [{ model: Member, as: 'member', attributes: ['name'] }]
  });
  return rows.map((j) => ({ name: j.member ? j.member.name : null, share_percent: j.share_percent != null ? Number(j.share_percent) : null }));
}

/** Who did it, for created_by_name / updated_by_name / deleted_by_name. Tokens carry no name. */
async function userDisplayName(user) {
  if (!user) return null;
  const { Company, StaffUser } = require('../models');
  if (user.role === 'company') {
    const c = await Company.findByPk(user.id, { attributes: ['company_name'] });
    return c ? c.company_name : null;
  }
  // A name is only for display: never let the lookup block a payment.
  const s = await StaffUser.findByPk(user.id, { attributes: ['first_name', 'last_name'] }).catch(() => null);
  const staffName = s ? [s.first_name, s.last_name].filter(Boolean).join(' ') : '';
  return staffName || user.name || null;
}

const groupStatusWhere = (group_status) => {
  if (group_status === 1) return { chits_group_status: { [Sequelize.Op.in]: [0, 1] } };
  if (group_status === 2) return { chits_group_status: 2 };
  return {};
};

async function loadTicket({ companyId, enrollmentId, groupId, ticketNumber, transaction }) {
  let where = { company_id: companyId };
  if (enrollmentId) {
    where.id = enrollmentId;
  } else {
    where.group_id = groupId;
    where.group_position_number = ticketNumber;
  }

  const enrollment = await Enrollment.findOne({
    where,
    include: [{ model: Member, as: 'subscriber' }],
    transaction
  });
  if (!enrollment) throw new Error('Ticket not found.');

  const group = await ChitsGroup.findOne({ where: { id: enrollment.group_id, company_id: companyId }, transaction });
  if (!group) throw new Error('Group not found.');

  const compSeats = await getGroupCompanySeats(group.id, group, transaction);
  if (compSeats.includes(Number(enrollment.group_position_number)) || Number(enrollment.group_position_number) === Number(group.company_chit_number)) {
    throw new Error('This is a company chit.');
  }

  const win = await ticketWin(enrollment);

  return { enrollment, group, win };
}

async function prizePosition(auction, enrollment, { transaction, excludePaymentId }) {
  const adjRaw = await CustomerPayment.sum('received_amount', {
    where: { prize_auction_id: auction.id, payment_mode: 7, payment_status: 1 },
    transaction
  });
  const adjusted = round2(adjRaw);

  const adv1Raw = await PrizePayment.sum('amount', {
    where: { enrollment_id: enrollment.id, payment_type: 2, is_deleted: 0, ...(excludePaymentId ? { id: { [Sequelize.Op.ne]: excludePaymentId } } : {}) },
    transaction
  });
  const adv2Raw = await CustomerPayment.sum('received_amount', {
    where: { adjust_from_enrollment_id: enrollment.id, payment_mode: 8, payment_status: 1 },
    transaction
  });
  const advance = round2(adv1Raw) + round2(adv2Raw);

  const pdRaw = await PrizePayment.sum('amount', {
    where: { auction_id: auction.id, payment_type: { [Sequelize.Op.in]: [1, 3] }, is_deleted: 0, ...(excludePaymentId ? { id: { [Sequelize.Op.ne]: excludePaymentId } } : {}) },
    transaction
  });
  const paid = round2(pdRaw);

  const net = round2(Number(auction.bid_payable) - adjusted - advance - paid);
  return { adjusted, advance, paid, net };
}

async function advancePosition(enrollment, group, { transaction, excludePaymentId }) {
  const commission = round2(Number(group.chit_amount) * Number(group.company_commission) / 100);
  const limit = round2(Number(group.chit_amount) - commission);

  const advancedRaw = await PrizePayment.sum('amount', {
    where: { enrollment_id: enrollment.id, payment_type: 2, is_deleted: 0, ...(excludePaymentId ? { id: { [Sequelize.Op.ne]: excludePaymentId } } : {}) },
    transaction
  });
  const advanced = round2(advancedRaw);

  const adjustedRaw = await CustomerPayment.sum('received_amount', {
    where: { adjust_from_enrollment_id: enrollment.id, payment_mode: 8, payment_status: 1 },
    transaction
  });
  const adjusted = round2(adjustedRaw);

  const available = round2(limit - advanced - adjusted);

  return { chit_amount: Number(group.chit_amount), company_commission: commission, advance_limit: limit, advanced, adjusted, total_used: round2(advanced + adjusted), available };
}

async function recalcPrizeTotals(auctionId, transaction) {
  const auction = await Auction.findByPk(auctionId, { transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined });
  if (!auction) return null;
  const en = await Enrollment.findOne({ where: { company_id: auction.company_id, group_id: auction.group_id, group_position_number: auction.ticket_number }, transaction });
  if (!en) return null;

  const pos = await prizePosition(auction, en, { transaction });
  
  const status = pos.net <= 0.005 ? 2 : (pos.adjusted + pos.advance + pos.paid > 0 ? 1 : 0);
  
  const lastPayment = await PrizePayment.findOne({
    where: { auction_id: auctionId, is_deleted: 0 },
    order: [['payment_date', 'DESC']],
    transaction,
    attributes: ['payment_date']
  });

  await auction.update({
    prize_adjusted_amount: pos.adjusted,
    prize_advance_amount: pos.advance,
    prize_paid_amount: pos.paid,
    prize_net_payable: pos.net,
    prize_status: status,
    prize_last_paid_date: lastPayment ? lastPayment.payment_date : null
  }, { transaction });

  return auction;
}

async function nextVoucherNumber(companyId, type, date, transaction) {
  const prefix = type === 1 ? 'BP' : type === 2 ? 'BA' : 'OP';
  const d = new Date(date);
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const startY = m >= 4 ? y : y - 1;
  const endY = String(startY + 1).slice(-2);
  const fy = `${startY}-${endY}`;

  if (transaction) {
    const lockKey = `prize-voucher-${companyId}-${prefix}-${fy}`;
    await db.sequelize.query(
      `SELECT pg_advisory_xact_lock(hashtext(:key))`,
      { replacements: { key: lockKey }, type: Sequelize.QueryTypes.SELECT, transaction }
    );
  }

  const last = await PrizePayment.findOne({
    where: { company_id: companyId, voucher_number: { [Sequelize.Op.like]: `${prefix}/${fy}/%` } },
    order: [['voucher_number', 'DESC']],
    transaction,
    paranoid: false
  });

  let seq = 1;
  if (last) {
    const parts = last.voucher_number.split('/');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `${prefix}/${fy}/${String(seq).padStart(4, '0')}`;
}

async function ticketSearch({ companyId, search, purpose, group_id }) {
  if (!search || search.length < 2) throw new Error('Search string must be at least 2 characters.');

  let where = { company_id: companyId, delete_status: 0 };
  if (group_id) where.group_id = group_id;

  const enrollments = await Enrollment.findAll({
    where,
    include: [
      { model: Member, as: 'subscriber', attributes: ['name', 'mobile_number'] },
      { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name', 'chits_group_status'] }
    ]
  });

  const matchingEnrolls = [];
  const hInfos = await holderNamesByEnrollment(enrollments.map(e => e.id));
  
  for (const en of enrollments) {
    const names = hInfos[en.id] || en.subscriber?.name || '';
    const searchLow = search.toLowerCase();
    
    if (names.toLowerCase().includes(searchLow) || 
        (en.subscriber?.mobile_number && en.subscriber.mobile_number.includes(search)) || 
        en.group_position_number.toString() === search) {
      
      try {
        const { group, win } = await loadTicket({ companyId, enrollmentId: en.id, transaction: null });
        if (purpose === 'payment') {
          if (win && Number(win.prize_net_payable) > 0) {
            matchingEnrolls.push({
              enrollment_id: en.id, group_id: group.id, group_name: group.group_name,
              ticket_number: en.group_position_number, member_name: en.subscriber?.name,
              holder_names: names, auction_id: win.id, net_payable: Number(win.prize_net_payable)
            });
          }
        } else if (purpose === 'advance') {
          if (!win && group.chits_group_status !== 2) {
            const adv = await advancePosition(en, group, { transaction: null });
            if (adv.available > 0) {
              matchingEnrolls.push({
                enrollment_id: en.id, group_id: group.id, group_name: group.group_name,
                ticket_number: en.group_position_number, member_name: en.subscriber?.name,
                holder_names: names, advance_available: adv.available
              });
            }
          }
        }
      } catch (e) {
        // Skip company chits etc.
      }
    }
    if (matchingEnrolls.length >= 20) break;
  }

  return matchingEnrolls;
}

async function getMemberStatus(enrollmentId) {
  const { ChitsInstallment } = require('../models');
  const installments = await ChitsInstallment.findAll({
    where: { enrollment_id: enrollmentId, due_date: { [Sequelize.Op.lte]: new Date() } },
    order: [['installment_no', 'ASC']]
  });
  
  const { getInstallmentsBalancesBatch } = require('./installmentBalanceHelper');
  const balances = await getInstallmentsBalancesBatch(installments.map(i => i.id));
  
  let dues = 0;
  let paidUpTo = null;
  let currentInstallment = 0;
  
  for (const inst of installments) {
    currentInstallment = Math.max(currentInstallment, inst.installment_no);
    const payable = round2(inst.payable_amount);
    const paid = round2(balances[inst.id] || 0);
    const due = round2(payable - paid);
    if (due > 0) {
      dues += due;
    } else {
      const d = new Date(inst.due_date);
      paidUpTo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  return { current_installment: currentInstallment, dues: round2(dues), paid_up_to: paidUpTo };
}

async function getPosition({ companyId, auctionId, groupId, ticketNumber, paymentId, auction_id, group_id, ticket_number, payment_id }) {
  // The API body is snake_case; internal callers pass camelCase.
  auctionId = auctionId || auction_id;
  groupId = groupId || group_id;
  ticketNumber = ticketNumber || ticket_number;
  paymentId = paymentId || payment_id;
  if (!auctionId && !(groupId && ticketNumber)) throw new Error('Choose a group and ticket, or an auction.');
  let enrollmentId = null;
  if (auctionId) {
    const a = await Auction.findOne({ where: { id: auctionId, company_id: companyId } });
    if (!a) throw new Error('Auction not found.');
    const en = await Enrollment.findOne({ where: { group_id: a.group_id, group_position_number: a.ticket_number, company_id: companyId } });
    if (!en) throw new Error('Ticket not found.');
    enrollmentId = en.id;
  }

  const { enrollment, group, win } = await loadTicket({ companyId, enrollmentId, groupId, ticketNumber, transaction: null });
  if (!win) throw new Error('This ticket has not won an auction.');
  if (auctionId && win.id !== auctionId) throw new Error('This ticket has not won an auction.');

  let editingAmount = 0;
  if (paymentId) {
    const payment = await PrizePayment.findOne({ where: { id: paymentId, company_id: companyId, is_deleted: 0 } });
    if (payment && payment.auction_id === win.id) {
      editingAmount = round2(payment.amount);
    }
  }

  const memberStatus = await getMemberStatus(enrollment.id);
  const suretiesCount = await Surety.count({ where: { enrollment_id: enrollment.id, company_id: companyId, is_deleted_status: 0 } });
  
  const pos = await prizePosition(win, enrollment, { transaction: null, excludePaymentId: paymentId });
  const position = {
    prize_payable: round2(win.bid_payable),
    less_adjusted: pos.adjusted,
    less_advance: pos.advance,
    less_paid: pos.paid,
    net_payable: pos.net,
    excess_advance: pos.net < 0 ? Math.abs(pos.net) : 0,
    prize_status: pos.net <= 0.005 ? 2 : (pos.adjusted + pos.advance + pos.paid > 0 ? 1 : 0)
  };

  const nextVoucher = await nextVoucherNumber(companyId, 1, new Date(), null);
  const holders = await holderNamesByEnrollment([enrollment.id]);

  return {
    auction: {
      id: win.id,
      auction_number: win.auction_number,
      auction_date: win.auction_date,
      month: `${new Date(win.auction_date).toLocaleString('default', { month: 'short' })} ${new Date(win.auction_date).getFullYear()}`,
      chit_amount: win.chit_amount,
      bid_loss: win.bid_loss,
      company_commission: win.company_commission,
      gst_amount: win.gst_amount,
      bid_payable: win.bid_payable
    },
    ticket: {
      enrollment_id: enrollment.id,
      group_id: group.id,
      group_name: group.group_name,
      ticket_number: enrollment.group_position_number,
      member_id: enrollment.subscriber_id,
      member_name: enrollment.subscriber?.name,
      father_name: enrollment.subscriber?.guardian_name,
      address: enrollment.subscriber?.address_info_address,
      photo: enrollment.subscriber?.upload_image,
      holder_names: holders[enrollment.id],
      joint_holders: await jointHolderList(enrollment.id)
    },
    member_status: memberStatus,
    sureties_count: suretiesCount,
    position,
    editing_amount: editingAmount,
    next_voucher_number: nextVoucher,
    default_narration: `Being the amount paid to ${holders[enrollment.id] || enrollment.subscriber?.name} (chit ref: ${group.group_name} / ${enrollment.group_position_number}) towards bid payment`
  };
}

async function advancePositionEndpoint({ companyId, enrollmentId, groupId, ticketNumber, paymentId, enrollment_id, group_id, ticket_number, payment_id }) {
  enrollmentId = enrollmentId || enrollment_id;
  groupId = groupId || group_id;
  ticketNumber = ticketNumber || ticket_number;
  paymentId = paymentId || payment_id;
  if (!enrollmentId && !(groupId && ticketNumber)) throw new Error('Choose a group and ticket.');
  const { enrollment, group, win } = await loadTicket({ companyId, enrollmentId, groupId, ticketNumber, transaction: null });
  if (win) throw new Error('This ticket has already won; use Bid Payment.');
  if (group.chits_group_status === 2) throw new Error('This group is closed.');

  let editingAmount = 0;
  if (paymentId) {
    const payment = await PrizePayment.findOne({ where: { id: paymentId, company_id: companyId, is_deleted: 0 } });
    if (payment && payment.enrollment_id === enrollment.id) {
      editingAmount = round2(payment.amount);
    }
  }

  const memberStatus = await getMemberStatus(enrollment.id);
  const suretiesCount = await Surety.count({ where: { enrollment_id: enrollment.id, company_id: companyId, is_deleted_status: 0 } });
  
  const position = await advancePosition(enrollment, group, { transaction: null, excludePaymentId: paymentId });
  const nextVoucher = await nextVoucherNumber(companyId, 2, new Date(), null);
  const holders = await holderNamesByEnrollment([enrollment.id]);

  return {
    ticket: {
      enrollment_id: enrollment.id,
      group_id: group.id,
      group_name: group.group_name,
      ticket_number: enrollment.group_position_number,
      member_id: enrollment.subscriber_id,
      member_name: enrollment.subscriber?.name,
      father_name: enrollment.subscriber?.guardian_name,
      address: enrollment.subscriber?.address_info_address,
      photo: enrollment.subscriber?.upload_image,
      holder_names: holders[enrollment.id],
      joint_holders: await jointHolderList(enrollment.id)
    },
    member_status: memberStatus,
    sureties_count: suretiesCount,
    position,
    editing_amount: editingAmount,
    next_voucher_number: nextVoucher,
    default_narration: `Being the amount paid to ${holders[enrollment.id] || enrollment.subscriber?.name} (chit ref: ${group.group_name} / ${enrollment.group_position_number}) towards bid advance`
  };
}

async function storeOrUpdate({ companyId, id, payment_type, auction_id, enrollment_id, payment_date, account_id, payment_mode, amount, cheque_number, cheque_date, reference_no, narration, user }) {
  // Staff need the module for this kind of payment: Bid Payments (types 1, 3) or Bid Advance (type 2).
  if (user && user.role === 'staff') {
    const needed = payment_type === 2 ? 'T_BID_ADVANCE' : 'T_BID_PAYMENTS';
    if (!user.permissions?.[needed]?.view) throw new Error(`You don't have permission for ${payment_type === 2 ? 'bid advances' : 'bid payments'}.`);
  }
  const byName = await userDisplayName(user);
  return await db.sequelize.transaction(async (transaction) => {
    const { enrollment, group, win } = await loadTicket({ companyId, enrollmentId: enrollment_id, transaction });
    
    let limit = 0;
    let oldPayment = null;

    if (id) {
      if (user.role !== 'company') throw new Error('Only the company admin can do this.');
      oldPayment = await PrizePayment.findOne({ where: { id, company_id: companyId, is_deleted: 0 }, transaction });
      if (!oldPayment || oldPayment.enrollment_id !== enrollment.id) throw new Error('Not found.');
      if (oldPayment.payment_type !== payment_type) throw new Error('Payment type cannot be changed.');
    }

    if (payment_type === 1 || payment_type === 3) {
      if (!win) throw new Error('This ticket has not won an auction.');
      if (auction_id && auction_id !== win.id) throw new Error('This ticket has not won an auction.');
      
      await Auction.findOne({ where: { id: win.id }, transaction, lock: transaction.LOCK.UPDATE });
      const pos = await prizePosition(win, enrollment, { transaction, excludePaymentId: id });
      limit = pos.net;
      
      if (!id && limit <= 0) {
        if (pos.net < 0) throw new Error(`Advance exceeds the prize by ₹${Math.abs(pos.net)}; nothing to pay.`);
        throw new Error('This prize is already fully paid.');
      }
    } else if (payment_type === 2) {
      if (win) throw new Error('This ticket has already won; use Bid Payment.');
      if (group.chits_group_status === 2) throw new Error('This group is closed.');
      
      await Enrollment.findOne({ where: { id: enrollment.id }, transaction, lock: transaction.LOCK.UPDATE });
      const pos = await advancePosition(enrollment, group, { transaction, excludePaymentId: id });
      limit = pos.available;
      
      if (!id && limit <= 0) throw new Error('No advance available.');
    } else {
      throw new Error('Invalid payment type.');
    }

    if (Number(amount) > limit + 0.005) {
      throw new Error(`Amount cannot be more than ₹${limit}.`);
    }

    const pDate = new Date(payment_date);
    const today = new Date();
    today.setHours(0,0,0,0);
    pDate.setHours(0,0,0,0);

    if (payment_type === 1 || payment_type === 3) {
      const aDate = new Date(win.auction_date);
      aDate.setHours(0,0,0,0);
      if (pDate < aDate || pDate > today) throw new Error('Payment date must be between the auction date and today.');
    } else {
      const sDate = new Date(group.chit_start_date || group.createdAt);
      sDate.setHours(0,0,0,0);
      if (pDate < sDate || pDate > today) throw new Error('Payment date must be between the group start date and today.');
    }

    let account = null;
    let finalVoucher = id ? oldPayment.voucher_number : await nextVoucherNumber(companyId, payment_type, payment_date, transaction);

    if (payment_type === 1 || payment_type === 2) {
      account = await PaymentAccount.findOne({ where: { id: account_id, company_id: companyId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!account) throw new Error('Not found.');
      if (account.is_active !== true && account.is_active !== 1) throw new Error('Choose an active account.');

      const isCash = account.account_type === 'CASH';
      const isUPI = account.account_type === 'UPI';
      const isBank = account.account_type === 'BANK';
      const modeLabel = payment_mode === 1 ? 'cash' : payment_mode === 2 ? 'UPI' : payment_mode === 3 ? 'cheque' : 'bank transfer';

      if ((isCash && payment_mode !== 1) || (isUPI && payment_mode !== 2) || (isBank && (payment_mode !== 3 && payment_mode !== 4))) {
        throw new Error(`A ${account.account_type} account can't be used for ${modeLabel}.`);
      }

      if (payment_mode === 3) {
        if (!cheque_number) throw new Error('Enter the cheque number.');
        const cDate = new Date(cheque_date);
        cDate.setHours(0,0,0,0);
        if (payment_type === 1) {
          const aDate = new Date(win.auction_date);
          aDate.setHours(0,0,0,0);
          if (cDate < aDate) throw new Error(`Cheque date can't be before the auction date (${aDate.toLocaleDateString('en-GB')}).`);
        } else {
          if (cDate < pDate) throw new Error(`Cheque date can't be before the payment date (${pDate.toLocaleDateString('en-GB')}).`);
        }
      }

      if ((payment_mode === 2 || payment_mode === 4) && !reference_no) {
        throw new Error('Enter the reference number.');
      }

      if (id && oldPayment.account_id) {
        const oldAcc = oldPayment.account_id === account.id ? account : await PaymentAccount.findOne({ where: { id: oldPayment.account_id }, transaction, lock: transaction.LOCK.UPDATE });
        if (oldAcc) {
          await oldAcc.update({ current_balance: Number(oldAcc.current_balance) + Number(oldPayment.amount) }, { transaction });
        }
      }

      const balAfterRevert = id && oldPayment.account_id === account.id ? Number(account.current_balance) : Number(account.current_balance);
      if (balAfterRevert < Number(amount)) {
        throw new Error(`Not enough balance in ${account.name} (₹${balAfterRevert} available).`);
      }

      await account.update({ current_balance: balAfterRevert - Number(amount) }, { transaction });
    } else if (payment_type === 3) {
      if (user.role !== 'company') throw new Error('Only the company admin can do this.');
      if (account_id || payment_mode || cheque_number || reference_no) {
        throw new Error('Type 3 must not have an account, mode, cheque or reference.');
      }
    }

    let payment;
    if (id) {
      payment = await oldPayment.update({
        payment_date, amount, account_id: account_id || null, payment_mode: payment_mode || null,
        cheque_number: cheque_number || null, cheque_date: cheque_date || null,
        reference_no: reference_no || null, narration: narration || null,
        updated_by_name: byName
      }, { transaction });
    } else {
      payment = await PrizePayment.create({
        company_id: companyId,
        auction_id: payment_type === 2 ? null : win.id,
        group_id: group.id,
        enrollment_id: enrollment.id,
        member_id: enrollment.subscriber_id,
        payment_type,
        voucher_number: finalVoucher,
        payment_date,
        amount,
        account_id: account_id || null,
        payment_mode: payment_mode || null,
        cheque_number: cheque_number || null,
        cheque_date: cheque_date || null,
        reference_no: reference_no || null,
        narration: narration || null,
        created_by_id: user.id,
        created_by_role: user.role,
        created_by_name: byName
      }, { transaction });
    }

    if (payment_type === 1 || payment_type === 3) {
      await recalcPrizeTotals(win.id, transaction);
    } else if (payment_type === 2 && win) {
      await recalcPrizeTotals(win.id, transaction);
    }

    return payment;
  }).then(async (payment) => {
    if ((payment_type === 1 || payment_type === 2) && !id) {
      try {
        const holderMems = await holderMembersOf([enrollment.id]);
        const mLabel = payment_mode === 1 ? 'cash' : payment_mode === 2 ? 'UPI' : payment_mode === 3 ? 'cheque' : 'bank transfer';
        const d = new Date(payment_date);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear();
        
        for (const holder of holderMems) {
          if (payment_type === 1) {
            const balance = round2(Number(win.prize_net_payable) - Number(amount));
            await fcmService.sendPushToMember(holder, 'Prize payment',
              `₹${amount} of your prize for ${group.group_name}, ticket ${enrollment.group_position_number}, has been paid by ${mLabel} on ${dd}/${mm}/${yy}. Balance ₹${balance}.`,
              { type: 'PRIZE_PAYMENT', group_id: group.id, enrollment_id: enrollment.id }, companyId);
          } else {
            await fcmService.sendPushToMember(holder, 'Bid advance',
              `An advance of ₹${amount} against your chit ${group.group_name}, ticket ${enrollment.group_position_number}, has been paid by ${mLabel} on ${dd}/${mm}/${yy}.`,
              { type: 'PRIZE_PAYMENT', group_id: group.id, enrollment_id: enrollment.id }, companyId);
          }
        }
      } catch (e) {
        console.error('Failed to send push for prize payment:', e);
      }
    }
    
    if (payment_type === 1 || payment_type === 3) {
      const pos = await getPosition({ companyId, auctionId: payment.auction_id });
      return { payment, position: pos.position };
    } else {
      const pos = await advancePositionEndpoint({ companyId, enrollmentId: payment.enrollment_id });
      return { payment, position: pos.position };
    }
  });
}

async function getAll({ companyId, payment_types, from_date, to_date, group_id, group_status, account_id, search, min, max }) {
  const where = { company_id: companyId, is_deleted: 0 };
  
  if (from_date && to_date) {
    where.payment_date = { [Sequelize.Op.between]: [from_date, to_date] };
  } else if (from_date) {
    where.payment_date = { [Sequelize.Op.gte]: from_date };
  } else if (to_date) {
    where.payment_date = { [Sequelize.Op.lte]: to_date };
  }

  if (group_id) where.group_id = group_id;
  if (payment_types && payment_types.length > 0) where.payment_type = { [Sequelize.Op.in]: payment_types };
  if (account_id) where.account_id = account_id;

  const include = [
    { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name', 'chits_group_status'], where: group_status ? groupStatusWhere(group_status) : {} },
    { model: Member, as: 'member', attributes: ['name'] },
    { model: PaymentAccount, as: 'account', attributes: ['id', 'name', 'account_type'] },
    { model: Auction, as: 'auction', attributes: ['id', 'auction_number', 'auction_date'] },
    { model: Enrollment, as: 'enrollment', attributes: ['group_position_number'] }
  ];

  if (search) {
    where[Sequelize.Op.or] = [
      { voucher_number: { [Sequelize.Op.iLike]: `%${search}%` } },
      { '$member.name$': { [Sequelize.Op.iLike]: `%${search}%` } },
      Sequelize.where(Sequelize.cast(Sequelize.col('enrollment.group_position_number'), 'varchar'), { [Sequelize.Op.iLike]: `%${search}%` })
    ];
  }

  const offset = min || 0;
  const limit = (max && min !== undefined) ? (max - min + 1) : 100;

  const { rows, count } = await PrizePayment.findAndCountAll({
    where,
    include,
    order: [['payment_date', 'DESC'], ['createdAt', 'DESC']],
    offset,
    limit,
    distinct: true
  });

  // Totals over every matching row (not just this page). Summed in JS: a GROUP BY with the
  // filtering includes (group status, member search) is rejected by Postgres.
  const allMatching = await PrizePayment.findAll({
    where,
    include: include.map((inc) => ({ ...inc, attributes: [] })),
    attributes: ['id', 'payment_type', 'amount']
  });

  let total_amount = 0;
  const by_mode = {};
  allMatching.forEach(a => {
    const amt = Number(a.amount) || 0;
    total_amount = round2(total_amount + amt);
    by_mode[a.payment_type] = round2((by_mode[a.payment_type] || 0) + amt);
  });

  const formattedRows = await Promise.all(rows.map(async (r) => {
    const p = r.toJSON();
    p.ticket_number = p.enrollment?.group_position_number;
    p.member_name = p.member?.name;
    const h = await holderNamesByEnrollment([r.enrollment_id]);
    p.holder_names = h[r.enrollment_id] || p.member_name;
    delete p.enrollment;
    delete p.member;
    return p;
  }));

  return { rows: formattedRows, total: count, total_amount, totals: { count, amount: total_amount, by_mode } };
}

/**
 * Bid Payment report (ChitCare "Report Format"):
 *   payment         – bid payments and opening-paid entries (types 1, 3) in the period
 *   advance         – bid advances (type 2) in the period
 *   adjust          – dues paid from a prize (mode 7) or from a bid advance (mode 8) in the period
 *   advance_pending – "Bid.Adv Pend (NPS)": tickets that have not won and still carry advances as of to_date
 *   all             – payment + advance + adjust, by date
 */
async function registerReport({ companyId, from_date, to_date, group_id, group_status, format = 'all' }) {
  const kindOf = { 1: 'Payment', 2: 'Advance', 3: 'Opening paid' };
  const modeLabel = { 1: 'Cash', 2: 'UPI', 3: 'Cheque', 4: 'Bank transfer' };

  const paymentRows = async (types) => {
    const r = await getAll({ companyId, payment_types: types, from_date, to_date, group_id, group_status, min: 0, max: 99999 });
    return r.rows.map((p) => ({
      kind: kindOf[p.payment_type], date: p.payment_date, number: p.voucher_number,
      group_name: p.group?.group_name, ticket_number: p.ticket_number, member_name: p.holder_names,
      auction_number: p.auction?.auction_number || null, amount: Number(p.amount),
      mode: p.payment_mode ? modeLabel[p.payment_mode] : null, account_name: p.account?.name || null,
      cheque_or_ref: p.cheque_number || p.reference_no || null
    }));
  };

  const adjustRows = async () => {
    const { ChitsInstallment } = require('../models');
    const dateWhere = {};
    if (from_date) dateWhere[Sequelize.Op.gte] = from_date;
    if (to_date) dateWhere[Sequelize.Op.lte] = to_date;
    const cps = await CustomerPayment.findAll({
      where: { payment_mode: { [Sequelize.Op.in]: [7, 8] }, payment_status: 1, ...(from_date || to_date ? { payment_date: dateWhere } : {}) },
      include: [{
        model: ChitsInstallment, as: 'installment', required: true, attributes: ['id'],
        include: [{
          model: Enrollment, as: 'enrollment', required: true, attributes: ['id', 'group_position_number', 'group_id'],
          where: { company_id: companyId, ...(group_id ? { group_id } : {}) },
          include: [{ model: ChitsGroup, as: 'group', attributes: ['group_name', 'chits_group_status'], where: groupStatusWhere(group_status), required: true }]
        }]
      }],
      order: [['payment_date', 'ASC']]
    });
    const names = await holderNamesByEnrollment(cps.map((c) => c.installment.enrollment.id));
    return cps.map((c) => ({
      kind: 'Adjust', date: c.payment_date, number: c.receipt_number,
      group_name: c.installment.enrollment.group?.group_name, ticket_number: c.installment.enrollment.group_position_number,
      member_name: names[c.installment.enrollment.id] || null, amount: Number(c.received_amount),
      from: c.payment_mode === 7 ? 'Prize' : 'Bid advance'
    }));
  };

  const advancePendingRows = async () => {
    const asOn = to_date || new Date().toISOString().slice(0, 10);
    const advEnrollIds = (await PrizePayment.findAll({
      where: { company_id: companyId, payment_type: 2, is_deleted: 0, payment_date: { [Sequelize.Op.lte]: asOn }, ...(group_id ? { group_id } : {}) },
      attributes: ['enrollment_id'], group: ['enrollment_id'], raw: true
    })).map((r) => r.enrollment_id);
    const rows = [];
    const names = await holderNamesByEnrollment(advEnrollIds);
    for (const eid of advEnrollIds) {
      const { enrollment, group, win } = await loadTicket({ companyId, enrollmentId: eid, transaction: null }).catch(() => ({}));
      if (!enrollment || win) continue; // only tickets that have not won (N.P.S.)
      if (group_status) {
        const st = Number(group.chits_group_status);
        if (Number(group_status) === 1 && st === 2) continue;
        if (Number(group_status) === 2 && st !== 2) continue;
      }
      const advanced = round2(await PrizePayment.sum('amount', { where: { enrollment_id: eid, payment_type: 2, is_deleted: 0, payment_date: { [Sequelize.Op.lte]: asOn } } }));
      const adjusted = round2(await CustomerPayment.sum('received_amount', { where: { adjust_from_enrollment_id: eid, payment_mode: 8, payment_status: 1, payment_date: { [Sequelize.Op.lte]: asOn } } }));
      const limit = round2(Number(group.chit_amount) - round2(Number(group.chit_amount) * Number(group.company_commission || 0) / 100));
      rows.push({
        group_name: group.group_name, ticket_number: enrollment.group_position_number, member_name: names[eid] || enrollment.subscriber?.name,
        advanced, adjusted, available: round2(limit - advanced - adjusted)
      });
    }
    return rows;
  };

  let rows;
  if (format === 'payment') rows = await paymentRows([1, 3]);
  else if (format === 'advance') rows = await paymentRows([2]);
  else if (format === 'adjust') rows = await adjustRows();
  else if (format === 'advance_pending') rows = await advancePendingRows();
  else rows = [...await paymentRows([1, 2, 3]), ...await adjustRows()].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const amountKey = format === 'advance_pending' ? 'advanced' : 'amount';
  const by_mode = {};
  rows.forEach((r) => { const k = r.mode || r.from || r.kind || 'Other'; by_mode[k] = round2((by_mode[k] || 0) + (r[amountKey] || 0)); });
  return { format, rows, totals: { count: rows.length, amount: round2(rows.reduce((s, r) => s + (r[amountKey] || 0), 0)), by_mode } };
}

async function getById({ companyId, id }) {
  const r = await PrizePayment.findOne({
    where: { id, company_id: companyId },
    include: [
      { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name'] },
      { model: Member, as: 'member', attributes: ['name'] },
      { model: PaymentAccount, as: 'account', attributes: ['id', 'name', 'account_type'] },
      { model: Auction, as: 'auction', attributes: ['id', 'auction_number', 'auction_date'] },
      { model: Enrollment, as: 'enrollment', attributes: ['group_position_number'] }
    ]
  });
  if (!r) throw new Error('Not found.');
  
  const p = r.toJSON();
  p.ticket_number = p.enrollment?.group_position_number;
  p.member_name = p.member?.name;
  const h = await holderNamesByEnrollment([r.enrollment_id]);
  p.holder_names = h[r.enrollment_id] || p.member_name;
  
  if (p.payment_type === 1 || p.payment_type === 3) {
    const pos = await getPosition({ companyId, auctionId: p.auction_id });
    p.position = pos.position;
  } else {
    // An advance stays viewable after its ticket wins, so read the advance figures directly.
    const { enrollment, group } = await loadTicket({ companyId, enrollmentId: p.enrollment_id, transaction: null });
    p.position = await advancePosition(enrollment, group, {});
  }

  const { Company } = require('../models');
  const comp = await Company.findOne({ where: { id: companyId } });
  p.company = { name: comp.company_name, address: comp.company_address, email: comp.company_email };
  
  return p;
}

async function deletePayment({ companyId, id, reason, user }) {
  if (user.role !== 'company') throw new Error('Only the company admin can do this.');
  if (!reason || reason.length < 3) throw new Error('Delete reason must be at least 3 characters.');

  await db.sequelize.transaction(async (transaction) => {
    const payment = await PrizePayment.findOne({ where: { id, company_id: companyId, is_deleted: 0 }, transaction });
    if (!payment) throw new Error('Not found.');

    if (payment.payment_type === 1 || payment.payment_type === 3) {
      await Auction.findOne({ where: { id: payment.auction_id }, transaction, lock: transaction.LOCK.UPDATE });
    } else {
      await Enrollment.findOne({ where: { id: payment.enrollment_id }, transaction, lock: transaction.LOCK.UPDATE });
      const { enrollment, group } = await loadTicket({ companyId, enrollmentId: payment.enrollment_id, transaction });
      const pos = await advancePosition(enrollment, group, { transaction, excludePaymentId: payment.id });
      if (pos.available < 0) {
        throw new Error('Reverse the receipts paid from this advance first.');
      }
    }

    if ((payment.payment_type === 1 || payment.payment_type === 2) && payment.account_id) {
      const account = await PaymentAccount.findOne({ where: { id: payment.account_id }, transaction, lock: transaction.LOCK.UPDATE });
      if (account) {
        await account.update({ current_balance: Number(account.current_balance) + Number(payment.amount) }, { transaction });
      }
    }

    await payment.update({
      is_deleted: 1,
      deleted_by_name: await userDisplayName(user),
      deleted_at: new Date(),
      delete_reason: reason
    }, { transaction });

    if (payment.auction_id) {
      await recalcPrizeTotals(payment.auction_id, transaction);
    } else {
      const { win } = await loadTicket({ companyId, enrollmentId: payment.enrollment_id, transaction });
      if (win) await recalcPrizeTotals(win.id, transaction);
    }
  });
}

async function payableList({ companyId, group_id, group_status, prize_status, age_bucket, as_on_date }) {
  let where = { company_id: companyId, bidder_id: { [Sequelize.Op.ne]: null } };
  
  if (group_id) where.group_id = group_id;
  if (prize_status !== undefined && prize_status !== null) {
    where.prize_status = prize_status;
  }
  
  if (!as_on_date) {
    where.prize_net_payable = { [Sequelize.Op.gt]: 0 };
  }

  const auctions = await Auction.findAll({
    where,
    include: [
      { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name', 'chits_group_status'], where: group_status ? groupStatusWhere(group_status) : {} },
      { model: Member, as: 'bidder', attributes: ['name'] }
    ],
    order: [['auction_date', 'ASC']]
  });

  const rows = [];
  let totalNet = 0;
  const ageing = { '0-30': { count: 0, net_payable: 0 }, '30-60': { count: 0, net_payable: 0 }, '60-90': { count: 0, net_payable: 0 }, '90+': { count: 0, net_payable: 0 } };

  const onDate = as_on_date ? new Date(as_on_date) : new Date();

  for (const a of auctions) {
    const en = await Enrollment.findOne({ where: { company_id: companyId, group_id: a.group_id, group_position_number: a.ticket_number } });
    if (!en) continue;

    const h = await holderNamesByEnrollment([en.id]);
    const holderNames = h[en.id] || a.bidder?.name;

    let payable = Number(a.bid_payable);
    let adjusted = Number(a.prize_adjusted_amount || 0);
    let advance = Number(a.prize_advance_amount || 0);
    let paid = Number(a.prize_paid_amount || 0);
    let net = Number(a.prize_net_payable || 0);
    let status = a.prize_status;

    if (as_on_date) {
      const adjRaw = await CustomerPayment.sum('received_amount', {
        where: { prize_auction_id: a.id, payment_mode: 7, payment_status: 1, payment_date: { [Sequelize.Op.lte]: as_on_date } }
      });
      adjusted = round2(adjRaw);
      
      const adv1Raw = await PrizePayment.sum('amount', {
        where: { enrollment_id: en.id, payment_type: 2, is_deleted: 0, payment_date: { [Sequelize.Op.lte]: as_on_date } }
      });
      const adv2Raw = await CustomerPayment.sum('received_amount', {
        where: { adjust_from_enrollment_id: en.id, payment_mode: 8, payment_status: 1, payment_date: { [Sequelize.Op.lte]: as_on_date } }
      });
      advance = round2(adv1Raw) + round2(adv2Raw);

      const pdRaw = await PrizePayment.sum('amount', {
        where: { auction_id: a.id, payment_type: { [Sequelize.Op.in]: [1, 3] }, is_deleted: 0, payment_date: { [Sequelize.Op.lte]: as_on_date } }
      });
      paid = round2(pdRaw);

      net = round2(payable - adjusted - advance - paid);
      status = net <= 0.005 ? 2 : (adjusted + advance + paid > 0 ? 1 : 0);
      
      if (prize_status !== undefined && prize_status !== null && status !== prize_status) continue;
      if (net <= 0) continue;
    }

    const auctionDate = new Date(a.auction_date);
    const diff = Math.floor((onDate - auctionDate) / (1000 * 60 * 60 * 24));
    let bucket = '90+';
    if (diff <= 30) bucket = '0-30';
    else if (diff <= 60) bucket = '30-60';
    else if (diff <= 90) bucket = '60-90';

    if (age_bucket && age_bucket !== bucket) continue;

    rows.push({
      auction_id: a.id,
      auction_number: a.auction_number,
      group_id: a.group_id,
      group_name: a.group?.group_name,
      ticket_number: a.ticket_number,
      enrollment_id: en.id,
      member_name: a.bidder?.name,
      holder_names: holderNames,
      auction_date: a.auction_date,
      prize_payable: payable,
      adjusted,
      advance,
      paid,
      net_payable: net,
      prize_status: status,
      days_since_auction: diff,
      age_bucket: bucket
    });
    totalNet += net;
    ageing[bucket].count++;
    ageing[bucket].net_payable += net;
  }

  const ageingArr = Object.keys(ageing).map(k => ({ bucket: k, count: ageing[k].count, net_payable: ageing[k].net_payable }));

  return { rows, totals: { count: rows.length, net_payable: totalNet }, ageing: ageingArr };
}

async function applyToDues({ companyId, auction_id, chits_installment_id, amount, payment_date, narration, user }) {
  await db.sequelize.transaction(async (transaction) => {
    const a = await Auction.findOne({ where: { id: auction_id, company_id: companyId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!a) throw new Error('Auction not found.');
    const en = await Enrollment.findOne({ where: { company_id: companyId, group_id: a.group_id, group_position_number: a.ticket_number }, transaction });
    if (!en) throw new Error('Ticket not found.');

    const { enrollment, win } = await loadTicket({ companyId, enrollmentId: en.id, transaction });

    const { ChitsInstallment } = require('../models');
    const inst = await ChitsInstallment.findOne({ where: { id: chits_installment_id }, transaction });
    if (!inst) throw new Error('Installment not found.');
    if (inst.enrollment_id !== en.id) {
      throw new Error("Only this ticket's own dues can be paid from its prize.");
    }

    const { getInstallmentBalance } = require('./installmentBalanceHelper');
    const paid = await getInstallmentBalance(inst.id);
    const due = round2(Number(inst.payable_amount) - paid);

    if (Number(amount) > due + 0.005) {
      throw new Error(`Amount cannot be more than the installment due (₹${due}).`);
    }
    
    const pos = await prizePosition(a, en, { transaction });
    if (Number(amount) > pos.net + 0.005) {
      throw new Error(`Amount cannot be more than the net payable (₹${pos.net}).`);
    }

    const rn = await generateReceiptNumber(companyId, transaction);
    const pDate = payment_date || new Date().toISOString().slice(0, 10);

    await CustomerPayment.create({
      chits_installment_id,
      received_amount: amount,
      payment_status: 1,
      payment_mode: 7,
      payment_date: pDate,
      receipt_number: rn,
      recorded_by_id: user.id,
      recorded_by_role: user.role,
      recorded_by_name: await userDisplayName(user),
      cash_amount: 0,
      upi_amount: 0,
      bank_amount: 0,
      narration: narration || `Paid from prize of auction #${a.auction_number}`,
      prize_auction_id: a.id,
      adjust_from_enrollment_id: en.id
    }, { transaction });

    await recalcPrizeTotals(a.id, transaction);
  });
}

async function advanceToDues({ companyId, enrollment_id, chits_installment_id, amount, payment_date, narration, user }) {
  await db.sequelize.transaction(async (transaction) => {
    const { enrollment, group, win } = await loadTicket({ companyId, enrollmentId: enrollment_id, transaction });
    if (win) throw new Error('This ticket has already won; use mode 7 (Prize Adjustment).');
    
    await Enrollment.findOne({ where: { id: enrollment.id }, transaction, lock: transaction.LOCK.UPDATE });

    const { ChitsInstallment } = require('../models');
    const inst = await ChitsInstallment.findOne({ where: { id: chits_installment_id }, transaction });
    if (!inst) throw new Error('Installment not found.');
    if (inst.enrollment_id !== enrollment.id) {
      throw new Error("Only this ticket's own dues can be paid from its advance.");
    }

    const { getInstallmentBalance } = require('./installmentBalanceHelper');
    const paid = await getInstallmentBalance(inst.id);
    const due = round2(Number(inst.payable_amount) - paid);

    if (Number(amount) > due + 0.005) {
      throw new Error(`Amount cannot be more than the installment due (₹${due}).`);
    }
    
    const pos = await advancePosition(enrollment, group, { transaction });
    if (Number(amount) > pos.available + 0.005) {
      throw new Error(`Amount cannot be more than the advance available (₹${pos.available}).`);
    }

    const rn = await generateReceiptNumber(companyId, transaction);
    const pDate = payment_date || new Date().toISOString().slice(0, 10);

    await CustomerPayment.create({
      chits_installment_id,
      received_amount: amount,
      payment_status: 1,
      payment_mode: 8,
      payment_date: pDate,
      receipt_number: rn,
      recorded_by_id: user.id,
      recorded_by_role: user.role,
      recorded_by_name: await userDisplayName(user),
      cash_amount: 0,
      upi_amount: 0,
      bank_amount: 0,
      narration: narration || `Paid from bid advance`,
      adjust_from_enrollment_id: enrollment.id
    }, { transaction });

  });
}

async function reverseAdjustment({ companyId, customer_payment_id, reason, user }) {
  if (user.role !== 'company') throw new Error('Only the company admin can do this.');
  
  await db.sequelize.transaction(async (transaction) => {
    const cp = await CustomerPayment.findOne({ 
      where: { id: customer_payment_id, payment_mode: { [Sequelize.Op.in]: [7, 8] }, payment_status: 1 }, 
      include: [{
        model: require('../models').ChitsInstallment, as: 'installment', required: true, attributes: ['id'],
        include: [{ model: Enrollment, as: 'enrollment', required: true, attributes: ['id'], where: { company_id: companyId } }]
      }],
      transaction 
    });
    if (!cp) throw new Error('Not found.');

    if (cp.payment_mode === 7) {
      await Auction.findOne({ where: { id: cp.prize_auction_id }, transaction, lock: transaction.LOCK.UPDATE });
    } else {
      await Enrollment.findOne({ where: { id: cp.adjust_from_enrollment_id }, transaction, lock: transaction.LOCK.UPDATE });
    }

    await cp.update({
      payment_status: 3,
      narration: (cp.narration || '') + ` (Reversed: ${reason})`
    }, { transaction });

    if (cp.prize_auction_id) {
      await recalcPrizeTotals(cp.prize_auction_id, transaction);
    } else if (cp.adjust_from_enrollment_id) {
      const { win } = await loadTicket({ companyId, enrollmentId: cp.adjust_from_enrollment_id, transaction });
      if (win) await recalcPrizeTotals(win.id, transaction);
    }
  });
}

module.exports = {
  recalcPrizeTotals,
  ticketSearch,
  getPosition,
  advancePositionEndpoint,
  storeOrUpdate,
  getAll,
  registerReport,
  getById,
  deletePayment,
  payableList,
  applyToDues,
  advanceToDues,
  reverseAdjustment,
  loadTicket,
  prizePosition,
  advancePosition
};
