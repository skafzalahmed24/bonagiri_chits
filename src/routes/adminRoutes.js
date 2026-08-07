const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const fixedSchemeController = require('../controllers/fixedSchemeController');
const validate = require('../middlewares/validate');
const MODULES = require('../utils/modules');
const authMiddleware = require('../middlewares/authMiddleware');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const adminValidation = require('../validations/adminValidation');
const userController = require('../controllers/userController');
const userValidation = require('../validations/userValidation');
const { authRateLimiter } = require('../middlewares/rateLimiter');

// auth routes
router.post('/login', authRateLimiter, authMiddleware.authenticateDefaultToken, validate(adminValidation.loginAdminSchema), adminController.loginAdmin);
router.post('/refresh-token', authMiddleware.authenticateDefaultToken, validate(adminValidation.refreshTokenSchema), adminController.refreshToken);

// company routes
router.post('/user/login', authRateLimiter, authMiddleware.authenticateDefaultToken, validate(adminValidation.companyLoginSchema), adminController.loginCompany);

// forgot password routes
router.post('/forgot-password', authRateLimiter, authMiddleware.authenticateDefaultToken, validate(adminValidation.forgotPasswordSchema), adminController.forgotPassword);
router.post('/verify-otp', authRateLimiter, authMiddleware.authenticateDefaultToken, validate(adminValidation.verifyOtpSchema), adminController.verifyOtp);
router.post('/reset-password', authRateLimiter, authMiddleware.authenticateDefaultToken, validate(adminValidation.resetPasswordSchema), adminController.resetPassword);
router.post('/change-password', authRateLimiter, authMiddleware.authenticateToken, validate(adminValidation.changePasswordSchema), adminController.changePassword);

// Contact Us routes
router.post('/contact-us/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.U_CONTACT_US), validate(adminValidation.storeOrUpdateContactUsSchema), adminController.storeOrUpdateContactUs);
router.post('/contact-us/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllContactUsSchema), adminController.getAllContactUs);
router.post('/contact-us/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getContactUsById);
router.post('/contact-us/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.U_CONTACT_US), validate(adminValidation.deleteContactUsSchema), adminController.deleteContactUs);

// FAQ routes
router.post('/faq/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.U_FAQ), validate(adminValidation.storeOrUpdateFAQSchema), adminController.storeOrUpdateFAQ);
router.post('/faq/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllFAQSchema), adminController.getAllFAQ);
router.post('/faq/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getFAQById);
router.post('/faq/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.U_FAQ), validate(adminValidation.deleteFAQSchema), adminController.deleteFAQ);

// Terms & Privacy routes
router.post('/terms-privacy/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.U_TERMS_PRIVACY), validate(adminValidation.storeOrUpdateTermsPrivacySchema), adminController.storeOrUpdateTermsPrivacy);
router.post('/terms-privacy/get', authMiddleware.authenticateToken, validate(adminValidation.getTermsPrivacySchema), adminController.getTermsPrivacy);

// Logout route
router.post('/logout', authMiddleware.authenticateToken, adminController.logout);

// Protected company routes
router.post('/company/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.companyValidator), adminController.storeOrUpdateCompanyRegistraction);
router.post('/company/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllCompanySchema), adminController.getAllCompanyDetails);
router.post('/company/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteCompanySchema), adminController.deleteCompany);

//member routes
router.post('/member/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.memberValidator), adminController.storeOrUpdateMember);
router.post('/member/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.getAllMemberSchema), adminController.getAllMemberDetails);
router.post('/member/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.deleteMemberSchema), adminController.deleteMember);
router.post('/member/verification/send-otp', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.sendMemberOtpSchema), adminController.sendMemberVerificationOtp);
router.post('/member/verification/verify-otp', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.verifyMemberOtpSchema), adminController.verifyMemberOtp);

// upload routes
router.post('/upload/document', authMiddleware.authenticateToken, uploadMiddleware.array('document', 20), validate(adminValidation.uploadDocumentSchema), adminController.uploadDocument);

// routes management
router.post('/route/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ROUTES), validate(adminValidation.routeValidator), adminController.storeOrUpdateRoute);
router.post('/route/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ROUTES), validate(adminValidation.getAllRouteSchema), adminController.getAllRouteDetails);
router.post('/route/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ROUTES), validate(adminValidation.deleteRouteSchema), adminController.deleteRoute);

// area management
router.post('/area/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_AREAS), validate(adminValidation.areaValidator), adminController.storeOrUpdateArea);
router.post('/area/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_AREAS), validate(adminValidation.getAllAreaSchema), adminController.getAllAreaDetails);
router.post('/area/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_AREAS), validate(adminValidation.deleteAreaSchema), adminController.deleteArea);

// chits-group management
router.post('/chits-group/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CHITS), validate(adminValidation.chitsGroupValidator), adminController.storeOrUpdateChitsGroup);
router.post('/chits-group/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CHITS), validate(adminValidation.getAllChitsGroupSchema), adminController.getAllChitsGroupDetails);
router.post('/chits-group/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CHITS), validate(adminValidation.deleteChitsGroupSchema), adminController.deleteChitsGroup);
router.post('/chits-group/update-status', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CHITS), validate(adminValidation.updateChitsGroupStatusSchema), adminController.updateChitsGroupStatus);
router.post('/chits-group/check-capacity', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CHITS), validate(adminValidation.getByIdSchema), adminController.checkChitsGroupCapacity);

// audit logs route
router.post('/audit-logs/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.AUDIT_LOG), adminController.getAllAuditLogs);

// import locations 
router.post('/import-locations', authMiddleware.authenticateToken, adminController.importLocations);

// country & state routes
router.post('/get-countries', authMiddleware.authenticateToken, validate(adminValidation.getCountriesSchema), adminController.getCountriesList);
router.post('/get-states', authMiddleware.authenticateToken, validate(adminValidation.getStatesSchema), adminController.getStatesList);

// district routes
router.post('/district/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_DISTRICTS), validate(adminValidation.districtValidator), adminController.storeOrUpdateDistrict);
router.post('/district/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_DISTRICTS), validate(adminValidation.getAllDistrictSchema), adminController.getAllDistrictDetails);
router.post('/get-districts', authMiddleware.authenticateToken, validate(adminValidation.getDistrictsSchema), adminController.getDistrictsList);

// city routes
router.post('/city/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CITIES), validate(adminValidation.cityValidator), adminController.storeOrUpdateCity);
router.post('/city/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CITIES), validate(adminValidation.getAllCitySchema), adminController.getAllCityDetails);
router.post('/city/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CITIES), validate(adminValidation.deleteCitySchema), adminController.deleteCity);

router.post('/fetch-static-dropdown', authMiddleware.authenticateToken, validate(adminValidation.fetchStaticDropdownSchema), adminController.fetchStaticDropdown);
router.post('/fetch-static-dropdown-subcategory', authMiddleware.authenticateToken, adminController.getAllSubcategories);

// Enrollment Routes
router.post('/enrollment/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ENROLLMENTS), validate(adminValidation.enrollmentValidator), adminController.storeOrUpdateEnrollment);
router.post('/enrollment/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ENROLLMENTS), validate(adminValidation.getEnrollmentSchema), adminController.getAllEnrollmentDetails);
router.post('/enrollment/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ENROLLMENTS), validate(adminValidation.deleteEnrollmentSchema), adminController.deleteEnrollment);
router.post('/enrollment/get-position-numbers', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ENROLLMENTS), validate(adminValidation.getPositionNumbersSchema), adminController.getPositionNumbers);

// upcoming-chit routes
router.post('/upcoming-chit/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_UPCOMING), validate(adminValidation.upcomingChitValidator), adminController.storeOrUpdateUpcomingChit);
router.post('/upcoming-chit/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_UPCOMING), validate(adminValidation.getAllUpcomingChitSchema), adminController.getAllUpcomingChits);
router.post('/upcoming-chit/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_UPCOMING), validate(adminValidation.deleteUpcomingChitSchema), adminController.deleteUpcomingChit);

router.post('/favorite/update', authMiddleware.authenticateToken, validate(adminValidation.updateFavoritesSchema), adminController.updateFavorites);

//fetch members by group id 
router.post('/group/members', authMiddleware.authenticateToken, validate(adminValidation.getGroupMembersSchema), adminController.getGroupMembers);

// suit-file-information routes
router.post('/suit-file-information/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_SUIT_FILE), validate(adminValidation.suitFileInformationValidator), adminController.storeOrUpdateSuitFileInformation);
router.post('/suit-file-information/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_SUIT_FILE), validate(adminValidation.getAllSuitFileInformationSchema), adminController.getAllSuitFileInformation);
router.post('/suit-file-information/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_SUIT_FILE), validate(adminValidation.deleteSuitFileInformationSchema), adminController.deleteSuitFileInformation);

// auction routes
router.post('/auction/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AUCTIONS), validate(adminValidation.auctionValidator), adminController.storeOrUpdateAuction);
router.post('/auction/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AUCTIONS), validate(adminValidation.getAllAuctionsSchema), adminController.getAllAuctions);
router.post('/auction/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AUCTIONS), validate(adminValidation.deleteAuctionSchema), adminController.deleteAuction);

// agent by type routes
router.post('/agent/get-by-type', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AGENT_SETUP), validate(adminValidation.getAgentTargetSchema), adminController.getAgentByAgentType);
router.post('/agent/get-enrollments', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AGENT_SETUP), validate(adminValidation.getAgentEnrollmentsSchema), adminController.getAgentEnrollments);
router.post('/agent-target-entry/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_AGENT_TARGETS), validate(adminValidation.storeOrUpdateAgentTargetEntrySchema), adminController.storeOrUpdateAgentTargetEntry);
router.post('/member/get-filtered-by-group-agent', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.getFilteredMembersByGroupAndAgentSchema), adminController.getFilteredMembersByGroupAndAgent);
router.post('/agent/transfer-agent', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_AGENT_TRANSFER), validate(adminValidation.transferAgentUpdateSchema), adminController.transferAgentUpdate);
router.post('/member/businesslist-under-members', authMiddleware.authenticateToken, validate(adminValidation.getBusinessListUnderMembersSchema), adminController.getBusinessListUnderMembers);

//get by id routes 
router.post('/company/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getCompanyById);
router.post('/member/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.getByIdSchema), adminController.getMemberById);
router.post('/route/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ROUTES), validate(adminValidation.getByIdSchema), adminController.getRouteById);
router.post('/area/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_AREAS), validate(adminValidation.getByIdSchema), adminController.getAreaById);
router.post('/chits-group/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CHITS), validate(adminValidation.getByIdSchema), adminController.getChitsGroupById);
router.post('/country/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getCountryById);
router.post('/state/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getStateById);
router.post('/district/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_DISTRICTS), validate(adminValidation.getByIdSchema), adminController.getDistrictById);
router.post('/city/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CITIES), validate(adminValidation.getByIdSchema), adminController.getCityById);
router.post('/enrollment/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ENROLLMENTS), validate(adminValidation.getByIdSchema), adminController.getEnrollmentById);
router.post('/upcoming-chit/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_UPCOMING), validate(adminValidation.getByIdSchema), adminController.getUpcomingChitById);
router.post('/suit-file-information/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_SUIT_FILE), validate(adminValidation.getByIdSchema), adminController.getSuitFileInformationById);
router.post('/auction/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AUCTIONS), validate(adminValidation.getByIdSchema), adminController.getAuctionById);


router.post('/group-under-static-list/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ACC_GROUPS), validate(adminValidation.getAllGroupUnderStaticListsSchema), adminController.getAllGroupUnderStaticLists);
router.post('/group-under-static-list/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ACC_GROUPS), validate(adminValidation.groupUnderStaticListValidator), adminController.storeOrUpdateGroupUnderStaticList);
router.post('/group-under-static-list/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ACC_GROUPS), validate(adminValidation.deleteGroupUnderStaticListSchema), adminController.deleteGroupUnderStaticList);
router.post('/group-under-static-list/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getGroupUnderStaticListById);

router.post('/account-creation-details/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ACCOUNTS), validate(adminValidation.storeOrUpdateAccountCreationDetailSchema), adminController.storeOrUpdateAccountCreationDetail);
router.post('/account-creation-details/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ACCOUNTS), validate(adminValidation.getAllGroupUnderStaticListsSchema), adminController.getAllAccountCreationDetails);
router.post('/account-creation-details/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ACCOUNTS), validate(adminValidation.getByIdSchema), adminController.getAccountCreationDetailById);
router.post('/account-creation-details/bulk-edit', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ACCOUNTS), validate(adminValidation.bulkEditAccountCreationDetailsSchema), adminController.bulkEditAccountCreationDetails);
router.post('/account-creation-details/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ACCOUNTS), validate(adminValidation.deleteAccountCreationDetailSchema), adminController.deleteAccountCreationDetail);
router.post('/account-tree/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_ACC_TREE), validate(adminValidation.getAllAccountTreeSchema), adminController.getAllAccountTree);

// self-chit routes
router.post('/self-chit/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_SELF_CHITS), validate(adminValidation.selfChitValidator), adminController.storeOrUpdateSelfChit);
router.post('/self-chit/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_SELF_CHITS), validate(adminValidation.getAllSelfChitSchema), adminController.getAllSelfChitDetails);
router.post('/self-chit/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_SELF_CHITS), validate(adminValidation.getByIdSchema), adminController.getSelfChitById);
router.post('/self-chit/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_SELF_CHITS), validate(adminValidation.deleteSelfChitSchema), adminController.deleteSelfChit);

// fixed-scheme-chits-configuration routes
router.post('/fixed-scheme/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CHIT_CONFIG), validate(adminValidation.storeOrUpdateFixedSchemeSchema), fixedSchemeController.storeOrUpdateFixedScheme);
router.post('/fixed-scheme/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CHIT_CONFIG), fixedSchemeController.getAllFixedSchemes);
router.post('/fixed-scheme/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CHIT_CONFIG), fixedSchemeController.getFixedSchemeById);
router.post('/fixed-scheme/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_CHIT_CONFIG), fixedSchemeController.deleteFixedScheme);

// configure-business-agent-commission routes
router.post('/configure-business-agent-commission/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AGENT_SETUP), validate(adminValidation.configureBusinessAgentCommissionValidator), adminController.storeOrUpdateConfigureBusinessAgentCommission);
router.post('/configure-business-agent-commission/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AGENT_SETUP), validate(adminValidation.getAllConfigureBusinessAgentCommissionSchema), adminController.getAllConfigureBusinessAgentCommissions);
router.post('/configure-business-agent-commission/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AGENT_SETUP), validate(adminValidation.getByIdSchema), adminController.getConfigureBusinessAgentCommissionById);
router.post('/configure-business-agent-commission/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AGENT_SETUP), validate(adminValidation.deleteConfigureBusinessAgentCommissionSchema), adminController.deleteConfigureBusinessAgentCommission);

// history-business-agent routes
router.post('/history-business-agent/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.historyBusinessAgentValidator), adminController.storeOrUpdateHistoryBusinessAgent);
router.post('/history-business-agent/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllHistoryBusinessAgentSchema), adminController.getAllHistoryBusinessAgents);
router.post('/history-business-agent/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getHistoryBusinessAgentById);
router.post('/history-business-agent/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteHistoryBusinessAgentSchema), adminController.deleteHistoryBusinessAgent);

// business-agent summary route
router.post('/configure-business-agent-commission/summary-by-agent', authMiddleware.authenticateToken, validate(adminValidation.getBusinessAgentCommissionSummarySchema), adminController.getBusinessAgentCommissionSummary);
router.post('/history-business-agent/history-by-group-id', authMiddleware.authenticateToken, validate(adminValidation.getHistoryByGroupIdSchema), adminController.getHistoryByGroupId);

// collection-agent submissions update
router.post('/collection-agent/submissions/update-status', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_COLLECTION_VERIFY), validate(adminValidation.updateCollectionSubmissionStatusSchema), adminController.updateCollectionSubmissionStatus);
router.post('/collection-agent/submissions/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllCollectionSubmissionsSchema), adminController.getAllCollectionSubmissions);

// member documents
router.post('/member/documents/list', authMiddleware.authenticateToken, validate(adminValidation.getMemberDocumentsAdminSchema), adminController.getMemberDocumentsAdmin);
router.post('/member/documents/verify', authMiddleware.authenticateToken, validate(adminValidation.verifyMemberDocumentSchema), adminController.verifyMemberDocument);

// admin direct payment route
router.post('/customer-payment/store-direct', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_MEMBER_RECEIPTS), validate(adminValidation.storeDirectPaymentSchema), adminController.storeDirectPayment);
router.post('/customer-payment/get-all-receipts', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_MEMBER_RECEIPTS), validate(adminValidation.getAllReceiptsSchema), adminController.getAllReceipts);

// gallery routes
router.post('/gallery/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.galleryValidator), adminController.storeOrUpdateGallery);
router.post('/gallery/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllGallerySchema), adminController.getAllGallery);
router.post('/gallery/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getGalleryById);
router.post('/gallery/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteGallerySchema), adminController.deleteGallery);
// schedule view route
router.post('/chits-installment/get-by-group', authMiddleware.authenticateToken, adminController.getInstallmentsByGroup);

// record winner route
router.post('/auction/record-winner', authMiddleware.authenticateToken, adminController.recordWinner);


// staff routes
router.post('/staff/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.staffValidator), adminController.storeOrUpdateStaff);
router.post('/staff/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_USERS), validate(adminValidation.getAllStaffSchema), adminController.getAllStaff);
router.post('/staff/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_USERS), validate(adminValidation.getByIdSchema), adminController.getStaffById);
router.post('/staff/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteStaffSchema), adminController.deleteStaff);
router.post('/staff/change-password', authMiddleware.authenticateToken, validate(adminValidation.staffChangePasswordSchema), adminController.staffChangePassword);

// role routes
router.post('/role/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.roleValidator), adminController.storeOrUpdateRole);
router.post('/role/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_ROLES), validate(adminValidation.getAllRoleSchema), adminController.getAllRole);
router.post('/role/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_ROLES), validate(adminValidation.getByIdSchema), adminController.getRoleById);
router.post('/role/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteRoleSchema), adminController.deleteRole);

// dashboard route
router.post('/dashboard/summary', authMiddleware.authenticateToken, adminController.getDashboardSummary);

// fcm notifications routes
router.post('/admin/notifications/register-token', authMiddleware.authenticateToken, validate(adminValidation.registerTokenSchema), adminController.registerAdminToken);
router.post('/admin/notifications/send-manual', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.NOTIFICATIONS), validate(adminValidation.sendManualNotificationSchema), adminController.sendManualNotification);

// System Utilities Routes
router.get('/admin/system/settings', authMiddleware.authenticateToken, authMiddleware.requireRole('superadmin'), adminController.getSystemSettings);
router.put('/admin/system/settings/business-date', authMiddleware.authenticateToken, authMiddleware.requireRole('superadmin'), validate(adminValidation.updateBusinessDateSchema), adminController.updateBusinessDate);
router.put('/admin/system/settings/scheduler-mode', authMiddleware.authenticateToken, authMiddleware.requireRole('superadmin'), validate(adminValidation.updateSchedulerModeSchema), adminController.updateSchedulerMode);
router.get('/admin/system/settings/impact-preview', authMiddleware.authenticateToken, authMiddleware.requireRole('superadmin'), adminController.getSystemImpactPreview);
router.post('/admin/system/jobs/run', authMiddleware.authenticateToken, authMiddleware.requireRole('superadmin'), adminController.runSystemJobs);
router.post('/admin/system/audit-logs', authMiddleware.authenticateToken, authMiddleware.requireRole('superadmin'), adminController.getSystemAuditLogs);

// customer visit routes
router.post('/customer-visit/list', authMiddleware.authenticateToken, validate(adminValidation.getAllCustomerVisitsSchema), adminController.getAllCustomerVisits);
router.post('/customer-visit/details', authMiddleware.authenticateToken, validate(adminValidation.getCustomerVisitByIdSchema), adminController.getCustomerVisitById);
router.post('/customer-visit/status', authMiddleware.authenticateToken, validate(adminValidation.updateCustomerVisitStatusSchema), adminController.updateCustomerVisitStatus);

// reports routes
router.post('/reports/ledger', authMiddleware.authenticateToken, adminController.getLedgerReport);
router.post('/reports/statutory', authMiddleware.authenticateToken, adminController.getStatutoryReport);

// enquiry route
router.post('/enquiry/search', authMiddleware.authenticateToken, adminController.searchEnquiry);

module.exports = router;
