const { Expenditure, PaymentAccount, sequelize } = require('../models');
const { Op } = require('sequelize');

const buildWhereClause = (params) => {
  const where = {};
  if (params.company_id) where.company_id = params.company_id;
  
  if (params.category) where.category = params.category;

  if (params.from_date || params.to_date) {
    where.date = {};
    if (params.from_date) where.date[Op.gte] = params.from_date;
    if (params.to_date) where.date[Op.lte] = params.to_date;
  }
  return where;
};

const getPagination = (params) => {
  const limit = params.max ? parseInt(params.max, 10) : 500;
  const offset = params.min ? (parseInt(params.min, 10) - 1) * limit : 0;
  return { limit, offset };
};

class ExpenditureService {
  async getAll(params) {
    const where = buildWhereClause(params);
    const { limit, offset } = getPagination(params);

    const { count, rows } = await Expenditure.findAndCountAll({
      where,
      limit,
      offset,
      order: [['date', 'DESC'], ['id', 'DESC']],
      include: [
        { model: PaymentAccount, as: 'Account', attributes: ['id', 'name', 'account_type'] }
      ]
    });

    return { total: count, rows };
  }

  async getById(id, company_id) {
    const expenditure = await Expenditure.findOne({
      where: { id, company_id },
      include: [
        { model: PaymentAccount, as: 'Account', attributes: ['id', 'name', 'account_type'] }
      ]
    });
    if (!expenditure) throw new Error('Expenditure not found');
    return expenditure;
  }

  async storeOrUpdate(data, company_id) {
    if (parseFloat(data.amount) <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    const transaction = await sequelize.transaction();

    try {
      let expenditure;
      const amount = parseFloat(data.amount);

      const account = await PaymentAccount.findOne({ where: { id: data.account_id, company_id }, transaction, lock: true });
      if (!account) throw new Error('Invalid Account');

      if (data.id) {
        // Edit mode
        expenditure = await Expenditure.findOne({ where: { id: data.id, company_id }, transaction });
        if (!expenditure) throw new Error('Expenditure not found');

        // Rollback previous impact
        const oldAmount = parseFloat(expenditure.amount);
        
        if (expenditure.account_id === account.id) {
          account.current_balance = parseFloat(account.current_balance) + oldAmount;
        } else {
          const oldAccount = await PaymentAccount.findOne({ where: { id: expenditure.account_id }, transaction, lock: true });
          if (oldAccount) {
            oldAccount.current_balance = parseFloat(oldAccount.current_balance) + oldAmount;
            await oldAccount.save({ transaction });
          }
        }

        // Apply new impact
        if (parseFloat(account.current_balance) < amount) {
          throw new Error('Insufficient balance in selected account');
        }

        account.current_balance = parseFloat(account.current_balance) - amount;
        await account.save({ transaction });

        await expenditure.update({
          date: data.date,
          spent_by: data.spent_by,
          category: data.category,
          amount,
          account_id: data.account_id,
          reference_no: data.reference_no,
          narration: data.narration
        }, { transaction });

      } else {
        // Create mode
        if (parseFloat(account.current_balance) < amount) {
          throw new Error('Insufficient balance in selected account');
        }

        account.current_balance = parseFloat(account.current_balance) - amount;
        await account.save({ transaction });

        expenditure = await Expenditure.create({
          date: data.date,
          spent_by: data.spent_by,
          category: data.category,
          amount,
          account_id: data.account_id,
          reference_no: data.reference_no,
          narration: data.narration,
          company_id
        }, { transaction });
      }

      await transaction.commit();
      return expenditure;

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteExpenditure(id, company_id) {
    const transaction = await sequelize.transaction();

    try {
      const expenditure = await Expenditure.findOne({ where: { id, company_id }, transaction });
      if (!expenditure) throw new Error('Expenditure not found');

      const account = await PaymentAccount.findOne({ where: { id: expenditure.account_id }, transaction, lock: true });

      if (account) {
        const amount = parseFloat(expenditure.amount);
        account.current_balance = parseFloat(account.current_balance) + amount;
        await account.save({ transaction });
      }

      await expenditure.destroy({ transaction });
      await transaction.commit();
      return true;

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new ExpenditureService();
