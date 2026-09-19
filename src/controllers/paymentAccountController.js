const paymentAccountService = require('../services/paymentAccountService');
const adminService = require('../services/adminService');
const { errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

const storeOrUpdatePaymentAccount = async (req, res) => {
  try {
    const comp_id = await adminService.resolveCompanyIdForAuth(req.user);
    return await paymentAccountService.storeOrUpdatePaymentAccountService(res, comp_id, req.body);
  } catch (error) {
    console.error('Error in storeOrUpdatePaymentAccount:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllPaymentAccounts = async (req, res) => {
  try {
    const comp_id = await adminService.resolveCompanyIdForAuth(req.user);
    return await paymentAccountService.getAllPaymentAccountsService(res, comp_id, req.body);
  } catch (error) {
    console.error('Error in getAllPaymentAccounts:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const deletePaymentAccount = async (req, res) => {
  try {
    const comp_id = await adminService.resolveCompanyIdForAuth(req.user);
    const { id } = req.body || {};
    if (!id) {
        return errorResponse(res, statusCodes.BAD_REQUEST, 'ID is required');
    }
    return await paymentAccountService.deletePaymentAccountService(res, comp_id, id);
  } catch (error) {
    console.error('Error in deletePaymentAccount:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  storeOrUpdatePaymentAccount,
  getAllPaymentAccounts,
  deletePaymentAccount
};
