const { PaymentAccount, sequelize } = require('../models');
const { Op } = require('sequelize');
const { statusFilter, cancelStamp } = require('../utils/cancellable');
const { assertAdmin, assertReason, actorName, enforceLock, MoneyRuleError } = require('../utils/moneyControls');

/**
 * Money paid out of one payment account: Expenditure and Payments (outgoing_payments).
 * Rules (docs/MONEY_FLOW_BATCH2_3.md): staff add and view; the company admin edits and
 * cancels; Transaction Lock Days applies; a cancelled entry stays, with who, when and why.
 *
 * @param {object} cfg
 * @param {import('sequelize').ModelStatic<any>} cfg.Model
 * @param {string} cfg.entity      money_lock_overrides.entity ('expenditure' | 'payment')
 * @param {string} cfg.label       for messages ('Expenditure' | 'Payment')
 * @param {string[]} cfg.fields    the entry's own text fields besides date/amount/account
 */
module.exports = function makeOutflowService({ Model, entity, label, fields }) {
  const where = (params) => {
    const w = { ...statusFilter(params.status) };
    if (params.company_id) w.company_id = params.company_id;
    if (params.category) w.category = params.category;
    if (params.from_date || params.to_date) {
      w.date = {};
      if (params.from_date) w.date[Op.gte] = params.from_date;
      if (params.to_date) w.date[Op.lte] = params.to_date;
    }
    return w;
  };
  const pick = (data) => Object.fromEntries(fields.map((f) => [f, data[f]]));

  /** Locks and checks the account money leaves from: this company's, active. */
  const lockAccounts = async (ids, company_id, transaction) => {
    const uniq = [...new Set(ids.filter(Boolean).map(Number))].sort((a, b) => a - b);
    const rows = await PaymentAccount.findAll({ where: { id: uniq, company_id }, transaction, lock: true });
    return Object.fromEntries(rows.map((a) => [a.id, a]));
  };

  return {
    async getAll(params) {
      const limit = params.max ? parseInt(params.max, 10) : 500;
      const offset = params.min ? (parseInt(params.min, 10) - 1) * limit : 0;
      const { count, rows } = await Model.unscoped().findAndCountAll({
        where: where(params),
        limit,
        offset,
        order: [['date', 'DESC'], ['id', 'DESC']],
        include: [{ model: PaymentAccount, as: 'Account', attributes: ['id', 'name', 'account_type'] }],
      });
      return { total: count, rows };
    },

    async getById(id, company_id) {
      const row = await Model.unscoped().findOne({
        where: { id, company_id },
        include: [{ model: PaymentAccount, as: 'Account', attributes: ['id', 'name', 'account_type'] }],
      });
      if (!row) throw new Error(`${label} not found`);
      return row;
    },

    async storeOrUpdate(data, company_id, user) {
      const amount = parseFloat(data.amount);
      if (!(amount > 0)) throw new Error('Amount must be greater than zero');
      if (!data.account_id) throw new Error('Choose the account the money is paid from');
      if (data.id) assertAdmin(user, `edit a ${label.toLowerCase()}`);

      const transaction = await sequelize.transaction();
      try {
        let row;
        if (data.id) {
          row = await Model.findOne({ where: { id: data.id, company_id }, transaction, lock: true });
          if (!row) throw new Error(`${label} not found or cancelled`);
          await enforceLock({ companyId: company_id, user, entity, entityId: row.id, action: 'edit', dates: [row.date, data.date], overrideReason: data.override_reason, transaction });

          const accs = await lockAccounts([row.account_id, data.account_id], company_id, transaction);
          const target = accs[Number(data.account_id)];
          if (!target) throw new Error('Invalid Account');
          if (!target.is_active) throw new Error('Selected account is inactive');
          if (accs[row.account_id]) accs[row.account_id].current_balance = Number(accs[row.account_id].current_balance) + Number(row.amount);
          target.current_balance = Number(target.current_balance) - amount;
          if (target.current_balance < 0) throw new Error('Insufficient balance in selected account');
          for (const a of Object.values(accs)) await a.save({ transaction });

          await row.update({ ...pick(data), date: data.date, amount, account_id: data.account_id, reference_no: data.reference_no, narration: data.narration }, { transaction });
        } else {
          await enforceLock({ companyId: company_id, user, entity, action: 'create', dates: [data.date], overrideReason: data.override_reason, transaction });
          const accs = await lockAccounts([data.account_id], company_id, transaction);
          const account = accs[Number(data.account_id)];
          if (!account) throw new Error('Invalid Account');
          if (!account.is_active) throw new Error('Selected account is inactive');
          if (Number(account.current_balance) < amount) throw new Error('Insufficient balance in selected account');
          account.current_balance = Number(account.current_balance) - amount;
          await account.save({ transaction });

          row = await Model.create({ ...pick(data), date: data.date, amount, account_id: data.account_id, reference_no: data.reference_no, narration: data.narration, company_id }, { transaction });
        }
        await transaction.commit();
        return row;
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },

    /** Cancel: the money goes back to its account; the entry stays, marked cancelled. */
    async cancel({ id, company_id, user, reason, override_reason }) {
      assertAdmin(user, `cancel a ${label.toLowerCase()}`);
      const why = assertReason(reason, 'a reason for cancelling');
      const transaction = await sequelize.transaction();
      try {
        const row = await Model.unscoped().findOne({ where: { id, company_id }, transaction, lock: true });
        if (!row) throw new Error(`${label} not found`);
        if (row.is_cancelled) throw new MoneyRuleError(`This ${label.toLowerCase()} is already cancelled.`, 'ALREADY_CANCELLED');
        await enforceLock({ companyId: company_id, user, entity, entityId: row.id, action: 'cancel', dates: [row.date], overrideReason: override_reason, transaction });

        const account = await PaymentAccount.findOne({ where: { id: row.account_id, company_id }, transaction, lock: true });
        if (account) {
          account.current_balance = Number(account.current_balance) + Number(row.amount);
          await account.save({ transaction });
        }
        await row.update(cancelStamp({ id: user.id, display_name: await actorName(user) }, why), { transaction });
        await transaction.commit();
        return row;
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },
  };
};
