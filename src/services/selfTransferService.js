const { SelfTransfer, PaymentAccount, sequelize } = require('../models');
const { Op } = require('sequelize');
const { statusFilter, cancelStamp } = require('../utils/cancellable');
const { assertAdmin, assertReason, actorName, enforceLock, MoneyRuleError } = require('../utils/moneyControls');

/**
 * Self Transfer: money moved from one of the company's accounts to another.
 * Rules (docs/MONEY_FLOW_BATCH2_3.md): staff add and view; the company admin edits and
 * cancels; Transaction Lock Days applies; no change may push an account below zero.
 * Each account is loaded once even when an edit touches it on both sides (audit M5).
 */
const listWhere = (params) => {
  const where = { ...statusFilter(params.status) };
  if (params.company_id) where.company_id = params.company_id;
  if (params.from_date || params.to_date) {
    where.date = {};
    if (params.from_date) where.date[Op.gte] = params.from_date;
    if (params.to_date) where.date[Op.lte] = params.to_date;
  }
  return where;
};

const lockAccounts = async (ids, company_id, transaction) => {
  const uniq = [...new Set(ids.filter(Boolean).map(Number))].sort((a, b) => a - b);
  const rows = await PaymentAccount.findAll({ where: { id: uniq, company_id }, transaction, lock: true });
  return Object.fromEntries(rows.map((a) => [a.id, a]));
};

const assertNotNegative = (accs) => {
  for (const a of Object.values(accs)) {
    if (Number(a.current_balance) < 0) throw new Error(`Insufficient balance in ${a.name}`);
  }
};

const include = [
  { model: PaymentAccount, as: 'FromAccount', attributes: ['id', 'name', 'account_type'] },
  { model: PaymentAccount, as: 'ToAccount', attributes: ['id', 'name', 'account_type'] },
];

class SelfTransferService {
  async getAll(params) {
    const limit = params.max ? parseInt(params.max, 10) : 500;
    const offset = params.min ? (parseInt(params.min, 10) - 1) * limit : 0;
    const { count, rows } = await SelfTransfer.unscoped().findAndCountAll({
      where: listWhere(params),
      limit,
      offset,
      order: [['date', 'DESC'], ['created_at', 'DESC']],
      include,
    });
    return { total: count, rows };
  }

  async getById(id, company_id) {
    const transfer = await SelfTransfer.unscoped().findOne({ where: { id, company_id }, include });
    if (!transfer) throw new Error('Self transfer not found');
    return transfer;
  }

  async storeOrUpdate(data, company_id, user) {
    const amount = parseFloat(data.amount);
    if (Number(data.from_account_id) === Number(data.to_account_id)) throw new Error('From and To accounts must be different');
    if (!(amount > 0)) throw new Error('Amount must be greater than zero');
    if (data.id) assertAdmin(user, 'edit a self transfer');

    const transaction = await sequelize.transaction();
    try {
      let transfer = null;
      if (data.id) {
        transfer = await SelfTransfer.findOne({ where: { id: data.id, company_id }, transaction, lock: true });
        if (!transfer) throw new Error('Self transfer not found or cancelled');
        await enforceLock({ companyId: company_id, user, entity: 'self_transfer', entityId: transfer.id, action: 'edit', dates: [transfer.date, data.date], overrideReason: data.override_reason, transaction });
      } else {
        await enforceLock({ companyId: company_id, user, entity: 'self_transfer', action: 'create', dates: [data.date], overrideReason: data.override_reason, transaction });
      }

      const accs = await lockAccounts([transfer?.from_account_id, transfer?.to_account_id, data.from_account_id, data.to_account_id], company_id, transaction);
      const from = accs[Number(data.from_account_id)];
      const to = accs[Number(data.to_account_id)];
      if (!from) throw new Error('Invalid From Account');
      if (!to) throw new Error('Invalid To Account');
      if (!from.is_active) throw new Error('From account is inactive');
      if (!to.is_active) throw new Error('To account is inactive');

      // Undo the old transfer, then apply the new one, on the same account objects.
      if (transfer) {
        const old = Number(transfer.amount);
        if (accs[transfer.from_account_id]) accs[transfer.from_account_id].current_balance = Number(accs[transfer.from_account_id].current_balance) + old;
        if (accs[transfer.to_account_id]) accs[transfer.to_account_id].current_balance = Number(accs[transfer.to_account_id].current_balance) - old;
      }
      from.current_balance = Number(from.current_balance) - amount;
      to.current_balance = Number(to.current_balance) + amount;
      assertNotNegative(accs);
      for (const a of Object.values(accs)) await a.save({ transaction });

      const fields = { date: data.date, from_account_id: data.from_account_id, to_account_id: data.to_account_id, amount, narration: data.narration };
      transfer = transfer ? await transfer.update(fields, { transaction }) : await SelfTransfer.create({ ...fields, company_id }, { transaction });

      await transaction.commit();
      return transfer;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /** Cancel: the money goes back from the To account to the From account. */
  async cancel({ id, company_id, user, reason, override_reason }) {
    assertAdmin(user, 'cancel a self transfer');
    const why = assertReason(reason, 'a reason for cancelling');
    const transaction = await sequelize.transaction();
    try {
      const transfer = await SelfTransfer.unscoped().findOne({ where: { id, company_id }, transaction, lock: true });
      if (!transfer) throw new Error('Self transfer not found');
      if (transfer.is_cancelled) throw new MoneyRuleError('This transfer is already cancelled.', 'ALREADY_CANCELLED');
      await enforceLock({ companyId: company_id, user, entity: 'self_transfer', entityId: transfer.id, action: 'cancel', dates: [transfer.date], overrideReason: override_reason, transaction });

      const accs = await lockAccounts([transfer.from_account_id, transfer.to_account_id], company_id, transaction);
      const amount = Number(transfer.amount);
      if (accs[transfer.from_account_id]) accs[transfer.from_account_id].current_balance = Number(accs[transfer.from_account_id].current_balance) + amount;
      if (accs[transfer.to_account_id]) accs[transfer.to_account_id].current_balance = Number(accs[transfer.to_account_id].current_balance) - amount;
      assertNotNegative(accs);
      for (const a of Object.values(accs)) await a.save({ transaction });

      await transfer.update(cancelStamp({ id: user.id, display_name: await actorName(user) }, why), { transaction });
      await transaction.commit();
      return transfer;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new SelfTransferService();
