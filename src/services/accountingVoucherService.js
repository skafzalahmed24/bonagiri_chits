const { AccountingVoucher, AccountingVoucherLine, PaymentAccount, AccountCreationDetail, sequelize } = require('../models');
const { Op } = require('sequelize');
const { resolveCompanyIdForAuth } = require('./adminService');
const MODULES = require('../utils/modules');
const { statusFilter, cancelStamp } = require('../utils/cancellable');
const { assertAdmin, assertReason, actorName, enforceLock, MoneyRuleError } = require('../utils/moneyControls');

// Receipts (CR, BD) add to the payment account; payments (CP, BP) take from it.
const balanceSign = (voucherType) => (voucherType === 'CR' || voucherType === 'BD' ? 1 : -1);

const checkAccountType = (voucherType, accountType) => {
  if (['CR', 'CP'].includes(voucherType) && accountType !== 'CASH') return 'Cash vouchers require a CASH account';
  if (['BD', 'BP'].includes(voucherType) && !['BANK', 'UPI'].includes(accountType)) return 'Bank vouchers require a BANK or UPI account';
  return null;
};

const VOUCHER_MODULES = { CR: MODULES.T_CASH_RECEIPTS, CP: MODULES.T_CASH_PAYMENTS, BD: MODULES.T_BANK_DEPOSITS, BP: MODULES.T_BANK_PAYMENTS };
const checkPermission = (user, voucherType) => {
  if (user.role === 'company') return;
  const reqModule = VOUCHER_MODULES[voucherType];
  if (!user.permissions?.[reqModule]?.view) {
    throw new Error("You don't have permission to access this module");
  }
};

/**
 * What a voucher does to account balances: its own account by type, and for a Bank Deposit
 * of office cash, the Cash account it came out of (docs/MONEY_FLOW_BATCH2_3.md §2.6).
 */
const effectsOf = ({ voucher_type, account_id, source_account_id, total_amount }) => {
  const total = Number(total_amount);
  const out = [{ account_id: Number(account_id), delta: balanceSign(voucher_type) * total }];
  if (voucher_type === 'BD' && source_account_id) out.push({ account_id: Number(source_account_id), delta: -total });
  return out;
};

const include = [
  { model: PaymentAccount, as: 'payment_account', attributes: ['id', 'name', 'account_type'] },
  { model: PaymentAccount, as: 'source_account', attributes: ['id', 'name', 'account_type'] },
];

/** Next number for this company and type; cancelled vouchers keep theirs, so look at all of them. */
async function nextVoucherNumber(company_id, voucher_type, transaction) {
  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `voucher-${company_id}-${voucher_type}` }, transaction });
  const all = await AccountingVoucher.unscoped().findAll({ where: { voucher_type, company_id }, attributes: ['voucher_number'], transaction });
  const max = all.reduce((m, v) => {
    const n = parseInt(String(v.voucher_number || '').split('-').pop(), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${voucher_type}-${String(max + 1).padStart(4, '0')}`;
}

class AccountingVoucherService {
  async getAllVouchers(params, user) {
    const company_id = await resolveCompanyIdForAuth(user);
    const { voucher_type, from_date, to_date, search, min = 1, max = 50, status } = params;

    const where = { company_id, ...statusFilter(status) };
    if (voucher_type) where.voucher_type = voucher_type;
    if (from_date && to_date) where.transaction_date = { [Op.between]: [from_date, to_date] };
    if (search) {
      where[Op.or] = [
        { voucher_number: { [Op.like]: `%${search}%` } },
        { narration: { [Op.like]: `%${search}%` } },
      ];
    }

    const limit = parseInt(max, 10);
    const offset = (parseInt(min, 10) - 1) * limit;
    const { count, rows } = await AccountingVoucher.unscoped().findAndCountAll({
      where,
      limit,
      offset,
      order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
      include,
    });
    return { total: count, rows };
  }

  async getVoucherById(id, user) {
    const company_id = await resolveCompanyIdForAuth(user);
    const voucher = await AccountingVoucher.unscoped().findOne({
      where: { id, company_id },
      include: [
        ...include,
        { model: AccountingVoucherLine, as: 'lines', include: [{ model: AccountCreationDetail, as: 'particulars_account', attributes: ['id', 'account_name'] }] },
      ],
      order: [[{ model: AccountingVoucherLine, as: 'lines' }, 'created_at', 'ASC']],
    });
    if (voucher) checkPermission(user, voucher.voucher_type);
    return voucher;
  }

  async storeOrUpdateVoucher(data, user) {
    const company_id = await resolveCompanyIdForAuth(user);
    const { id, voucher_type, transaction_date, account_id, narration, lines, override_reason } = data;
    // Only a Bank Deposit has a source; "Other" (cheque, party transfer) sends none.
    const source_account_id = voucher_type === 'BD' && data.source_account_id ? Number(data.source_account_id) : null;

    if (!account_id) throw new Error('Header account_id is required.');
    if (!lines || lines.length === 0) throw new Error('At least one line is required.');
    const total_amount = lines.reduce((sum, line) => sum + parseFloat(line.amount || 0), 0);
    if (total_amount <= 0) throw new Error('Voucher total must be greater than zero.');
    if (id) assertAdmin(user, 'edit a voucher');

    const transaction = await sequelize.transaction();
    let voucherId;
    try {
      let voucher = null;
      if (id) {
        voucher = await AccountingVoucher.findOne({ where: { id, company_id }, transaction, lock: true });
        if (!voucher) throw new Error('Voucher not found or cancelled.');
        checkPermission(user, voucher.voucher_type);
        await enforceLock({ companyId: company_id, user, entity: 'voucher', entityId: voucher.id, action: 'edit', dates: [voucher.transaction_date, transaction_date], overrideReason: override_reason, transaction });
      } else {
        checkPermission(user, voucher_type);
        await enforceLock({ companyId: company_id, user, entity: 'voucher', action: 'create', dates: [transaction_date], overrideReason: override_reason, transaction });
      }

      const oldEffects = voucher ? effectsOf(voucher) : [];
      const newEffects = effectsOf({ voucher_type, account_id, source_account_id, total_amount });
      const ids = [...new Set([...oldEffects, ...newEffects].map((e) => e.account_id))].sort((a, b) => a - b);
      const rows = await PaymentAccount.findAll({ where: { id: ids, company_id }, transaction, lock: true });
      const accs = Object.fromEntries(rows.map((a) => [a.id, a]));

      const target = accs[Number(account_id)];
      if (!target) throw new Error('Payment account not found.');
      if (!target.is_active) throw new Error('Selected account is inactive');
      const typeError = checkAccountType(voucher_type, target.account_type);
      if (typeError) throw new Error(typeError);
      if (source_account_id) {
        const src = accs[source_account_id];
        if (!src) throw new Error('Source Cash account not found.');
        if (src.account_type !== 'CASH') throw new Error('The source of office cash must be a CASH account');
        if (!src.is_active) throw new Error('Source Cash account is inactive');
      }

      for (const e of oldEffects) if (accs[e.account_id]) accs[e.account_id].current_balance = Number(accs[e.account_id].current_balance) - e.delta;
      for (const e of newEffects) accs[e.account_id].current_balance = Number(accs[e.account_id].current_balance) + e.delta;
      for (const a of Object.values(accs)) {
        if (Number(a.current_balance) < 0) throw new Error(`Insufficient balance in ${a.name}`);
      }
      for (const a of Object.values(accs)) await a.save({ transaction });

      if (voucher) {
        await voucher.update({ voucher_type, transaction_date, account_id, source_account_id, narration, total_amount }, { transaction });
        await AccountingVoucherLine.destroy({ where: { voucher_id: voucher.id }, transaction });
      } else {
        const voucher_number = await nextVoucherNumber(company_id, voucher_type, transaction);
        voucher = await AccountingVoucher.create({ company_id, voucher_type, voucher_number, transaction_date, account_id, source_account_id, narration, total_amount }, { transaction });
      }

      await AccountingVoucherLine.bulkCreate(lines.map((line) => ({
        voucher_id: voucher.id,
        particulars_account_id: line.particulars_account_id,
        narration: line.narration,
        amount: line.amount,
        cheque_number: line.cheque_number || null,
        cheque_date: line.cheque_date || null,
        bank_name: line.bank_name || null,
        place: line.place || null,
      })), { transaction });

      await transaction.commit();
      voucherId = voucher.id;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    return this.getVoucherById(voucherId, user);
  }

  /** Cancel: undo the voucher's balance effects; the voucher and its number stay, marked cancelled. */
  async cancelVoucher({ id, user, reason, override_reason }) {
    const company_id = await resolveCompanyIdForAuth(user);
    assertAdmin(user, 'cancel a voucher');
    const why = assertReason(reason, 'a reason for cancelling');
    const transaction = await sequelize.transaction();
    try {
      const voucher = await AccountingVoucher.unscoped().findOne({ where: { id, company_id }, transaction, lock: true });
      if (!voucher) throw new Error('Voucher not found.');
      if (voucher.is_cancelled) throw new MoneyRuleError('This voucher is already cancelled.', 'ALREADY_CANCELLED');
      await enforceLock({ companyId: company_id, user, entity: 'voucher', entityId: voucher.id, action: 'cancel', dates: [voucher.transaction_date], overrideReason: override_reason, transaction });

      const effects = effectsOf(voucher);
      const rows = await PaymentAccount.findAll({ where: { id: [...new Set(effects.map((e) => e.account_id))].sort((a, b) => a - b), company_id }, transaction, lock: true });
      const accs = Object.fromEntries(rows.map((a) => [a.id, a]));
      for (const e of effects) if (accs[e.account_id]) accs[e.account_id].current_balance = Number(accs[e.account_id].current_balance) - e.delta;
      for (const a of Object.values(accs)) {
        if (Number(a.current_balance) < 0) throw new Error(`Cannot cancel: ${a.name} would go below zero`);
      }
      for (const a of Object.values(accs)) await a.save({ transaction });

      await voucher.update(cancelStamp({ id: user.id, display_name: await actorName(user) }, why), { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async getAccountBalance(params, user) {
    const company_id = await resolveCompanyIdForAuth(user);
    const paymentAccount = await PaymentAccount.findOne({ where: { id: params.account_id, company_id } });
    if (!paymentAccount) return { balance: 0 };
    return { balance: paymentAccount.current_balance };
  }
}

module.exports = new AccountingVoucherService();
