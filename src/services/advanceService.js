const { MemberAdvance, AdvanceRefund, PaymentAccount, Member, sequelize } = require('../models');
const { generateReceiptNumber } = require('../utils/receiptGenerator');
const { assertAdmin, assertReason, actorName, enforceLock, MoneyRuleError, todayIST } = require('../utils/moneyControls');

/**
 * Advances at the office counter (docs/MONEY_FLOW_BATCH2_3.md §3.4). Taking one is a receipt:
 * money into a chosen account, with a receipt number; it is then used against instalments
 * exactly like an agent's excess. A refund of unused advance is admin only, with a reason,
 * out of a chosen account.
 */
const PAYMENT_TYPE = { CASH: 1, UPI: 2, BANK: 3 };
const r2 = (n) => Math.round(Number(n) * 100) / 100;

/** Locks and checks an account: this company's, active. */
async function lockAccount(companyId, accountId, transaction) {
  const account = await PaymentAccount.findOne({ where: { id: accountId, company_id: companyId }, transaction, lock: true });
  if (!account) throw new MoneyRuleError('Account not found.', 'ACCOUNT_NOT_FOUND');
  if (!account.is_active) throw new MoneyRuleError(`Account "${account.name}" is inactive.`, 'ACCOUNT_INACTIVE');
  return account;
}

async function takeAdvance({ companyId, member_id, amount, account_id, date, narration, override_reason, user }) {
  const amt = r2(amount);
  if (!(amt > 0)) throw new Error('Advance amount must be greater than zero.');
  if (!account_id) throw new MoneyRuleError('Choose the account the advance is paid into.', 'ACCOUNT_REQUIRED');
  const byName = await actorName(user);
  const day = String(date || todayIST()).slice(0, 10);
  return sequelize.transaction(async (transaction) => {
    const member = await Member.findOne({ where: { id: member_id, company_id: companyId }, attributes: ['id', 'name'], transaction });
    if (!member) throw new Error('Member not found.');
    await enforceLock({ companyId, user, entity: 'advance', action: 'create', dates: [day], overrideReason: override_reason, transaction });
    const account = await lockAccount(companyId, account_id, transaction);
    account.current_balance = r2(Number(account.current_balance) + amt);
    await account.save({ transaction });
    const receipt_number = await generateReceiptNumber(companyId, transaction);
    return MemberAdvance.create({
      company_id: companyId, member_id: member.id, account_id: account.id,
      payment_type: PAYMENT_TYPE[account.account_type] || PAYMENT_TYPE.BANK,
      amount: amt, balance: amt, date: day, receipt_number, created_by_name: byName,
      narration: narration || 'Advance taken at the office',
    }, { transaction });
  });
}

async function refundAdvance({ companyId, member_advance_id, amount, account_id, date, reason, override_reason, user }) {
  assertAdmin(user, 'refund an advance');
  const why = assertReason(reason, 'a reason for the refund');
  if (!account_id) throw new MoneyRuleError('Choose the account the refund is paid from.', 'ACCOUNT_REQUIRED');
  const byName = await actorName(user);
  const day = String(date || todayIST()).slice(0, 10);
  return sequelize.transaction(async (transaction) => {
    const adv = await MemberAdvance.findOne({ where: { id: member_advance_id, company_id: companyId }, transaction, lock: true });
    if (!adv) throw new Error('Advance not found.');
    const balance = r2(adv.balance);
    const amt = amount === undefined || amount === null || amount === '' ? balance : r2(amount);
    if (!(amt > 0) || amt > balance + 0.004) throw new MoneyRuleError(`Refund between ₹0.01 and ₹${balance.toFixed(2)} (the unused advance).`, 'REFUND_RANGE');
    await enforceLock({ companyId, user, entity: 'advance_refund', entityId: adv.id, action: 'create', dates: [day], overrideReason: override_reason, transaction });
    const account = await lockAccount(companyId, account_id, transaction);
    if (Number(account.current_balance) < amt) throw new MoneyRuleError(`Insufficient balance in ${account.name}.`, 'INSUFFICIENT');
    account.current_balance = r2(Number(account.current_balance) - amt);
    await account.save({ transaction });
    await adv.update({ balance: r2(balance - amt) }, { transaction });
    return AdvanceRefund.create({ company_id: companyId, member_advance_id: adv.id, account_id: account.id, amount: amt, refund_date: day, reason: why, refunded_by_name: byName }, { transaction });
  });
}

module.exports = { takeAdvance, refundAdvance };
