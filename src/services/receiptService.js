const { CustomerPayment, ChitsInstallment, Enrollment, ChitsGroup, PaymentAccount, MemberAdvance, Company, sequelize } = require('../models');
const fcmService = require('./fcmService');
const chargeService = require('./chargeService');
const { holderMembersOf } = require('../utils/jointHolders');
const { assertAdmin, assertReason, actorName, enforceLock, MoneyRuleError } = require('../utils/moneyControls');

/**
 * Cancelling a wrong receipt (docs/MONEY_FLOW_BATCH2_3.md §2.4). Company admin only, with a
 * reason; Transaction Lock Days applies. The receipt keeps its number and is marked reversed
 * (payment_status 3), so the instalment reopens (only status 1 counts as paid). The money
 * comes back out of the accounts it went into; a "from advance" receipt returns its amount
 * to the advance. Prize / bid-advance adjustments (modes 7, 8) keep their own Reverse.
 */
async function cancelReceipt({ companyId, customer_payment_id, reason, override_reason, user }) {
  assertAdmin(user, 'cancel a receipt');
  const why = assertReason(reason, 'a reason for cancelling the receipt');
  const byName = await actorName(user);
  const result = await sequelize.transaction((transaction) => cancelInTransaction({ companyId, customer_payment_id, why, byName, override_reason, user, transaction }));
  notifyCancelled(result.cp, result.enrollmentId, why);
  return result.cp;
}

/** The cancellation itself, inside the caller's transaction (also used by "Cheque returned"). */
async function cancelInTransaction({ companyId, customer_payment_id, why, byName, override_reason, user, transaction }) {
  {
    const cp = await CustomerPayment.findByPk(customer_payment_id, { transaction, lock: true });
    if (!cp) throw new Error('Receipt not found.');
    const inst = await ChitsInstallment.findByPk(cp.chits_installment_id, { transaction });
    const enrollment = inst && await Enrollment.findByPk(inst.enrollment_id, { transaction });
    const group = enrollment && await ChitsGroup.findByPk(enrollment.group_id, { attributes: ['company_id'], transaction });
    if (!group || group.company_id !== companyId) throw new Error('Receipt not found.');

    if (cp.payment_status === 3) throw new MoneyRuleError('This receipt is already cancelled.', 'ALREADY_CANCELLED');
    if (cp.payment_status !== 1) throw new MoneyRuleError('Only a verified receipt can be cancelled. Reject a pending collection from Agent Collections Verification.', 'NOT_VERIFIED');
    if ([7, 8].includes(Number(cp.payment_mode))) throw new MoneyRuleError('This receipt paid dues from a prize or bid advance. Use Reverse on it.', 'USE_REVERSE');
    await enforceLock({ companyId, user, entity: 'receipt', entityId: cp.id, action: 'cancel', dates: [cp.payment_date], overrideReason: override_reason, transaction });

    // Take the money back out of the accounts it went into.
    const parts = [
      { amount: Number(cp.cash_amount) || 0, id: cp.cash_account_id, type: 'CASH' },
      { amount: Number(cp.upi_amount) || 0, id: cp.upi_account_id, type: 'UPI' },
      { amount: Number(cp.bank_amount) || 0, id: cp.bank_account_id, type: 'BANK' },
    ].filter((p) => p.amount > 0);
    for (const p of parts) {
      if (!p.id && p.type === 'CASH') {
        // Receipts from before cash accounts were recorded went to the oldest active Cash account.
        const legacy = await PaymentAccount.findOne({ where: { company_id: companyId, account_type: 'CASH', is_active: true }, order: [['id', 'ASC']], transaction });
        p.id = legacy?.id;
      }
      if (!p.id) throw new Error(`This receipt's ${p.type.toLowerCase()} account isn't recorded, so it can't be reversed automatically.`);
    }
    const ids = [...new Set(parts.map((p) => p.id))].sort((a, b) => a - b);
    const accs = Object.fromEntries((await PaymentAccount.findAll({ where: { id: ids, company_id: companyId }, transaction, lock: true })).map((a) => [a.id, a]));
    for (const p of parts) {
      const a = accs[p.id];
      if (!a) throw new Error('The account this receipt was paid into no longer exists.');
      a.current_balance = Number(a.current_balance) - p.amount;
    }
    for (const a of Object.values(accs)) {
      if (Number(a.current_balance) < 0) throw new MoneyRuleError(`${a.name} would go below zero. Move money into it first, then cancel.`, 'INSUFFICIENT');
    }
    for (const a of Object.values(accs)) await a.save({ transaction });

    // A receipt paid from an advance gives the amount back to that advance.
    if (cp.member_advance_id) {
      const adv = await MemberAdvance.findByPk(cp.member_advance_id, { transaction, lock: true });
      if (adv) await adv.update({ balance: Number(adv.balance) + Number(cp.received_amount) + Number(cp.penalty_paid || 0) }, { transaction });
    }

    // Charges this receipt paid are due again.
    await chargeService.reopenChargesForReceipt({ receiptId: cp.id, transaction });

    await cp.update({ payment_status: 3, reversed_at: new Date(), reversed_by_name: byName, reverse_reason: why }, { transaction });
    return { cp, enrollmentId: enrollment.id };
  }
}

async function notifyCancelled(cp, enrollmentId, why) {
  try {
    for (const holder of await holderMembersOf([enrollmentId])) {
      fcmService.sendPushToMember(holder, 'Receipt cancelled', `Receipt ${cp.receipt_number} has been cancelled: ${why}`, { type: 'RECEIPT_CANCELLED', receipt_number: String(cp.receipt_number || '') });
    }
  } catch (e) {
    console.error('Failed to send receipt-cancelled push:', e.message);
  }
}

/**
 * A cheque on a receipt came back unpaid (docs/MONEY_FLOW_BATCH2_3.md §3.2): cancel the receipt
 * and add the company's cheque-return charge to the ticket, together. Admin only.
 */
async function chequeReturned({ companyId, customer_payment_id, reason, override_reason, user }) {
  assertAdmin(user, 'mark a cheque returned');
  const why = assertReason(reason, 'what happened to the cheque');
  const byName = await actorName(user);
  const result = await sequelize.transaction(async (transaction) => {
    const before = await CustomerPayment.findByPk(customer_payment_id, { transaction });
    if (!before) throw new Error('Receipt not found.');
    if (!(Number(before.bank_amount) > 0) && !before.cheque_number) {
      throw new MoneyRuleError('This receipt has no cheque or bank payment.', 'NO_CHEQUE');
    }
    const out = await cancelInTransaction({ companyId, customer_payment_id, why: `Cheque returned: ${why}`, byName, override_reason, user, transaction });
    const company = await Company.findByPk(companyId, { attributes: ['cheque_return_charges'], transaction });
    const fee = Number(company?.cheque_return_charges) || 0;
    out.charge = fee > 0
      ? await chargeService.addCharge({ companyId, enrollment_id: out.enrollmentId, charge_type: chargeService.CHARGE_TYPES.CHEQUE_RETURN, amount: fee, reason: `Cheque ${before.cheque_number || ''} returned`.trim(), source_ref: `receipt:${before.receipt_number}`, byName, transaction })
      : null;
    return out;
  });
  notifyCancelled(result.cp, result.enrollmentId, `Cheque returned: ${why}`);
  return { receipt: result.cp, charge: result.charge };
}

module.exports = { cancelReceipt, chequeReturned };
