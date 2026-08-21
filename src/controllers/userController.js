const userService = require('../services/userService');
const adminService = require('../services/adminService');
const { errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');
const { ConfigureBusinessAgentCommission } = require('../models');

const getHomeRecord = async (req, res) => {
  try {
    const { subscriber_id } = req.body;
    return await userService.getHomeRecordService(res, req.user);
  } catch (error) {
    console.error('Error in getHomeRecord:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllHomeRecords = async (req, res) => {
  try {
    const { subscriber_id, type, min, max } = req.body;
    return await userService.getAllHomeRecordsService(res, req.user, type, min, max);
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
    return await userService.getPendingPaymentsService(res, req.user, null, min, max);
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
    return await userService.getBidDetailsService(res, group_id, req.user);
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

const getPaymentHistory = async (req, res) => {
  try {
    const { group_id, min, max } = req.body || {};
    return await userService.getPaymentHistoryService(res, req.user, group_id, min, max);
  } catch (error) {
    console.error('Error in getPaymentHistory:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getPaymentReceipt = async (req, res) => {
  try {
    const { payment_id } = req.body;
    return await userService.getPaymentReceiptService(res, req.user, payment_id);
  } catch (error) {
    console.error('Error in getPaymentReceipt:', error);
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

const getBusinessAgentCommissionSummary = async (req, res) => {
  try {
    const { min, max } = req.body || {};
    const business_agent_id = req.user.id;
    return await adminService.getBusinessAgentCommissionSummaryService(res, business_agent_id, min, max);
  } catch (error) {
    console.error('Error in getBusinessAgentCommissionSummary:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeOrUpdateHistoryBusinessAgent = async (req, res) => {
  try {
    const data = req.body;
    const configId = data.configure_business_agent_id;

    if (configId) {
      const config = await ConfigureBusinessAgentCommission.findByPk(configId);
      if (!config || config.business_agent_id !== req.user.id) {
        return errorResponse(res, statusCodes.FORBIDDEN, 'You do not have permission to modify this record.');
      }
    } else {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'configure_business_agent_id is required');
    }

    return await adminService.storeOrUpdateHistoryBusinessAgentService(res, data);
  } catch (error) {
    console.error('Error in storeOrUpdateHistoryBusinessAgent:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getHistoryByGroupId = async (req, res) => {
  try {
    const { group_id, min, max } = req.body;
    const business_agent_id = req.user.id;
    return await adminService.getHistoryByGroupIdService(res, group_id, min, max, business_agent_id);
  } catch (error) {
    console.error('Error in getHistoryByGroupId:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getCollectionAgentDashboard = async (req, res) => {
  try {
    const { collection_agent_id, from_date, to_date } = req.body;
    return await userService.getCollectionAgentDashboardService(res, req.user.id, from_date, to_date);
  } catch (error) {
    console.error('Error in getCollectionAgentDashboard:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getCollectionAgentGroupDashboard = async (req, res) => {
  try {
    const { group_id } = req.body;
    return await userService.getCollectionAgentGroupDashboardService(res, group_id);
  } catch (error) {
    console.error('Error in getCollectionAgentGroupDashboard:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getCollectionAgentActiveGroups = async (req, res) => {
  try {
    const { collection_agent_id, min, max } = req.body;
    return await userService.getCollectionAgentActiveGroupsService(res, req.user.id, min, max);
  } catch (error) {
    console.error('Error in getCollectionAgentActiveGroups:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getPendingMembers = async (req, res) => {
  try {
    const { collection_agent_id, group_id, min, max } = req.body;
    return await userService.getPendingMembersService(res, req.user.id, group_id, min, max);
  } catch (error) {
    console.error('Error in getPendingMembers:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getMemberDues = async (req, res) => {
  try {
    const { member_id } = req.body;
    return await userService.getMemberDuesService(res, member_id, req.user);
  } catch (error) {
    console.error('Error in getMemberDues:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getSubmissions = async (req, res) => {
  try {
    const { collection_agent_id, type, min, max } = req.body;
    return await userService.getSubmissionsService(res, collection_agent_id, type, min, max);
  } catch (error) {
    console.error('Error in getSubmissions:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const submitCollectionPayment = async (req, res) => {
  try {
    return await userService.submitCollectionPaymentService(res, req.body, req.user);
  } catch (error) {
    console.error('Error in submitCollectionPayment:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllGallery = async (req, res) => {
  return await userService.getAllGalleryService(res, req.body);
};

const registerDeviceToken = async (req, res) => {
  try {
    const { fcm_token } = req.body;
    return await userService.registerDeviceTokenService(res, req.user, fcm_token);
  } catch (error) {
    console.error('Error in registerDeviceToken:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getNotificationHistory = async (req, res) => {
  try {
    const { min, max } = req.body || {};
    return await userService.getNotificationHistoryService(res, req.user, min, max);
  } catch (error) {
    console.error('Error in getNotificationHistory:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const { notification_id } = req.body;
    return await userService.markNotificationReadService(res, req.user, notification_id);
  } catch (error) {
    console.error('Error in markNotificationRead:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getMemberDocuments = async (req, res) => {
  try {
    const { group_id, member_id } = req.body;
    return await userService.getMemberDocumentsService(res, req.user, group_id, member_id);
  } catch (error) {
    console.error('Error in getMemberDocuments:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const uploadMemberDocument = async (req, res) => {
  try {
    return await userService.uploadMemberDocumentService(res, req.body, req.user);
  } catch (error) {
    console.error('Error in uploadMemberDocument:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getGroupsByCollectionAgentId = async (req, res) => {
  try {
    const { collection_agent_id } = req.body;
    return await userService.getGroupsByCollectionAgentIdService(res, req.user, collection_agent_id);
  } catch (error) {
    console.error('Error in getGroupsByCollectionAgentId:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getMembersByGroupId = async (req, res) => {
  try {
    const { group_id, search, min, max } = req.body;
    return await userService.getMembersByGroupIdService(res, req.user, group_id, search, min, max);
  } catch (error) {
    console.error('Error in getMembersByGroupId:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getMembersByCollectionAgentId = async (req, res) => {
  try {
    const { collection_agent_id, search, min, max } = req.body;
    return await userService.getMembersByCollectionAgentIdService(res, collection_agent_id, search, min, max);
  } catch (error) {
    console.error('Error in getMembersByCollectionAgentId:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getCustomerDetailsById = async (req, res) => {
  try {
    return await userService.getCustomerDetailsByIdService(res, req.body);
  } catch (error) {
    console.error('Error in getCustomerDetailsById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getVisitHistory = async (req, res) => {
  try {
    return await userService.getVisitHistoryService(res, req.body);
  } catch (error) {
    console.error('Error in getVisitHistory:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getVisitDetailsById = async (req, res) => {
  try {
    return await userService.getVisitDetailsByIdService(res, req.body);
  } catch (error) {
    console.error('Error in getVisitDetailsById:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const storeCustomerVisit = async (req, res) => {
  try {
    return await userService.storeCustomerVisitService(res, req.body);
  } catch (error) {
    console.error('Error in storeCustomerVisit:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getMemberLedger = async (req, res) => {
  try {
    return await userService.getMemberLedgerService(res, req.user, req.body);
  } catch (error) {
    console.error('Error in getMemberLedger:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const referMember = async (req, res) => {
  try {
    return await userService.referMemberService(res, req.user, req.body);
  } catch (error) {
    console.error('Error in referMember:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getMyReferrals = async (req, res) => {
  try {
    const { min, max, search } = req.body;
    return await userService.getMyReferralsService(res, req.user, min, max, search);
  } catch (error) {
    console.error('Error in getMyReferrals:', error);
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
  getPaymentHistory,
  getPaymentReceipt,
  getBusinessListUnderMembers,
  getBusinessAgentCommissionSummary,
  storeOrUpdateHistoryBusinessAgent,
  getHistoryByGroupId,
  getCollectionAgentDashboard,
  getCollectionAgentGroupDashboard,
  getCollectionAgentActiveGroups,
  getPendingMembers,
  getMemberDues,
  getSubmissions,
  submitCollectionPayment,
  getAllGallery,
  registerDeviceToken,
  getNotificationHistory,
  markNotificationRead,
  getMemberDocuments,
  uploadMemberDocument,
  getGroupsByCollectionAgentId,
  getMembersByGroupId,
  getMembersByCollectionAgentId,
  getCustomerDetailsById,
  getVisitHistory,
  getVisitDetailsById,
  storeCustomerVisit,
  getMemberLedger,
  referMember,
  getMyReferrals
};
