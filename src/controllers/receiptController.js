const receiptService = require('../services/receiptService');
const adminService = require('../services/adminService');
const { successResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

// `code` lets the screen react, e.g. ask the admin for an override reason (LOCK_OVERRIDE_REQUIRED).
exports.cancelReceipt = async (req, res) => {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    const { customer_payment_id, reason, override_reason } = req.body || {};
    const data = await receiptService.cancelReceipt({ companyId, customer_payment_id, reason, override_reason, user: req.user });
    return successResponse(res, statusCodes.OK, 'Receipt cancelled', data);
  } catch (error) {
    return res.status(statusCodes.BAD_REQUEST).json({ status: 0, message: error.message, code: error.code });
  }
};
