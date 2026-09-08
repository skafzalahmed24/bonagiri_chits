'use strict';

const platformSupportService = require('../services/platformSupportService');
const { errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

/**
 * 1.1 Super Admin: Get Terms & Privacy
 */
const getPlatformTermsPrivacy = async (req, res) => {
  try {
    const { type } = req.body;
    return await platformSupportService.getTermsPrivacyService(res, type);
  } catch (error) {
    console.error('[CONTROLLER] Error in getPlatformTermsPrivacy:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/**
 * 1.2 Super Admin: Store or Update Terms & Privacy
 */
const storeOrUpdatePlatformTermsPrivacy = async (req, res) => {
  try {
    const { type, content } = req.body;
    return await platformSupportService.storeOrUpdateTermsPrivacyService(res, type, content);
  } catch (error) {
    console.error('[CONTROLLER] Error in storeOrUpdatePlatformTermsPrivacy:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/**
 * 2.1 Super Admin: Get Support Contact
 */
const getPlatformSupportContact = async (req, res) => {
  try {
    return await platformSupportService.getSupportContactService(res);
  } catch (error) {
    console.error('[CONTROLLER] Error in getPlatformSupportContact:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/**
 * 2.2 Super Admin: Store or Update Support Contact
 */
const storeOrUpdatePlatformSupportContact = async (req, res) => {
  try {
    return await platformSupportService.storeOrUpdateSupportContactService(res, req.body);
  } catch (error) {
    console.error('[CONTROLLER] Error in storeOrUpdatePlatformSupportContact:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/**
 * 2.3 Super Admin: Get All FAQs
 */
const getAllPlatformSupportFaq = async (req, res) => {
  try {
    return await platformSupportService.getAllSupportFaqService(res);
  } catch (error) {
    console.error('[CONTROLLER] Error in getAllPlatformSupportFaq:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/**
 * 2.4 Super Admin: Store or Update FAQ
 */
const storeOrUpdatePlatformSupportFaq = async (req, res) => {
  try {
    return await platformSupportService.storeOrUpdateSupportFaqService(res, req.body);
  } catch (error) {
    console.error('[CONTROLLER] Error in storeOrUpdatePlatformSupportFaq:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/**
 * 2.5 Super Admin: Delete FAQ
 */
const deletePlatformSupportFaq = async (req, res) => {
  try {
    const { id } = req.body;
    return await platformSupportService.deleteSupportFaqService(res, id);
  } catch (error) {
    console.error('[CONTROLLER] Error in deletePlatformSupportFaq:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/**
 * 3.1 Public: Get Support Information
 */
const getPublicSupport = async (req, res) => {
  try {
    return await platformSupportService.getPublicSupportService(res);
  } catch (error) {
    console.error('[CONTROLLER] Error in getPublicSupport:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/**
 * 4.1 Public: Send Delete Account OTP
 */
const sendDeleteAccountOtp = async (req, res) => {
  try {
    const { mobile, password } = req.body;
    return await platformSupportService.sendDeleteAccountOtpService(res, mobile, password);
  } catch (error) {
    console.error('[CONTROLLER] Error in sendDeleteAccountOtp:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

/**
 * 4.2 Public: Verify Delete Account OTP & Deactivate
 */
const verifyDeleteAccountOtp = async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    return await platformSupportService.verifyDeleteAccountOtpService(res, mobile, otp);
  } catch (error) {
    console.error('[CONTROLLER] Error in verifyDeleteAccountOtp:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  getPlatformTermsPrivacy,
  storeOrUpdatePlatformTermsPrivacy,
  getPlatformSupportContact,
  storeOrUpdatePlatformSupportContact,
  getAllPlatformSupportFaq,
  storeOrUpdatePlatformSupportFaq,
  deletePlatformSupportFaq,
  getPublicSupport,
  sendDeleteAccountOtp,
  verifyDeleteAccountOtp
};
