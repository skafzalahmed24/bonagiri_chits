const prizePaymentService = require('../services/prizePaymentService');
const adminService = require('../services/adminService');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

async function ticketSearch(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    const result = await prizePaymentService.ticketSearch({ ...req.body, companyId });
    return successResponse(res, statusCodes.OK, 'Success', result);
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

async function getPosition(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    const result = await prizePaymentService.getPosition({ ...req.body, companyId });
    return successResponse(res, statusCodes.OK, 'Success', result);
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

async function advancePosition(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    const result = await prizePaymentService.advancePositionEndpoint({ ...req.body, companyId });
    return successResponse(res, statusCodes.OK, 'Success', result);
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

async function storeOrUpdate(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    const result = await prizePaymentService.storeOrUpdate({ ...req.body, companyId, user: req.user });
    return successResponse(res, statusCodes.OK, 'Success', result);
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

async function getAll(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    const result = await prizePaymentService.getAll({ ...req.body, companyId });
    return successResponse(res, statusCodes.OK, 'Success', result);
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

async function getById(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    const result = await prizePaymentService.getById({ ...req.body, companyId });
    return successResponse(res, statusCodes.OK, 'Success', result);
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

async function deletePayment(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    await prizePaymentService.deletePayment({ ...req.body, companyId, user: req.user });
    return successResponse(res, statusCodes.OK, 'Deleted successfully');
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

async function payableList(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    const result = await prizePaymentService.payableList({ ...req.body, companyId });
    return successResponse(res, statusCodes.OK, 'Success', result);
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

async function applyToDues(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    await prizePaymentService.applyToDues({ ...req.body, companyId, user: req.user });
    return successResponse(res, statusCodes.OK, 'Applied successfully');
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

async function advanceToDues(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    await prizePaymentService.advanceToDues({ ...req.body, companyId, user: req.user });
    return successResponse(res, statusCodes.OK, 'Applied successfully');
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

async function reverseAdjustment(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    await prizePaymentService.reverseAdjustment({ ...req.body, companyId, user: req.user });
    return successResponse(res, statusCodes.OK, 'Reversed successfully');
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

async function registerReport(req, res) {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    const result = await prizePaymentService.registerReport({ ...req.body, companyId });
    return successResponse(res, statusCodes.OK, 'Success', result);
  } catch (error) {
    return errorResponse(res, statusCodes.BAD_REQUEST, error.message);
  }
}

module.exports = {
  registerReport,
  ticketSearch,
  getPosition,
  advancePosition,
  storeOrUpdate,
  getAll,
  getById,
  deletePayment,
  payableList,
  applyToDues,
  advanceToDues,
  reverseAdjustment
};
