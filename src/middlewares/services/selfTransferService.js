const { SelfTransfer, PaymentAccount, sequelize } = require('../models');
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
  const limit = params.max ? parseInt(params.max, 10) : 500;
  const offset = params.min ? (parseInt(params.min, 10) - 1) * limit : 0;
  return { limit, offset };
};

class SelfTransferService {
  async getAll(params) {
    const where = buildWhereClause(params);
    const { limit, offset } = getPagination(params);

    const { count, rows } = await SelfTransfer.findAndCountAll({
      where,
      limit,
      offset,
      order: [['date', 'DESC'], ['created_at', 'DESC']],
      include: [
        { model: PaymentAccount, as: 'FromAccount', attributes: ['id', 'name', 'account_type'] },
        { model: PaymentAccount, as: 'ToAccount', attributes: ['id', 'name', 'account_type'] }
      ]
    });

    return { total: count, rows };
  }

  async getById(id, company_id) {
    const transfer = await SelfTransfer.findOne({
      where: { id, company_id },
      include: [
        { model: PaymentAccount, as: 'FromAccount', attributes: ['id', 'name', 'account_type'] },
        { model: PaymentAccount, as: 'ToAccount', attributes: ['id', 'name', 'account_type'] }
      ]
    });
    if (!transfer) throw new Error('Self transfer not found');
    return transfer;
  }

  async storeOrUpdate(data, company_id) {
    if (data.from_account_id === data.to_account_id) {
      throw new Error('From and To accounts must be different');
    }
    
    if (parseFloat(data.amount) <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    const transaction = await sequelize.transaction();

    try {
      let transfer;
      const amount = parseFloat(data.amount);

      // Verify the accounts belong to the company
      const fromAccount = await PaymentAccount.findOne({ where: { id: data.from_account_id, company_id }, transaction, lock: true });
      const toAccount = await PaymentAccount.findOne({ where: { id: data.to_account_id, company_id }, transaction, lock: true });

      if (!fromAccount) throw new Error('Invalid From Account');
      if (!toAccount) throw new Error('Invalid To Account');

      if (data.id) {
        // Edit mode
        transfer = await SelfTransfer.findOne({ where: { id: data.id, company_id }, transaction });
        if (!transfer) throw new Error('Self transfer not found');

        // Rollback previous impact
        const oldAmount = parseFloat(transfer.amount);
        
        // Return money to previous FromAccount
        if (transfer.from_account_id === fromAccount.id) {
          fromAccount.current_balance = parseFloat(fromAccount.current_balance) + oldAmount;
        } else {
          const oldFrom = await PaymentAccount.findOne({ where: { id: transfer.from_account_id }, transaction, lock: true });
          if (oldFrom) {
            oldFrom.current_balance = parseFloat(oldFrom.current_balance) + oldAmount;
            await oldFrom.save({ transaction });
          }
        }

        // Take money from previous ToAccount
        if (transfer.to_account_id === toAccount.id) {
          toAccount.current_balance = parseFloat(toAccount.current_balance) - oldAmount;
        } else {
          const oldTo = await PaymentAccount.findOne({ where: { id: transfer.to_account_id }, transaction, lock: true });
          if (oldTo) {
            oldTo.current_balance = parseFloat(oldTo.current_balance) - oldAmount;
            await oldTo.save({ transaction });
          }
        }

        // Now apply new impact
        if (fromAccount.current_balance < amount) {
          throw new Error('Insufficient balance in From Account');
        }

        fromAccount.current_balance = parseFloat(fromAccount.current_balance) - amount;
        toAccount.current_balance = parseFloat(toAccount.current_balance) + amount;

        await fromAccount.save({ transaction });
        await toAccount.save({ transaction });

        // Update transfer record
        await transfer.update({
          date: data.date,
          from_account_id: data.from_account_id,
          to_account_id: data.to_account_id,
          amount,
          narration: data.narration
        }, { transaction });

      } else {
        // Create mode
        if (parseFloat(fromAccount.current_balance) < amount) {
          throw new Error('Insufficient balance in From Account');
        }

        fromAccount.current_balance = parseFloat(fromAccount.current_balance) - amount;
        toAccount.current_balance = parseFloat(toAccount.current_balance) + amount;

        await fromAccount.save({ transaction });
        await toAccount.save({ transaction });

        transfer = await SelfTransfer.create({
          date: data.date,
          from_account_id: data.from_account_id,
          to_account_id: data.to_account_id,
          amount,
          narration: data.narration,
          company_id
        }, { transaction });
      }

      await transaction.commit();
      return transfer;

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteTransfer(id, company_id) {
    const transaction = await sequelize.transaction();

    try {
      const transfer = await SelfTransfer.findOne({ where: { id, company_id }, transaction });
      if (!transfer) throw new Error('Self transfer not found');

      // Rollback impact
      const fromAccount = await PaymentAccount.findOne({ where: { id: transfer.from_account_id }, transaction, lock: true });
      const toAccount = await PaymentAccount.findOne({ where: { id: transfer.to_account_id }, transaction, lock: true });

      const amount = parseFloat(transfer.amount);

      if (fromAccount) {
        fromAccount.current_balance = parseFloat(fromAccount.current_balance) + amount;
        await fromAccount.save({ transaction });
      }

      if (toAccount) {
        toAccount.current_balance = parseFloat(toAccount.current_balance) - amount;
        await toAccount.save({ transaction });
      }

      await transfer.destroy({ transaction });

      await transaction.commit();
      return true;

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new SelfTransferService();
