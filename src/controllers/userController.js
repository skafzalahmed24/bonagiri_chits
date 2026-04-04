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

module.exports = {
  getHomeRecord,
  getAllHomeRecords
};
