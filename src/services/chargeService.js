const { TicketCharge, ReceiptChargeLine, Enrollment, ChitsGroup, ChitsInstallment, CustomerPayment, Company, Member, PenaltyWaiver, sequelize } = require('../models');
const { Op } = require('sequelize');
const { assertAdmin, assertReason, actorName, MoneyRuleError, todayIST } = require('../utils/moneyControls');

/**
 * Ticket charges (docs/MONEY_FLOW_BATCH2_3.md §3): dues of a ticket besides instalments.
 * They are collected on a receipt (its cash/UPI/bank split covers them), waived by the
 * admin with a reason, and reopen if that receipt is cancelled.
 */
const CHARGE_TYPES = { ENROLLMENT_FEE: 'ENROLLMENT_FEE', NOTICE: 'NOTICE', CHEQUE_RETURN: 'CHEQUE_RETURN', OTHER: 'OTHER' };
const STATUS = { DUE: 0, PAID: 1, WAIVED: 2, CANCELLED: 3 };
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const dueOf = (c) => r2(Number(c.amount) - Number(c.paid_amount) - Number(c.waived_amount));
const statusFor = (c) => (dueOf(c) > 0.004 ? STATUS.DUE : Number(c.waived_amount) > 0 && Number(c.paid_amount) === 0 ? STATUS.WAIVED : STATUS.PAID);

/** The ticket (enrollment) checked against the company; `group` is loaded for its fee. */
async function ticketOf(companyId, enrollmentId, transaction) {
  const enrollment = await Enrollment.findOne({ where: { id: enrollmentId, company_id: companyId }, transaction });
  if (!enrollment) throw new Error('Ticket not found.');
  return enrollment;
}

async function addCharge({ companyId, enrollment_id, charge_type, amount, reason = null, source_ref = null, charge_date = null, byName = null, transaction }) {
  const amt = r2(amount);
  if (!(amt > 0)) throw new Error('Charge amount must be greater than zero.');
  if (!Object.values(CHARGE_TYPES).includes(charge_type)) throw new Error('Unknown charge type.');
  return TicketCharge.create({
    company_id: companyId, enrollment_id, charge_type, amount: amt, charge_date: charge_date || todayIST(),
    reason, source_ref, created_by_name: byName, status: STATUS.DUE,
  }, { transaction });
}

/**
 * Enrollment fee when a ticket is enrolled: the group's fee, or the company's default when the
 * group leaves it empty. None for company seats or a zero fee.
 */
async function addEnrollmentFee({ enrollment, group, subscriber, transaction }) {
  if (!enrollment || subscriber?.group_status === 1) return null;
  let fee = group?.enrollment_fee;
  if (fee === null || fee === undefined || fee === '') {
    const company = await Company.findByPk(enrollment.company_id, { attributes: ['enrollment_charges'], transaction });
    fee = company?.enrollment_charges;
  }
  if (!(Number(fee) > 0)) return null;
  return addCharge({
    companyId: enrollment.company_id, enrollment_id: enrollment.id, charge_type: CHARGE_TYPES.ENROLLMENT_FEE,
    amount: fee, charge_date: String(enrollment.enrollment_date || todayIST()).slice(0, 10), reason: 'Enrollment fee', source_ref: `enrollment:${enrollment.id}`, transaction,
  });
}

/** Charges of a ticket with what is still due; `onlyDue` hides paid, waived and cancelled ones. */
async function listForEnrollment({ companyId, enrollment_id, onlyDue = false }) {
  await ticketOf(companyId, enrollment_id);
  const rows = await TicketCharge.findAll({ where: { company_id: companyId, enrollment_id, ...(onlyDue ? { status: STATUS.DUE } : {}) }, order: [['charge_date', 'ASC'], ['id', 'ASC']] });
  return rows.map((c) => ({ ...c.toJSON(), due_amount: dueOf(c) }));
}

/** Admin adds an "Other" charge to a ticket by hand. */
async function addOtherCharge({ companyId, enrollment_id, amount, reason, user }) {
  assertAdmin(user, 'add a charge');
  const why = assertReason(reason, 'what the charge is for');
  await ticketOf(companyId, enrollment_id);
  return addCharge({ companyId, enrollment_id, charge_type: CHARGE_TYPES.OTHER, amount, reason: why, byName: await actorName(user) });
}

/** Admin forgives a charge (all of what is due, or part of it), with a reason. No money moves. */
async function waiveCharge({ companyId, id, amount, reason, user }) {
  assertAdmin(user, 'waive a charge');
  const why = assertReason(reason, 'a reason for waiving');
  const byName = await actorName(user);
  return sequelize.transaction(async (transaction) => {
    const c = await TicketCharge.findOne({ where: { id, company_id: companyId }, transaction, lock: true });
    if (!c) throw new Error('Charge not found.');
    const due = dueOf(c);
    if (c.status === STATUS.CANCELLED || due <= 0) throw new MoneyRuleError('Nothing is due on this charge.', 'NOTHING_DUE');
    const amt = amount === undefined || amount === null || amount === '' ? due : r2(amount);
    if (!(amt > 0) || amt > due + 0.004) throw new MoneyRuleError(`Waive between ₹0.01 and ₹${due.toFixed(2)}.`, 'WAIVE_RANGE');
    c.waived_amount = r2(Number(c.waived_amount) + amt);
    c.status = statusFor(c);
    c.waive_reason = c.waive_reason ? `${c.waive_reason}; ${why}` : why;
    c.waived_by_name = byName;
    c.waived_at = new Date();
    await c.save({ transaction });
    return { ...c.toJSON(), due_amount: dueOf(c) };
  });
}

/**
 * Checks the charges a receipt pays: same ticket, still due, amount ≤ due. Returns locked rows
 * and the total. Called inside the receipt's transaction before the receipt is created.
 */
async function lockChargesForReceipt({ companyId, enrollment_id, charges, transaction }) {
  const wanted = (charges || []).filter((c) => Number(c.amount) > 0);
  if (!wanted.length) return { rows: [], total: 0 };
  const ids = [...new Set(wanted.map((c) => Number(c.ticket_charge_id)))].sort((a, b) => a - b);
  if (ids.length !== wanted.length) throw new MoneyRuleError('A charge is listed twice.', 'DUPLICATE_CHARGE');
  const rows = await TicketCharge.findAll({ where: { id: ids, company_id: companyId }, transaction, lock: true });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  let total = 0;
  const out = [];
  for (const w of wanted) {
    const c = byId[Number(w.ticket_charge_id)];
    if (!c || c.enrollment_id !== Number(enrollment_id)) throw new MoneyRuleError('A charge does not belong to this ticket.', 'CHARGE_NOT_ON_TICKET');
    if (c.status === STATUS.CANCELLED) throw new MoneyRuleError('A charge has been cancelled.', 'CHARGE_CANCELLED');
    const amt = r2(w.amount);
    if (amt > dueOf(c) + 0.004) throw new MoneyRuleError(`Only ₹${dueOf(c).toFixed(2)} is due on the ${c.charge_type.replace('_', ' ').toLowerCase()} charge.`, 'CHARGE_EXCEEDS_DUE');
    total = r2(total + amt);
    out.push({ row: c, amount: amt });
  }
  return { rows: out, total };
}

/** After the receipt exists: record its charge lines and mark the charges paid. */
async function applyChargesToReceipt({ receiptId, locked, transaction }) {
  for (const { row, amount } of locked) {
    await ReceiptChargeLine.create({ customer_payment_id: receiptId, ticket_charge_id: row.id, amount }, { transaction });
    row.paid_amount = r2(Number(row.paid_amount) + amount);
    row.status = statusFor(row);
    await row.save({ transaction });
  }
}

/** A cancelled receipt gives its charge payments back: those charges are due again. */
async function reopenChargesForReceipt({ receiptId, transaction }) {
  const lines = await ReceiptChargeLine.findAll({ where: { customer_payment_id: receiptId }, transaction });
  for (const line of lines) {
    const c = await TicketCharge.findByPk(line.ticket_charge_id, { transaction, lock: true });
    if (!c) continue;
    c.paid_amount = r2(Math.max(0, Number(c.paid_amount) - Number(line.amount)));
    c.status = statusFor(c);
    await c.save({ transaction });
  }
}

/**
 * Notice charges are posted only when the office decides to (never on preview): one charge
 * per ticket at the notice's incidental charge. A ticket already charged for the same notice
 * (type and date) is skipped, so posting twice does not charge twice.
 */
async function postNoticeCharges({ companyId, enrollment_ids, amount, notice_type, notice_date, user }) {
  const amt = r2(amount);
  if (!(amt > 0)) throw new Error('Notice charge must be greater than zero.');
  if (!Array.isArray(enrollment_ids) || !enrollment_ids.length) throw new Error('No tickets to charge.');
  const ref = `notice:${String(notice_type || 'NOTICE').toUpperCase()}:${String(notice_date || todayIST()).slice(0, 10)}`;
  const byName = await actorName(user);
  return sequelize.transaction(async (transaction) => {
    const tickets = await Enrollment.findAll({ where: { id: enrollment_ids, company_id: companyId }, attributes: ['id'], transaction });
    if (tickets.length !== new Set(enrollment_ids.map(Number)).size) throw new Error('A ticket was not found.');
    const already = new Set((await TicketCharge.findAll({ where: { company_id: companyId, enrollment_id: enrollment_ids, source_ref: ref, status: { [Op.ne]: STATUS.CANCELLED } }, attributes: ['enrollment_id'], transaction })).map((c) => c.enrollment_id));
    const created = [];
    for (const t of tickets) {
      if (already.has(t.id)) continue;
      created.push(await addCharge({ companyId, enrollment_id: t.id, charge_type: CHARGE_TYPES.NOTICE, amount: amt, reason: `${String(notice_type || 'Notice').toUpperCase()} notice`, source_ref: ref, charge_date: String(notice_date || todayIST()).slice(0, 10), byName, transaction }));
    }
    return { charged: created.length, skipped: already.size };
  });
}

/**
 * Admin forgives penalty on an instalment (all that is owed, or part), with a reason. The penalty
 * accrues by adding to the instalment's penalty, so reducing it there keeps the waiver.
 */
async function waivePenalty({ companyId, chits_installment_id, amount, reason, user }) {
  assertAdmin(user, 'waive a penalty');
  const why = assertReason(reason, 'a reason for waiving the penalty');
  const byName = await actorName(user);
  return sequelize.transaction(async (transaction) => {
    const inst = await ChitsInstallment.findByPk(chits_installment_id, { transaction, lock: true });
    if (!inst) throw new Error('Instalment not found.');
    const enrollment = await Enrollment.findByPk(inst.enrollment_id, { attributes: ['id', 'company_id', 'group_id'], transaction });
    const group = enrollment && await ChitsGroup.findByPk(enrollment.group_id, { attributes: ['company_id'], transaction });
    if (!group || group.company_id !== companyId) throw new Error('Instalment not found.');
    const paid = Number(await CustomerPayment.sum('penalty_paid', { where: { chits_installment_id: inst.id, payment_status: 1 }, transaction })) || 0;
    const owed = r2(Number(inst.penalty_amount || 0) - paid);
    if (owed <= 0) throw new MoneyRuleError('No penalty is owed on this instalment.', 'NOTHING_DUE');
    const amt = amount === undefined || amount === null || amount === '' ? owed : r2(amount);
    if (!(amt > 0) || amt > owed + 0.004) throw new MoneyRuleError(`Waive between ₹0.01 and ₹${owed.toFixed(2)}.`, 'WAIVE_RANGE');
    await inst.update({ penalty_amount: r2(Number(inst.penalty_amount) - amt) }, { transaction });
    await PenaltyWaiver.create({ company_id: companyId, chits_installment_id: inst.id, amount: amt, reason: why, waived_by_name: byName }, { transaction });
    return { chits_installment_id: inst.id, waived: amt, penalty_owed: r2(owed - amt) };
  });
}

module.exports = {
  CHARGE_TYPES, STATUS, dueOf,
  addCharge, addEnrollmentFee, addOtherCharge, listForEnrollment, waiveCharge,
  lockChargesForReceipt, applyChargesToReceipt, reopenChargesForReceipt,
  postNoticeCharges, waivePenalty,
};
