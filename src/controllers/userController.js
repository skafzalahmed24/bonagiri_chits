const userService = require('../services/userService');
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

module.exports = {
  getHomeRecord,
  getAllHomeRecords,
  getUpcomingChits,
  submitChitInterest
};
