'use strict';

const { AppVersion } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');
const { compareVersions } = require('../utils/versionCompare');

const DEFAULT_MESSAGE = 'A new version of the app is available. Please update to continue.';

const serialize = (row) => ({
  id: row.id,
  platform: row.platform,
  latest_version: row.latest_version,
  min_supported_version: row.min_supported_version,
  force_update: !!row.force_update,
  store_url: row.store_url || null,
  update_message: row.update_message || null,
  updated_at: row.updatedAt
});

/**
 * Public: tells the mobile app whether it must (or may) update.
 * update_required  -> block the app until the user updates (force update)
 * update_available -> a newer version exists; the app may show a dismissible prompt
 */
const checkAppVersionService = async (res, platform, currentVersion) => {
  try {
    const row = await AppVersion.findOne({ where: { platform } });

    if (!row) {
      return successResponse(res, statusCodes.OK, 'App version checked', {
        platform,
        current_version: currentVersion,
        update_required: false,
        update_available: false,
        latest_version: null,
        min_supported_version: null,
        store_url: null,
        message: null
      });
    }

    const belowMin = compareVersions(currentVersion, row.min_supported_version) < 0;
    const belowLatest = compareVersions(currentVersion, row.latest_version) < 0;
    const updateRequired = belowMin || (!!row.force_update && belowLatest);

    return successResponse(res, statusCodes.OK, 'App version checked', {
      platform,
      current_version: currentVersion,
      update_required: updateRequired,
      update_available: belowLatest,
      latest_version: row.latest_version,
      min_supported_version: row.min_supported_version,
      store_url: row.store_url || null,
      message: belowLatest ? (row.update_message || DEFAULT_MESSAGE) : null
    });
  } catch (error) {
    console.error('[APP VERSION] Error in checkAppVersionService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to check app version');
  }
};

/** Super Admin: both platforms' settings. */
const getAppVersionsService = async (res) => {
  try {
    const rows = await AppVersion.findAll({ order: [['platform', 'ASC']] });
    return successResponse(res, statusCodes.OK, 'App versions retrieved successfully', rows.map(serialize));
  } catch (error) {
    console.error('[APP VERSION] Error in getAppVersionsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to retrieve app versions');
  }
};

/** Super Admin: create or update one platform's settings (only the fields sent are changed). */
const storeOrUpdateAppVersionService = async (res, data) => {
  try {
    const { platform, ...fields } = data;
    const existing = await AppVersion.findOne({ where: { platform } });

    const latest = fields.latest_version ?? existing?.latest_version ?? '1.0.0';
    const min = fields.min_supported_version ?? existing?.min_supported_version ?? '1.0.0';
    if (compareVersions(min, latest) > 0) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'min_supported_version cannot be greater than latest_version');
    }

    let row;
    if (existing) {
      row = await existing.update(fields);
    } else {
      row = await AppVersion.create({ platform, ...fields });
    }

    return successResponse(res, existing ? statusCodes.OK : statusCodes.CREATED, 'App version saved successfully', serialize(row));
  } catch (error) {
    console.error('[APP VERSION] Error in storeOrUpdateAppVersionService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to save app version');
  }
};

module.exports = {
  checkAppVersionService,
  getAppVersionsService,
  storeOrUpdateAppVersionService
};
