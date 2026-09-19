const { BorrowRepay, PaymentAccount, sequelize } = require('../models');
const { Op } = require('sequelize');

const buildWhereClause = (params) => {
  const where = {};
  if (params.company_id) where.company_id = params.company_id;
  
  if (params.from_date || params.to_date) {
    where.date = {};
    if (params.from_date) where.date[Op.gte] = params.from_date;
    if (params.to_date) where.date[Op.lte] = params.to_date;
  }
  return where;
};

const getPagination = (params) => {
  const limit = params.max ? parseInt(params.max, 10) : 10;
  const offset = params.min ? (parseInt(params.min, 10) - 1) * limit : 0;
  return { limit, offset };
};

class BorrowRepayService {
  async getAll(params) {
    const where = buildWhereClause(params);
    const { limit, offset } = getPagination(params);

    const { count, rows } = await BorrowRepay.findAndCountAll({
      where,
      limit,
      offset,
      order: [['date', 'DESC'], ['id', 'DESC']],
      include: [
        { model: PaymentAccount, as: 'Account', attributes: ['id', 'name', 'account_type'] }
      ]
    });

    // Calculate outstanding_balance up to to_date (or today if not provided)
    const toDate = params.to_date || new Date().toISOString().split('T')[0];
    const outstandingBorrow = await BorrowRepay.sum('amount', {
      where: { company_id: params.company_id, date: { [Op.lte]: toDate }, type: 'BORROW' }
    });
    const outstandingRepay = await BorrowRepay.sum('amount', {
      where: { company_id: params.company_id, date: { [Op.lte]: toDate }, type: 'REPAY' }
    });
    const outstanding_balance = (outstandingBorrow || 0) - (outstandingRepay || 0);

    // Calculate running balance for each row
    for (const row of rows) {
      const borrowSum = await BorrowRepay.sum('amount', {
        where: {
          company_id: params.company_id,
          [Op.or]: [
            { date: { [Op.lt]: row.date } },
            { date: row.date, id: { [Op.lte]: row.id } }
          ],
          type: 'BORROW'
        }
      });
      const repaySum = await BorrowRepay.sum('amount', {
        where: {
          company_id: params.company_id,
          [Op.or]: [
            { date: { [Op.lt]: row.date } },
            { date: row.date, id: { [Op.lte]: row.id } }
          ],
          type: 'REPAY'
        }
      });
      row.dataValues.running_balance = (borrowSum || 0) - (repaySum || 0);
    }

    return { total: count, rows, outstanding_balance };
  }

  async getById(id, company_id) {
    const entry = await BorrowRepay.findOne({
      where: { id, company_id },
      include: [
        { model: PaymentAccount, as: 'Account', attributes: ['id', 'name', 'account_type'] }
      ]
    });
    if (!entry) throw new Error('Borrow/Repay entry not found');
    return entry;
  }

  async storeOrUpdate(data, company_id) {
    if (parseFloat(data.amount) <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    const transaction = await sequelize.transaction();

    try {
      let entry;
      const amount = parseFloat(data.amount);

      const account = await PaymentAccount.findOne({ where: { id: data.account_id, company_id }, transaction, lock: true });
      if (!account) throw new Error('Invalid Account');

      if (data.id) {
        // Edit mode
        entry = await BorrowRepay.findOne({ where: { id: data.id, company_id }, transaction });
        if (!entry) throw new Error('Entry not found');

        // Rollback previous impact
        const oldAmount = parseFloat(entry.amount);
        
        if (entry.account_id === account.id) {
          if (entry.type === 'BORROW') {
            account.current_balance = parseFloat(account.current_balance) - oldAmount;
          } else {
            account.current_balance = parseFloat(account.current_balance) + oldAmount;
          }
        } else {
          const oldAccount = await PaymentAccount.findOne({ where: { id: entry.account_id }, transaction, lock: true });
          if (oldAccount) {
            if (entry.type === 'BORROW') {
              oldAccount.current_balance = parseFloat(oldAccount.current_balance) - oldAmount;
            } else {
              oldAccount.current_balance = parseFloat(oldAccount.current_balance) + oldAmount;
            }
            await oldAccount.save({ transaction });
          }
        }

        // Apply new impact
        if (data.type === 'BORROW') {
          account.current_balance = parseFloat(account.current_balance) + amount;
        } else {
          account.current_balance = parseFloat(account.current_balance) - amount;
        }

        if (parseFloat(account.current_balance) < 0) {
          throw new Error('Insufficient balance in selected account');
        }

        await account.save({ transaction });

        await entry.update({
          date: data.date,
          type: data.type,
          party_name: data.party_name,
          amount,
          account_id: data.account_id,
          narration: data.narration
        }, { transaction });

      } else {
        // Create mode
        if (data.type === 'BORROW') {
          account.current_balance = parseFloat(account.current_balance) + amount;
        } else {
          account.current_balance = parseFloat(account.current_balance) - amount;
        }

        if (parseFloat(account.current_balance) < 0) {
          throw new Error('Insufficient balance in selected account');
        }

        await account.save({ transaction });

        entry = await BorrowRepay.create({
          date: data.date,
          type: data.type,
          party_name: data.party_name,
          amount,
          account_id: data.account_id,
          narration: data.narration,
          company_id
        }, { transaction });
      }

      await transaction.commit();
      return entry;

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteEntry(id, company_id) {
    const transaction = await sequelize.transaction();

    try {
      const entry = await BorrowRepay.findOne({ where: { id, company_id }, transaction });
      if (!entry) throw new Error('Entry not found');

      const account = await PaymentAccount.findOne({ where: { id: entry.account_id }, transaction, lock: true });

      if (account) {
        const amount = parseFloat(entry.amount);
        if (entry.type === 'BORROW') {
          account.current_balance = parseFloat(account.current_balance) - amount;
        } else {
          account.current_balance = parseFloat(account.current_balance) + amount;
        }
        await account.save({ transaction });
      }

      await entry.destroy({ transaction });
      await transaction.commit();
      return true;

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new BorrowRepayService();
