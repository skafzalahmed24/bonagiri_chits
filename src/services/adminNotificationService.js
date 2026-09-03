const { Op } = require('sequelize');
const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { StaffUser, Company, Member, Enrollment, NotificationHistory } = require('../models');
const fcmService = require('./fcmService');

/**
 * Register FCM device token and platform info for Staff / Admin
 */
const registerAdminTokenService = async (res, userPayload, bodyData = {}) => {
  try {
    if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

    const fcm_token = typeof bodyData === 'string' ? bodyData : (bodyData.fcm_token || bodyData.device_token);
    const { platform_type, device_id, device_details } = typeof bodyData === 'object' ? bodyData : {};
    const { normalizePlatformType } = require('../utils/platformHelper');

    const updateData = {};
    if (fcm_token) updateData.fcm_token = fcm_token;
    if (platform_type !== undefined && platform_type !== null) {
      updateData.platform_type = normalizePlatformType(platform_type);
    }
    if (device_id) updateData.device_id = device_id;
    if (device_details) {
      updateData.device_details = typeof device_details === 'object' ? JSON.stringify(device_details) : String(device_details);
    }

    if (userPayload.role === 'company') {
      await Company.update(updateData, { where: { id: userPayload.id } });
    } else {
      await StaffUser.update(updateData, { where: { id: userPayload.id } });
    }

    return successResponse(res, statusCodes.OK, 'Admin device token registered successfully');
  } catch (error) {
    console.error('Error in registerAdminTokenService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/**
 * Send manual push notification to ALL, GROUP, or SPECIFIC_MEMBER
 */
const sendManualNotificationService = async (res, userPayload, data) => {
  try {
    if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

    const { target_type, target_id, title, body, data_payload } = data;
    const companyId = userPayload.company_id || userPayload.id;

    if (target_type === 'ALL') {
      const allMembers = await Member.findAll({
        where: {
          company_id: companyId,
          is_deleted_status: 0,
          fcm_token: { [Op.ne]: null }
        }
      });
      fcmService.sendPushToMulticast(allMembers, companyId, title, body, data_payload);
    } else if (target_type === 'SPECIFIC_MEMBER') {
      const member = await Member.findOne({
        where: {
          id: target_id,
          company_id: companyId,
          is_deleted_status: 0
        }
      });
      if (!member) return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
      fcmService.sendPushToMember(member, title, body, data_payload);
    } else if (target_type === 'GROUP') {
      const enrollments = await Enrollment.findAll({
        where: {
          group_id: target_id,
          company_id: companyId,
          delete_status: 0
        },
        include: [{
          model: Member,
          as: 'subscriber',
          where: { is_deleted_status: 0, fcm_token: { [Op.ne]: null } },
          required: true
        }]
      });
      const members = enrollments.map(e => e.subscriber);
      fcmService.sendPushToMulticast(members, companyId, title, body, data_payload);
    }

    return successResponse(res, statusCodes.OK, 'Notification sending triggered successfully');
  } catch (error) {
    console.error('Error in sendManualNotificationService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/**
 * Get notification history for Admin / Company
 */
const getAdminNotificationHistoryService = async (res, userPayload, min = 0, max = 20, search = '') => {
  try {
    if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

    const limit = parseInt(max, 10) || 20;
    const offset = parseInt(min, 10) || 0;
    const companyId = userPayload.company_id || userPayload.id;

    const whereClause = { company_id: companyId };

    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike || Op.like]: `%${search}%` } },
        { body: { [Op.iLike || Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await NotificationHistory.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return successResponse(res, statusCodes.OK, 'Notification history retrieved successfully', { count, rows });
  } catch (error) {
    console.error('Error in getAdminNotificationHistoryService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  registerAdminTokenService,
  sendManualNotificationService,
  getAdminNotificationHistoryService
};
