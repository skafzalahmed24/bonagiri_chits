'use strict';

const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { PlatformTermsPrivacy, PlatformSupportContact, PlatformSupportFaq, Member } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');
const twilioService = require('./twilioService');

/**
 * 1.1 Super Admin: Get Terms & Conditions or Privacy Policy
 */
const getTermsPrivacyService = async (res, type) => {
  try {
    const docType = parseInt(type, 10);
    const doc = await PlatformTermsPrivacy.findOne({ where: { type: docType } });

    if (doc) {
      return successResponse(res, statusCodes.OK, 'Success', {
        id: doc.id,
        type: doc.type,
        content: doc.content || ''
      });
    }

    // Return empty content when not set yet (HTTP 200)
    return successResponse(res, statusCodes.OK, 'Success', {
      type: docType,
      content: ''
    });
  } catch (error) {
    console.error('[PLATFORM SUPPORT] Error in getTermsPrivacyService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to fetch terms and privacy document');
  }
};

/**
 * 1.2 Super Admin: Store or Update Terms & Conditions or Privacy Policy
 */
const storeOrUpdateTermsPrivacyService = async (res, type, content) => {
  try {
    const docType = parseInt(type, 10);
    let doc = await PlatformTermsPrivacy.findOne({ where: { type: docType } });

    if (doc) {
      await doc.update({ content: content || '' });
    } else {
      doc = await PlatformTermsPrivacy.create({
        type: docType,
        content: content || ''
      });
    }

    return successResponse(res, statusCodes.OK, 'Document updated successfully', {
      id: doc.id,
      type: doc.type,
      content: doc.content
    });
  } catch (error) {
    console.error('[PLATFORM SUPPORT] Error in storeOrUpdateTermsPrivacyService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to save terms and privacy document');
  }
};

/**
 * 2.1 Super Admin: Get Platform Support Contact Info
 */
const getSupportContactService = async (res) => {
  try {
    const contact = await PlatformSupportContact.findOne({ order: [['id', 'ASC']] });

    if (!contact) {
      return successResponse(res, statusCodes.OK, 'Success', null);
    }

    return successResponse(res, statusCodes.OK, 'Success', {
      id: contact.id,
      address: contact.address,
      phone_numbers: contact.phone_numbers || [],
      emails: contact.emails || [],
      website_link: contact.website_link,
      social_media_links: contact.social_media_links || {
        facebook: null,
        twitter: null,
        instagram: null,
        linkedin: null
      }
    });
  } catch (error) {
    console.error('[PLATFORM SUPPORT] Error in getSupportContactService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to fetch support contact info');
  }
};

/**
 * 2.2 Super Admin: Store or Update Platform Support Contact Info
 */
const storeOrUpdateSupportContactService = async (res, data) => {
  try {
    const { id, address, phone_numbers, emails, website_link, social_media_links } = data;

    let contact = null;
    if (id) {
      contact = await PlatformSupportContact.findByPk(id);
    }
    if (!contact) {
      contact = await PlatformSupportContact.findOne({ order: [['id', 'ASC']] });
    }

    const payload = {
      address: address !== undefined ? address : null,
      phone_numbers: phone_numbers !== undefined ? phone_numbers : [],
      emails: emails !== undefined ? emails : [],
      website_link: website_link !== undefined ? website_link : null,
      social_media_links: social_media_links !== undefined ? social_media_links : {
        facebook: null,
        twitter: null,
        instagram: null,
        linkedin: null
      }
    };

    if (contact) {
      await contact.update(payload);
    } else {
      contact = await PlatformSupportContact.create(payload);
    }

    return successResponse(res, statusCodes.OK, 'Contact information saved', {
      id: contact.id,
      address: contact.address,
      phone_numbers: contact.phone_numbers || [],
      emails: contact.emails || [],
      website_link: contact.website_link,
      social_media_links: contact.social_media_links || {}
    });
  } catch (error) {
    console.error('[PLATFORM SUPPORT] Error in storeOrUpdateSupportContactService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to save support contact info');
  }
};

/**
 * 2.3 Super Admin: Get All Platform FAQs
 */
const getAllSupportFaqService = async (res) => {
  try {
    const { count, rows } = await PlatformSupportFaq.findAndCountAll({
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });

    const formattedRows = rows.map(faq => ({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      sort_order: faq.sort_order
    }));

    return successResponse(res, statusCodes.OK, 'Success', {
      count,
      rows: formattedRows
    });
  } catch (error) {
    console.error('[PLATFORM SUPPORT] Error in getAllSupportFaqService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to fetch platform FAQs');
  }
};

/**
 * 2.4 Super Admin: Store or Update Platform FAQ
 */
const storeOrUpdateSupportFaqService = async (res, data) => {
  try {
    const { id, question, answer, sort_order } = data;

    let faq = null;
    if (id) {
      faq = await PlatformSupportFaq.findByPk(id);
      if (!faq) {
        return errorResponse(res, statusCodes.NOT_FOUND, 'FAQ not found');
      }

      await faq.update({
        question: question !== undefined ? question : faq.question,
        answer: answer !== undefined ? answer : faq.answer,
        sort_order: sort_order !== undefined ? sort_order : faq.sort_order
      });

      return successResponse(res, statusCodes.OK, 'FAQ updated', {
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        sort_order: faq.sort_order
      });
    }

    faq = await PlatformSupportFaq.create({
      question,
      answer,
      sort_order: sort_order || 0
    });

    return successResponse(res, statusCodes.OK, 'FAQ created', {
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      sort_order: faq.sort_order
    });
  } catch (error) {
    console.error('[PLATFORM SUPPORT] Error in storeOrUpdateSupportFaqService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to save FAQ');
  }
};

/**
 * 2.5 Super Admin: Delete Platform FAQ
 */
const deleteSupportFaqService = async (res, id) => {
  try {
    const faq = await PlatformSupportFaq.findByPk(id);
    if (!faq) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'FAQ not found');
    }

    await faq.destroy();
    return successResponse(res, statusCodes.OK, 'FAQ deleted', null);
  } catch (error) {
    console.error('[PLATFORM SUPPORT] Error in deleteSupportFaqService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to delete FAQ');
  }
};

/**
 * 3.1 Public: Get Support Information (Contact & FAQs)
 */
const getPublicSupportService = async (res) => {
  try {
    const contact = await PlatformSupportContact.findOne({ order: [['id', 'ASC']] });
    const faqs = await PlatformSupportFaq.findAll({
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });

    const contactData = contact ? {
      id: contact.id,
      address: contact.address,
      phone_numbers: contact.phone_numbers || [],
      emails: contact.emails || [],
      website_link: contact.website_link,
      social_media_links: contact.social_media_links || {
        facebook: null,
        twitter: null,
        instagram: null,
        linkedin: null
      }
    } : null;

    const faqsData = faqs && faqs.length > 0 ? faqs.map(f => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      sort_order: f.sort_order
    })) : [];

    return successResponse(res, statusCodes.OK, 'Success', {
      contact: contactData,
      faqs: faqsData
    });
  } catch (error) {
    console.error('[PLATFORM SUPPORT] Error in getPublicSupportService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to fetch public support data');
  }
};

/**
 * Helper to find member by user_id, user_code, member_id, or mobile number
 */
const findMemberByIdentifier = async (identifier, withPassword = false) => {
  if (!identifier) return null;
  const cleanId = String(identifier).trim();
  const digitsOnly = cleanId.replace(/\D/g, '');
  const last10Digits = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

  const whereConditions = [
    { member_id: cleanId },
    { mobile_number: cleanId },
    { mobile_number: last10Digits }
  ];

  const parsedNum = parseInt(cleanId, 10);
  // Only search on INTEGER columns if within 32-bit signed integer range to prevent PG integer overflow
  if (!isNaN(parsedNum) && parsedNum > 0 && parsedNum <= 2147483647 && /^\d+$/.test(cleanId) && cleanId.length <= 9) {
    whereConditions.push({ id: parsedNum });
    whereConditions.push({ other_info_user_code: parsedNum });
  }

  if (digitsOnly.length > 10) {
    whereConditions.push({ mobile_number: digitsOnly });
    whereConditions.push({ mobile_number: `+${digitsOnly}` });
  }

  const queryOptions = {
    where: {
      [Op.and]: [
        { is_deleted_status: 0 },
        { [Op.or]: whereConditions }
      ]
    }
  };

  const model = withPassword ? Member.scope('withPassword') : Member;
  return await model.findOne(queryOptions);
};

/**
 * 4.1 Public: Send Delete Account OTP
 */
const sendDeleteAccountOtpService = async (res, identifier, password) => {
  try {
    const member = await findMemberByIdentifier(identifier, true);

    if (!member || !member.other_info_user_password) {
      return errorResponse(res, statusCodes.OK, 'Incorrect User ID or password. Please try again.');
    }

    const isPasswordValid = await bcrypt.compare(password, member.other_info_user_password);
    if (!isPasswordValid) {
      return errorResponse(res, statusCodes.OK, 'Incorrect User ID or password. Please try again.');
    }

    if (member.is_active === false) {
      return errorResponse(res, statusCodes.OK, 'This account is already deactivated.');
    }

    const isStatic = twilioService.isStaticOtp();
    const otp = isStatic ? '123456' : Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    await member.update({
      delete_account_otp: otp,
      delete_account_otp_expires_at: expiresAt
    });

    const targetMobile = member.mobile_number;
    console.log(`[DELETE ACCOUNT OTP] Triggered OTP for Member ID ${member.id} (${member.other_info_user_code || member.name || 'Member'}) | Mobile: ${targetMobile || 'NO MOBILE'} | Mode: ${isStatic ? 'STATIC (123456)' : 'DYNAMIC TWILIO'}`);

    if (targetMobile) {
      await twilioService.sendOtpWithCustomSms(targetMobile, otp, member.country_code || null);
    } else {
      console.warn(`[DELETE ACCOUNT OTP] Member ID ${member.id} has no mobile number on file. SMS trigger skipped.`);
    }

    return successResponse(res, statusCodes.OK, 'OTP sent to your registered mobile number', null);
  } catch (error) {
    console.error('[DELETE ACCOUNT OTP] Error in sendDeleteAccountOtpService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to process delete account request');
  }
};

/**
 * 4.2 Public: Verify Delete Account OTP & Deactivate Account
 */
const verifyDeleteAccountOtpService = async (res, identifier, otp) => {
  try {
    const member = await findMemberByIdentifier(identifier, false);

    if (!member) {
      return errorResponse(res, statusCodes.OK, 'Invalid OTP. Please check and try again.');
    }

    const now = new Date();
    if (!member.delete_account_otp_expires_at || now > new Date(member.delete_account_otp_expires_at)) {
      return errorResponse(res, statusCodes.OK, 'OTP has expired. Please request a new one.');
    }

    const isStatic = twilioService.isStaticOtp();
    const inputOtp = String(otp).trim();
    const isMatch = (isStatic && inputOtp === '123456') ||
      (member.delete_account_otp && member.delete_account_otp.trim() === inputOtp);

    if (!isMatch) {
      return errorResponse(res, statusCodes.OK, 'Invalid OTP. Please check and try again.');
    }

    // Deactivate member account and clear OTP fields
    await member.update({
      is_active: false,
      delete_account_otp: null,
      delete_account_otp_expires_at: null,
      device_unique_id: null,
      fcm_token: null
    });

    console.log(`[DELETE ACCOUNT VERIFY] Member ID ${member.id} (${member.other_info_user_code || member.name}) successfully deactivated.`);

    return successResponse(res, statusCodes.OK, 'Account deactivated successfully', null);
  } catch (error) {
    console.error('[DELETE ACCOUNT VERIFY] Error in verifyDeleteAccountOtpService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to verify OTP and deactivate account');
  }
};

module.exports = {
  getTermsPrivacyService,
  storeOrUpdateTermsPrivacyService,
  getSupportContactService,
  storeOrUpdateSupportContactService,
  getAllSupportFaqService,
  storeOrUpdateSupportFaqService,
  deleteSupportFaqService,
  getPublicSupportService,
  sendDeleteAccountOtpService,
  verifyDeleteAccountOtpService
};
