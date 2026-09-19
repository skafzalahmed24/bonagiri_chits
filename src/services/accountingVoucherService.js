const { AccountingVoucher, AccountingVoucherLine, PaymentAccount, AccountCreationDetail, sequelize } = require('../models');
const { Op } = require('sequelize');
const { resolveCompanyIdForAuth } = require('./adminService');
const MODULES = require('../utils/modules');

// Receipts (CR, BD) add to the payment account; payments (CP, BP) take from it.
const balanceSign = (voucherType) => (voucherType === 'CR' || voucherType === 'BD' ? 1 : -1);

const VOUCHER_MODULES = { CR: MODULES.T_CASH_RECEIPTS, CP: MODULES.T_CASH_PAYMENTS, BD: MODULES.T_BANK_DEPOSITS, BP: MODULES.T_BANK_PAYMENTS };
const checkPermission = (user, voucherType) => {
  if (user.role === 'company') return;
  const reqModule = VOUCHER_MODULES[voucherType];
  if (!user.permissions?.[reqModule]?.view) {
    throw new Error("You don't have permission to access this module");
  }
};

class AccountingVoucherService {
  async getAllVouchers(params, user) {
    const company_id = await resolveCompanyIdForAuth(user);
    const { voucher_type, from_date, to_date, search, min = 1, max = 50 } = params;

    const where = { company_id };
    if (voucher_type) {
      where.voucher_type = voucher_type;
    }
    if (from_date && to_date) {
      where.transaction_date = { [Op.between]: [from_date, to_date] };
    }
    if (search) {
      where[Op.or] = [
        { voucher_number: { [Op.like]: `%${search}%` } },
        { narration: { [Op.like]: `%${search}%` } }
      ];
    }

    const limit = parseInt(max, 10);
    const offset = (parseInt(min, 10) - 1) * limit;

    const { count, rows } = await AccountingVoucher.findAndCountAll({
      where,
      limit,
      offset,
      order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
      include: [
        { model: PaymentAccount, as: 'payment_account', attributes: ['id', 'name', 'account_type'] }
      ]
    });

    return { total: count, rows };
  }

  async getVoucherById(id, user) {
    const company_id = await resolveCompanyIdForAuth(user);
    const voucher = await AccountingVoucher.findOne({
      where: { id, company_id },
      include: [
        { model: PaymentAccount, as: 'payment_account', attributes: ['id', 'name', 'account_type'] },
        {
          model: AccountingVoucherLine,
          as: 'lines',
          include: [
            { model: AccountCreationDetail, as: 'particulars_account', attributes: ['id', 'account_name'] }
          ]
        }
      ],
      order: [[{ model: AccountingVoucherLine, as: 'lines' }, 'created_at', 'ASC']]
    });
    
    if (voucher) {
      checkPermission(user, voucher.voucher_type);
    }
    
    return voucher;
  }

  async storeOrUpdateVoucher(data, user) {
    const company_id = await resolveCompanyIdForAuth(user);
    const { id, voucher_type, transaction_date, account_id, narration, lines } = data;

    if (!account_id) throw new Error('Header account_id is required.');
    if (!lines || lines.length === 0) throw new Error('At least one line is required.');

    const total_amount = lines.reduce((sum, line) => sum + parseFloat(line.amount || 0), 0);
    if (total_amount <= 0) throw new Error('Voucher total must be greater than zero.');

    const transaction = await sequelize.transaction();
    let voucherId;

    try {
      let voucher;

      if (id) {
        voucher = await AccountingVoucher.findOne({ where: { id, company_id }, transaction });
        if (!voucher) throw new Error('Voucher not found.');

        // Fully reverse the old voucher (by its old type) before applying the new one.
        const oldAccount = await PaymentAccount.findOne({
          where: { id: voucher.account_id, company_id },
          transaction,
          lock: true
        });
        if (oldAccount) {
          oldAccount.current_balance =
            parseFloat(oldAccount.current_balance) - balanceSign(voucher.voucher_type) * parseFloat(voucher.total_amount);
          await oldAccount.save({ transaction });
        }

        await voucher.update({ voucher_type, transaction_date, account_id, narration, total_amount }, { transaction });
        await AccountingVoucherLine.destroy({ where: { voucher_id: id }, transaction });
      } else {
        const count = await AccountingVoucher.count({ where: { voucher_type, company_id }, transaction });
        const voucher_number = `${voucher_type}-${String(count + 1).padStart(4, '0')}`;

        voucher = await AccountingVoucher.create({
          company_id,
          voucher_type,
          voucher_number,
          transaction_date,
          account_id,
          narration,
          total_amount
        }, { transaction });
      }

      await AccountingVoucherLine.bulkCreate(lines.map(line => ({
        voucher_id: voucher.id,
        particulars_account_id: line.particulars_account_id,
        narration: line.narration,
        amount: line.amount,
        cheque_number: line.cheque_number || null,
        cheque_date: line.cheque_date || null,
        bank_name: line.bank_name || null,
        place: line.place || null
      })), { transaction });

      // Re-read after the reversal above so a same-account edit sees the reverted balance.
      const paymentAccount = await PaymentAccount.findOne({
        where: { id: account_id, company_id },
        transaction,
        lock: true
      });
      if (!paymentAccount) throw new Error('Payment account not found.');

      paymentAccount.current_balance =
        parseFloat(paymentAccount.current_balance) + balanceSign(voucher_type) * total_amount;
      if (parseFloat(paymentAccount.current_balance) < 0) {
        throw new Error('Insufficient balance in selected account');
      }
      await paymentAccount.save({ transaction });

      await transaction.commit();
      voucherId = voucher.id;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return this.getVoucherById(voucherId, user);
  }

  async deleteVoucher(id, user) {
    const company_id = await resolveCompanyIdForAuth(user);
    const transaction = await sequelize.transaction();

    try {
      const voucher = await AccountingVoucher.findOne({ where: { id, company_id }, transaction });
      if (!voucher) throw new Error('Voucher not found.');
      checkPermission(user, voucher.voucher_type);

      const paymentAccount = await PaymentAccount.findOne({
        where: { id: voucher.account_id, company_id },
        transaction,
        lock: true
      });
      if (paymentAccount) {
        paymentAccount.current_balance =
          parseFloat(paymentAccount.current_balance) - balanceSign(voucher.voucher_type) * parseFloat(voucher.total_amount);
        if (parseFloat(paymentAccount.current_balance) < 0) {
          throw new Error('Cannot delete: the account balance would go negative');
        }
        await paymentAccount.save({ transaction });
      }

      await AccountingVoucherLine.destroy({ where: { voucher_id: id }, transaction });
      await voucher.destroy({ transaction });
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
