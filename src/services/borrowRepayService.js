const { BorrowRepay, PaymentAccount, sequelize } = require('../models');
const { Op } = require('sequelize');
const { statusFilter, cancelStamp } = require('../utils/cancellable');
const { assertAdmin, assertReason, actorName, enforceLock, MoneyRuleError } = require('../utils/moneyControls');

/**
 * Borrow (money in from a party) and Repay (money back out to them), through one account.
 * Rules (docs/MONEY_FLOW_BATCH2_3.md): staff add and view; the company admin edits and
 * cancels; Transaction Lock Days applies; a repay can't exceed what that party is owed;
 * no change may push an account below zero.
 */
const sign = (type) => (type === 'BORROW' ? 1 : -1);
const partyKey = (name) => String(name || '').trim().toLowerCase();

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

/** What the company still owes this party: borrowed − repaid, active entries only. */
async function owedTo(company_id, partyName, transaction, excludeId = null) {
  const rows = await BorrowRepay.findAll({
    where: { company_id, ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}) },
    attributes: ['type', 'amount', 'party_name'],
    transaction,
  });
  return rows
    .filter((r) => partyKey(r.party_name) === partyKey(partyName))
    .reduce((s, r) => s + sign(r.type) * Number(r.amount), 0);
}

const lockAccounts = async (ids, company_id, transaction) => {
  const uniq = [...new Set(ids.filter(Boolean).map(Number))].sort((a, b) => a - b);
  const rows = await PaymentAccount.findAll({ where: { id: uniq, company_id }, transaction, lock: true });
  return Object.fromEntries(rows.map((a) => [a.id, a]));
};

class BorrowRepayService {
  async getAll(params) {
    const limit = params.max ? parseInt(params.max, 10) : 10;
    const offset = params.min ? (parseInt(params.min, 10) - 1) * limit : 0;
    const { count, rows } = await BorrowRepay.unscoped().findAndCountAll({
      where: listWhere(params),
      limit,
      offset,
      order: [['date', 'DESC'], ['id', 'DESC']],
      include: [{ model: PaymentAccount, as: 'Account', attributes: ['id', 'name', 'account_type'] }],
    });

    // Outstanding up to to_date (or today), and a running balance on each active row.
    const toDate = params.to_date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const active = await BorrowRepay.findAll({
      where: { company_id: params.company_id, date: { [Op.lte]: toDate } },
      attributes: ['id', 'date', 'type', 'amount'],
      order: [['date', 'ASC'], ['id', 'ASC']],
    });
    const outstanding_balance = active.reduce((s, r) => s + sign(r.type) * Number(r.amount), 0);
    let running = 0;
    const runningById = {};
    active.forEach((r) => { running += sign(r.type) * Number(r.amount); runningById[r.id] = running; });
    rows.forEach((row) => { row.dataValues.running_balance = row.is_cancelled ? null : (runningById[row.id] ?? null); });

    return { total: count, rows, outstanding_balance };
  }

  async getById(id, company_id) {
    const entry = await BorrowRepay.unscoped().findOne({
      where: { id, company_id },
      include: [{ model: PaymentAccount, as: 'Account', attributes: ['id', 'name', 'account_type'] }],
    });
    if (!entry) throw new Error('Borrow/Repay entry not found');
    return entry;
  }

  async storeOrUpdate(data, company_id, user) {
    const amount = parseFloat(data.amount);
    if (!(amount > 0)) throw new Error('Amount must be greater than zero');
    if (!['BORROW', 'REPAY'].includes(data.type)) throw new Error('Type must be Borrow or Repay');
    if (!data.account_id) throw new Error('Choose the account');
    if (data.id) assertAdmin(user, 'edit a borrow or repay entry');

    const transaction = await sequelize.transaction();
    try {
      let entry = null;
      if (data.id) {
        entry = await BorrowRepay.findOne({ where: { id: data.id, company_id }, transaction, lock: true });
        if (!entry) throw new Error('Entry not found or cancelled');
        await enforceLock({ companyId: company_id, user, entity: 'borrow_repay', entityId: entry.id, action: 'edit', dates: [entry.date, data.date], overrideReason: data.override_reason, transaction });
      } else {
        await enforceLock({ companyId: company_id, user, entity: 'borrow_repay', action: 'create', dates: [data.date], overrideReason: data.override_reason, transaction });
      }

      // A repay can't be more than this party is still owed (the entry being edited left out).
      if (data.type === 'REPAY') {
        const owed = await owedTo(company_id, data.party_name, transaction, entry?.id);
        if (amount > owed + 0.005) {
          throw new MoneyRuleError(`Repay is more than ${data.party_name || 'this party'} is owed (₹${owed.toFixed(2)}).`, 'REPAY_EXCEEDS');
        }
      }

      const accs = await lockAccounts([entry?.account_id, data.account_id], company_id, transaction);
      const target = accs[Number(data.account_id)];
      if (!target) throw new Error('Invalid Account');
      if (!target.is_active) throw new Error('Selected account is inactive');
      if (entry && accs[entry.account_id]) {
        accs[entry.account_id].current_balance = Number(accs[entry.account_id].current_balance) - sign(entry.type) * Number(entry.amount);
      }
      target.current_balance = Number(target.current_balance) + sign(data.type) * amount;
      for (const a of Object.values(accs)) {
        if (Number(a.current_balance) < 0) throw new Error(`Insufficient balance in ${a.name}`);
      }
      for (const a of Object.values(accs)) await a.save({ transaction });

      const fields = { date: data.date, type: data.type, party_name: data.party_name, amount, account_id: data.account_id, narration: data.narration };
      entry = entry ? await entry.update(fields, { transaction }) : await BorrowRepay.create({ ...fields, company_id }, { transaction });

      await transaction.commit();
      return entry;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /** Cancel: undo the entry's effect on its account; refused if that takes the account below zero. */
  async cancel({ id, company_id, user, reason, override_reason }) {
    assertAdmin(user, 'cancel a borrow or repay entry');
    const why = assertReason(reason, 'a reason for cancelling');
    const transaction = await sequelize.transaction();
    try {
      const entry = await BorrowRepay.unscoped().findOne({ where: { id, company_id }, transaction, lock: true });
      if (!entry) throw new Error('Entry not found');
      if (entry.is_cancelled) throw new MoneyRuleError('This entry is already cancelled.', 'ALREADY_CANCELLED');
      await enforceLock({ companyId: company_id, user, entity: 'borrow_repay', entityId: entry.id, action: 'cancel', dates: [entry.date], overrideReason: override_reason, transaction });

      // Cancelling a borrow would leave later repays exceeding what was borrowed.
      if (entry.type === 'BORROW') {
        const owed = await owedTo(company_id, entry.party_name, transaction, entry.id);
        if (owed < -0.005) throw new MoneyRuleError(`Repays to ${entry.party_name} would then exceed what was borrowed. Cancel those repays first.`, 'REPAY_EXCEEDS');
      }

      const account = await PaymentAccount.findOne({ where: { id: entry.account_id, company_id }, transaction, lock: true });
      if (account) {
        account.current_balance = Number(account.current_balance) - sign(entry.type) * Number(entry.amount);
        if (account.current_balance < 0) throw new Error(`Insufficient balance in ${account.name} to cancel this entry`);
        await account.save({ transaction });
      }
      await entry.update(cancelStamp({ id: user.id, display_name: await actorName(user) }, why), { transaction });
      await transaction.commit();
      return entry;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new BorrowRepayService();
