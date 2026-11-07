const SystemSettingsService = require('../services/systemSettingsService');
const { errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

/**
 * Business Date, scheduler mode, manual jobs and their audit history exist on dev and staging only.
 * In production these routes answer 404, as if they were not there. See ENABLE_BUSINESS_DATE_TOOLS in
 * SystemSettingsService.toolsEnabled().
 */
module.exports = (req, res, next) => {
  if (!SystemSettingsService.toolsEnabled()) {
    return errorResponse(res, statusCodes.NOT_FOUND, 'Not found');
  }
  return next();
};
