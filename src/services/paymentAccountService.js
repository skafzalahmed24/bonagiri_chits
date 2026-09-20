const { PaymentAccount } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');
const { Op } = require('sequelize');

const storeOrUpdatePaymentAccountService = async (res, comp_id, body) => {
  try {
    const { id, name, account_type, identifier, opening_balance, is_active } = body;
    
    if (!name || !account_type) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Name and Account Type are required');
    }

    if (id) {
      const account = await PaymentAccount.findOne({ where: { id, company_id: comp_id } });
      if (!account) {
        return errorResponse(res, statusCodes.NOT_FOUND, 'Payment account not found');
      }

      // If opening balance changes, adjust current balance difference
      const oldOpeningBalance = Number(account.opening_balance);
      const newOpeningBalance = opening_balance !== undefined ? Number(opening_balance) : oldOpeningBalance;
      const balanceDifference = newOpeningBalance - oldOpeningBalance;
      
      const newCurrentBalance = Number(account.current_balance) + balanceDifference;

      await account.update({
        name,
        account_type,
        identifier,
        opening_balance: newOpeningBalance,
        current_balance: newCurrentBalance,
        is_active: is_active !== undefined ? is_active : account.is_active
      });

      return successResponse(res, statusCodes.OK, 'Payment account updated successfully', account);
    } else {
      const newAccount = await PaymentAccount.create({
        company_id: comp_id,
        name,
        account_type,
        identifier,
        opening_balance: opening_balance || 0,
        current_balance: opening_balance || 0, // Initially, current balance is opening balance
        is_active: is_active !== undefined ? is_active : true
      });

      return successResponse(res, statusCodes.CREATED, 'Payment account created successfully', newAccount);
    }
  } catch (error) {
    console.error('Error in storeOrUpdatePaymentAccountService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllPaymentAccountsService = async (res, comp_id, body, user) => {
  try {
    const { account_type, is_active, min, max, search } = body;
    
    const limit = max ? parseInt(max, 10) : 500;
    const offset = min ? (parseInt(min, 10) - 1) * limit : 0;

    const whereClause = { company_id: comp_id };
    
    if (account_type) {
      whereClause.account_type = account_type;
    }
    
    if (is_active !== undefined) {
      whereClause.is_active = is_active;
    }
    
    if (search) {
      whereClause.name = { [Op.iLike]: `%${search}%` };
    }

    const { count, rows } = await PaymentAccount.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [['id', 'DESC']]
    });

    let returnRows = rows;
    if (user && user.role === 'staff') {
      // Self Transfer needs balances: it moves money between accounts and warns on shortfalls.
      const hasPermission = user.permissions?.M_PAYMENT_ACCOUNTS?.view
        || user.permissions?.R_BALANCE_SUMMARY?.view
        || user.permissions?.T_SELF_TRANSFER?.view;
      if (!hasPermission) {
        returnRows = rows.map(r => {
          const acc = r.toJSON();
          delete acc.opening_balance;
          delete acc.current_balance;
          return acc;
        });
      }
    }

    return successResponse(res, statusCodes.OK, 'Payment accounts fetched successfully', {
      total: count,
      rows: returnRows
    });
  } catch (error) {
    console.error('Error in getAllPaymentAccountsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deletePaymentAccountService = async (res, comp_id, id) => {
  try {
    const account = await PaymentAccount.findOne({ where: { id, company_id: comp_id } });
    if (!account) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Payment account not found');
    }

    // Instead of hard delete, maybe just deactivate, but spec says delete. Let's do hard delete for now.
    await account.destroy();

    return successResponse(res, statusCodes.OK, 'Payment account deleted successfully', null);
  } catch (error) {
    console.error('Error in deletePaymentAccountService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  storeOrUpdatePaymentAccountService,
  getAllPaymentAccountsService,
  deletePaymentAccountService
};
