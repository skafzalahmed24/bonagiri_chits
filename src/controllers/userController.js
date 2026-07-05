const userService = require('../services/userService');
const adminService = require('../services/adminService');
const { errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

const getHomeRecord = async (req, res) => {
  try {
    const { subscriber_id } = req.body;
    return await userService.getHomeRecordService(res, subscriber_id);
  } catch (error) {
    console.error('Error in getHomeRecord:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllHomeRecords = async (req, res) => {
  try {
    const { subscriber_id, type, min, max } = req.body;
    return await userService.getAllHomeRecordsService(res, subscriber_id, type, min, max);
  } catch (error) {
    console.error('Error in getAllHomeRecords:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getUpcomingChits = async (req, res) => {
  try {
    const { min, max } = req.body || {};
    return await userService.getUpcomingChitsService(res, req.user, min, max);
  } catch (error) {
    console.error('Error in getUpcomingChits:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const submitChitInterest = async (req, res) => {
  try {
    const { upcoming_chit_id, showing_interest } = req.body;
    return await userService.submitChitInterestService(res, req.user, upcoming_chit_id, showing_interest);
  } catch (error) {
    console.error('Error in submitChitInterest:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getPendingPayments = async (req, res) => {
  try {
    const { subscriber_id, min, max } = req.body || {};
    return await userService.getPendingPaymentsService(res, req.user, subscriber_id, min, max);
  } catch (error) {
    console.error('Error in getPendingPayments:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getBids = async (req, res) => {
  try {
    const { type, min, max } = req.body || {};
    return await userService.getBidsService(res, req.user, type, min, max);
  } catch (error) {
    console.error('Error in getBids:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getBidDetails = async (req, res) => {
  try {
    const { group_id } = req.body;
    return await userService.getBidDetailsService(res, group_id);
  } catch (error) {
    console.error('Error in getBidDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getChitDetails = async (req, res) => {
  try {
    const { group_id } = req.body;
    return await userService.getChitDetailsService(res, req.user, group_id);
  } catch (error) {
    console.error('Error in getChitDetails:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getBusinessListUnderMembers = async (req, res) => {
  try {
    const { business_agent_id, min, max } = req.body || {};
    return await adminService.getBusinessListUnderMembersService(res, business_agent_id, min, max);
  } catch (error) {
    console.error('Error in getBusinessListUnderMembers:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  getHomeRecord,
  getAllHomeRecords,
  getUpcomingChits,
  submitChitInterest,
  getPendingPayments,
  getBids,
  getBidDetails,
  getChitDetails,
  getBusinessListUnderMembers
};
