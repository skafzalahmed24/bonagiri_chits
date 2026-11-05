'use strict';

const appVersionService = require('../services/appVersionService');
const { errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

/** Public: the mobile apps call this on launch. */
const checkAppVersion = async (req, res) => {
  try {
    const { platform, current_version } = req.body;
    return await appVersionService.checkAppVersionService(res, platform, current_version);
  } catch (error) {
    console.error('[CONTROLLER] Error in checkAppVersion:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/** Super Admin: get settings for both platforms. */
const getAppVersions = async (req, res) => {
  try {
    return await appVersionService.getAppVersionsService(res);
  } catch (error) {
    console.error('[CONTROLLER] Error in getAppVersions:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/** Super Admin: create or update one platform's settings. */
const storeOrUpdateAppVersion = async (req, res) => {
  try {
    return await appVersionService.storeOrUpdateAppVersionService(res, req.body);
  } catch (error) {
    console.error('[CONTROLLER] Error in storeOrUpdateAppVersion:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  checkAppVersion,
  getAppVersions,
  storeOrUpdateAppVersion
};
