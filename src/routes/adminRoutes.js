const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const fixedSchemeController = require('../controllers/fixedSchemeController');
const paymentAccountController = require('../controllers/paymentAccountController');
const accountingVoucherController = require('../controllers/accountingVoucherController');
const selfTransferController = require('../controllers/selfTransferController');
const borrowRepayController = require('../controllers/borrowRepayController');
const outgoingPaymentController = require('../controllers/outgoingPaymentController');
const expenditureController = require('../controllers/expenditureController');
const suretyDenominationController = require('../controllers/suretyDenominationController');
const reportController = require('../controllers/reportController');
const platformSupportController = require('../controllers/platformSupportController');
const bannerController = require('../controllers/bannerController');
const validate = require('../middlewares/validate');
const MODULES = require('../utils/modules');

const authMiddleware = require('../middlewares/authMiddleware');

const VOUCHER_MODULES = { CR: MODULES.T_CASH_RECEIPTS, CP: MODULES.T_CASH_PAYMENTS, BD: MODULES.T_BANK_DEPOSITS, BP: MODULES.T_BANK_PAYMENTS };
// Vouchers share endpoints; check the module for the voucher_type when the request carries one.
const voucherPermission = authMiddleware.requireAnyPermission((req) =>
  VOUCHER_MODULES[req.body?.voucher_type] ? [VOUCHER_MODULES[req.body.voucher_type]] : Object.values(VOUCHER_MODULES)
);
// Every Phase 1 accounting screen needs the payment-account dropdown.
const PAYMENT_ACCOUNT_READERS = [
  MODULES.M_PAYMENT_ACCOUNTS, MODULES.T_MEMBER_RECEIPTS, MODULES.T_COLLECTION_VERIFY, ...Object.values(VOUCHER_MODULES),
  MODULES.T_SELF_TRANSFER, MODULES.T_BORROW_REPAY, MODULES.T_PAYMENTS, MODULES.T_EXPENDITURE,
  MODULES.T_DAY_REPORT, MODULES.R_BALANCE_SUMMARY, MODULES.R_CASH_BOOK, MODULES.R_BANK_BOOK, MODULES.R_DAY_BOOK,
];
// Voucher forms need the ledger-account picker; reading the list is not managing accounts.
const LEDGER_ACCOUNT_READERS = [
  MODULES.M_ACCOUNTS, MODULES.M_ACC_GROUPS, MODULES.M_ACC_TREE, MODULES.M_OPENING_BAL,
  ...Object.values(VOUCHER_MODULES), MODULES.R_LEDGER,
];
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

// Twilio OTP test routes
// Twilio smoke-test routes — never mounted in production.
if (process.env.NODE_ENV !== 'production') {
  router.post('/test/send-otp', authMiddleware.authenticateDefaultToken, validate(adminValidation.testSendTwilioOtpSchema), adminController.testSendTwilioOtp);
  router.post('/test/verify-otp', authMiddleware.authenticateDefaultToken, validate(adminValidation.testVerifyTwilioOtpSchema), adminController.testVerifyTwilioOtp);
}
router.get('/app-countries', adminController.getAppSupportedCountries);
router.post('/app-countries', adminController.getAppSupportedCountries);


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

// Banner / Valid Offers routes
router.post('/banner/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.U_BANNERS), uploadMiddleware.single('banner_image'), validate(adminValidation.storeOrUpdateBannerSchema), bannerController.storeOrUpdateBanner);
router.post('/banner/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllBannersSchema), bannerController.getAllBanners);
router.post('/banner/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getBannerByIdSchema), bannerController.getBannerById);
router.post('/banner/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.U_BANNERS), validate(adminValidation.deleteBannerSchema), bannerController.deleteBanner);
router.post('/banner/status', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.U_BANNERS), validate(adminValidation.changeBannerStatusSchema), bannerController.changeBannerStatus);

// Logout route
router.post('/logout', authMiddleware.authenticateToken, adminController.logout);

// Protected company routes
router.post('/company/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.companyValidator), adminController.storeOrUpdateCompanyRegistraction);
router.post('/company/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllCompanySchema), adminController.getAllCompanyDetails);
router.post('/company/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteCompanySchema), adminController.deleteCompany);

//member routes
router.post('/member/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.memberValidator), adminController.storeOrUpdateMember);
router.post('/member/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.getAllMemberSchema), adminController.getAllMemberDetails);
router.post('/member/report-360', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.getMember360ReportSchema), adminController.getMember360Report);
router.post('/member/overall-report', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.getMember360ReportSchema), adminController.getMember360Report);
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
// Seeds countries and states for the whole platform — super admin only.
router.post('/import-locations', authMiddleware.authenticateSuperAdminToken, adminController.importLocations);

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
router.post('/agent-target-entry/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_AGENT_TARGETS), validate(adminValidation.getAllAgentTargetEntrySchema), adminController.getAllAgentTargetEntry);
router.post('/member/get-filtered-by-group-agent', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.getFilteredMembersByGroupAndAgentSchema), adminController.getFilteredMembersByGroupAndAgent);
router.post('/agent/transfer-agent', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_AGENT_TRANSFER), validate(adminValidation.transferAgentUpdateSchema), adminController.transferAgentUpdate);
router.post('/member/businesslist-under-members', authMiddleware.authenticateToken, validate(adminValidation.getBusinessListUnderMembersSchema), adminController.getBusinessListUnderMembers);

//get by id routes 
// Company Setup — the company's own profile; scoped to the token, no id accepted.
router.post('/company/setup/get', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.U_COMPANY_SETUP), adminController.getCompanySetup);
router.post('/company/setup/update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.U_COMPANY_SETUP), validate(adminValidation.companySetupSchema), adminController.updateCompanySetup);
router.post('/company/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getCompanyById);
router.post('/member/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermissionOrUserRole(MODULES.M_MEMBERS, 'member'), validate(adminValidation.getByIdSchema), adminController.getMemberById);
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
router.post('/account-creation-details/get-all', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission(LEDGER_ACCOUNT_READERS), validate(adminValidation.getAllGroupUnderStaticListsSchema), adminController.getAllAccountCreationDetails);
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
router.post('/history-business-agent/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AGENT_SETUP), validate(adminValidation.historyBusinessAgentValidator), adminController.storeOrUpdateHistoryBusinessAgent);
router.post('/history-business-agent/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AGENT_SETUP), validate(adminValidation.getAllHistoryBusinessAgentSchema), adminController.getAllHistoryBusinessAgents);
router.post('/history-business-agent/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AGENT_SETUP), validate(adminValidation.getByIdSchema), adminController.getHistoryBusinessAgentById);
router.post('/history-business-agent/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AGENT_SETUP), validate(adminValidation.deleteHistoryBusinessAgentSchema), adminController.deleteHistoryBusinessAgent);

// business-agent summary route
router.post('/configure-business-agent-commission/summary-by-agent', authMiddleware.authenticateToken, validate(adminValidation.getBusinessAgentCommissionSummarySchema), adminController.getBusinessAgentCommissionSummary);
router.post('/history-business-agent/history-by-group-id', authMiddleware.authenticateToken, validate(adminValidation.getHistoryByGroupIdSchema), adminController.getHistoryByGroupId);
router.post('/configure-business-agent-commission/chit-detail', authMiddleware.authenticateToken, validate(adminValidation.getBusinessAgentChitDetailSchema), adminController.getBusinessAgentChitDetail);

// collection-agent submissions update
router.post('/collection-agent/submissions/update-status', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_COLLECTION_VERIFY), validate(adminValidation.updateCollectionSubmissionStatusSchema), adminController.updateCollectionSubmissionStatus);
router.post('/collection-agent/submissions/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_COLLECTION_VERIFY), validate(adminValidation.getAllCollectionSubmissionsSchema), adminController.getAllCollectionSubmissions);

// member documents
router.post('/member/documents/list', authMiddleware.authenticateToken, validate(adminValidation.getMemberDocumentsAdminSchema), adminController.getMemberDocumentsAdmin);
router.post('/member/documents/verify', authMiddleware.authenticateToken, validate(adminValidation.verifyMemberDocumentSchema), adminController.verifyMemberDocument);

// admin direct payment route
router.post('/customer-payment/store-direct', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_MEMBER_RECEIPTS), validate(adminValidation.storeDirectPaymentSchema), adminController.storeDirectPayment);
router.post('/customer-payment/get-all-receipts', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_ALL_RECEIPTS), validate(adminValidation.getAllReceiptsSchema), adminController.getAllReceipts);

// member advances
router.post('/member-advance/get-by-member', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_MEMBER_RECEIPTS), validate(adminValidation.getAdvancesByMemberSchema), adminController.getAdvancesByMember);
router.post('/member-advance/apply', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_MEMBER_RECEIPTS), validate(adminValidation.applyAdvanceSchema), adminController.applyAdvance);

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

// Role specific routes
router.post('/role/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_ROLES), validate(adminValidation.roleValidator), adminController.storeOrUpdateRole);
router.post('/role/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_ROLES), validate(adminValidation.getAllRoleSchema), adminController.getAllRole);
router.post('/role/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_ROLES), validate(adminValidation.getByIdSchema), adminController.getRoleById);
router.post('/role/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_ROLES), validate(adminValidation.deleteRoleSchema), adminController.deleteRole);

// Payment Accounts specific routes
router.post('/payment-account/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_PAYMENT_ACCOUNTS), paymentAccountController.storeOrUpdatePaymentAccount);
router.post('/payment-account/get-all', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission(PAYMENT_ACCOUNT_READERS), paymentAccountController.getAllPaymentAccounts);
router.post('/payment-account/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_PAYMENT_ACCOUNTS), paymentAccountController.deletePaymentAccount);

// dashboard route
router.post('/dashboard/summary', authMiddleware.authenticateToken, adminController.getDashboardSummary);

// fcm notifications routes
router.post('/admin/notifications/register-token', authMiddleware.authenticateToken, validate(adminValidation.registerTokenSchema), adminController.registerAdminToken);
router.post('/admin/notifications/send-manual', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.NOTIFICATIONS), validate(adminValidation.sendManualNotificationSchema), adminController.sendManualNotification);
router.post('/admin/notifications/history', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.NOTIFICATIONS), validate(adminValidation.getAdminNotificationHistorySchema), adminController.getAdminNotificationHistory);

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
router.post('/reports/ledger', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.R_LEDGER), adminController.getLedgerReport);
router.post('/reports/statutory', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.R_GROUPS_LIST), adminController.getStatutoryReport);

// enquiry route
router.post('/enquiry/search', authMiddleware.authenticateToken, adminController.searchEnquiry);

// member referrals
router.post('/refer-members', authMiddleware.authenticateToken, validate(adminValidation.getMemberReferralsSchema), adminController.getMemberReferrals);
router.post('/refer-members/update-status', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.M_MEMBERS), validate(adminValidation.updateMemberReferralStatusSchema), adminController.updateMemberReferralStatus);

// Super Admin Terms & Privacy routes
router.post('/super-admin/terms-privacy/get', authMiddleware.authenticateSuperAdminToken, validate(adminValidation.getPlatformTermsPrivacySchema), platformSupportController.getPlatformTermsPrivacy);
router.post('/super-admin/terms-privacy/store-or-update', authMiddleware.authenticateSuperAdminToken, validate(adminValidation.storeOrUpdatePlatformTermsPrivacySchema), platformSupportController.storeOrUpdatePlatformTermsPrivacy);

// Super Admin Support routes (Contact Info & FAQs)
router.post('/super-admin/support/contact/get', authMiddleware.authenticateSuperAdminToken, platformSupportController.getPlatformSupportContact);
router.post('/super-admin/support/contact/store-or-update', authMiddleware.authenticateSuperAdminToken, validate(adminValidation.storeOrUpdatePlatformSupportContactSchema), platformSupportController.storeOrUpdatePlatformSupportContact);
router.post('/super-admin/support/faq/get-all', authMiddleware.authenticateSuperAdminToken, platformSupportController.getAllPlatformSupportFaq);
router.post('/super-admin/support/faq/store-or-update', authMiddleware.authenticateSuperAdminToken, validate(adminValidation.storeOrUpdatePlatformSupportFaqSchema), platformSupportController.storeOrUpdatePlatformSupportFaq);
router.post('/super-admin/support/faq/delete', authMiddleware.authenticateSuperAdminToken, validate(adminValidation.deletePlatformSupportFaqSchema), platformSupportController.deletePlatformSupportFaq);

// Public Terms & Privacy route
router.post('/public/terms-privacy', authMiddleware.authenticateDefaultToken, validate(adminValidation.getPlatformTermsPrivacySchema), platformSupportController.getPlatformTermsPrivacy);

// Public Support route
router.post('/public/support', authMiddleware.authenticateDefaultToken, platformSupportController.getPublicSupport);

// Member Delete Account routes
router.post('/member/delete-account/send-otp', authRateLimiter, authMiddleware.authenticateDefaultToken, validate(adminValidation.sendDeleteAccountOtpSchema), platformSupportController.sendDeleteAccountOtp);
router.post('/member/delete-account/verify', authRateLimiter, authMiddleware.authenticateDefaultToken, validate(adminValidation.verifyDeleteAccountOtpSchema), platformSupportController.verifyDeleteAccountOtp);

// Accounting Vouchers Routes
router.post('/accounting-voucher/get-all', authMiddleware.authenticateToken, voucherPermission, accountingVoucherController.getAll);
router.post('/accounting-voucher/get-by-id', authMiddleware.authenticateToken, voucherPermission, accountingVoucherController.getById);
router.post('/accounting-voucher/store-or-update', authMiddleware.authenticateToken, voucherPermission, accountingVoucherController.storeOrUpdate);
router.post('/accounting-voucher/delete', authMiddleware.authenticateToken, voucherPermission, accountingVoucherController.deleteVoucher);
router.post('/accounting-voucher/get-account-balance', authMiddleware.authenticateToken, voucherPermission, accountingVoucherController.getAccountBalance);

// Self Transfer Routes
router.post('/self-transfer/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_SELF_TRANSFER), selfTransferController.getAll);
router.post('/self-transfer/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_SELF_TRANSFER), selfTransferController.getById);
router.post('/self-transfer/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_SELF_TRANSFER), selfTransferController.storeOrUpdate);
router.post('/self-transfer/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_SELF_TRANSFER), selfTransferController.deleteTransfer);

// Borrow/Repay Routes
router.post('/borrow-repay/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_BORROW_REPAY), borrowRepayController.getAll);
router.post('/borrow-repay/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_BORROW_REPAY), borrowRepayController.getById);
router.post('/borrow-repay/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_BORROW_REPAY), borrowRepayController.storeOrUpdate);
router.post('/borrow-repay/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_BORROW_REPAY), borrowRepayController.deleteEntry);

// Outgoing Payments Routes
router.post('/outgoing-payment/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_PAYMENTS), outgoingPaymentController.getAll);
router.post('/outgoing-payment/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_PAYMENTS), outgoingPaymentController.getById);
router.post('/outgoing-payment/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_PAYMENTS), outgoingPaymentController.storeOrUpdate);
router.post('/outgoing-payment/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_PAYMENTS), outgoingPaymentController.deletePayment);

// Expenditure Routes
router.post('/expenditure/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_EXPENDITURE), expenditureController.getAll);
router.post('/expenditure/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_EXPENDITURE), expenditureController.getById);
router.post('/expenditure/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_EXPENDITURE), expenditureController.storeOrUpdate);
router.post('/expenditure/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_EXPENDITURE), expenditureController.deleteExpenditure);

// Reports Routes
router.post('/reports/day-report', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_DAY_REPORT), reportController.getDayReport);
router.post('/reports/cb-inflow', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.R_CB_INFLOW), reportController.getCbInflowReport);
router.post('/reports/account-book', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.R_CASH_BOOK, MODULES.R_BANK_BOOK]), reportController.getAccountBookReport);
router.post('/reports/day-book', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.R_DAY_BOOK), reportController.getDayBookReport);
// One engine behind every "... wise outstanding" report; group_by picks the bucket.
// Values for the eleven registrar forms; the wording lives in the frontend templates.
// Dues behind the legal notices. Read-only: unlike the old system, generating a
// notice here never posts incidental charges.
// Recorded auctions in a range; the bidder, register, dividend, GST and turnover reports are cuts of it.
// Verified receipts in a range, split by how the money came in: DCR, monthly summary, cheque enquiry.
// Sureties (guarantors on a ticket) and the day-close cash count.
router.post('/surety/get-all', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.T_SURETY_ENTRY, MODULES.R_SURETY_LIST]), suretyDenominationController.listSureties);
router.post('/surety/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_SURETY_ENTRY), suretyDenominationController.saveSurety);
router.post('/surety/delete', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_SURETY_ENTRY), suretyDenominationController.deleteSurety);
router.post('/denomination/get-by-date', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_DENOMINATIONS), suretyDenominationController.getDenomination);
router.post('/denomination/store-or-update', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_DENOMINATIONS), suretyDenominationController.saveDenomination);
// Picker lookups (names and ids only) for any office user; portal members are refused.
router.post('/options/chit-groups', authMiddleware.authenticateToken, authMiddleware.requireOfficeUser, reportController.getGroupOptions);
router.post('/options/members', authMiddleware.authenticateToken, authMiddleware.requireOfficeUser, reportController.getMemberOptions);
router.post('/reports/fdr-statement', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.R_FDR_RELEASE, MODULES.E_GROUP]), reportController.getFdrStatement);
router.post('/reports/agent-targets', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.R_AGENT_TARGETS), reportController.getAgentTargetReport);
router.post('/reports/advance-register', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.R_ADV_ADJUSTMENTS), reportController.getAdvanceRegister);
router.post('/reports/subscriber-ledger', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.C_SUB_LEDGER, MODULES.E_GROUP]), reportController.getSubscriberLedger);
router.post('/reports/account-copy', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.R_MEMBER_ACC_RECEIPT, MODULES.R_MEMBER_ACC_CRDR]), reportController.getAccountCopy);
router.post('/reports/subscribers', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.R_SUBSCRIBERS_LIST, MODULES.R_PERSONS_REPORT, MODULES.E_GROUP, MODULES.T_SURETY_ENTRY]), reportController.getSubscriberRegister);
// Points at likely duplicate members; never merges anything.
router.post('/reports/repeated-persons', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.U_REPEATED_PERSONS), reportController.getRepeatedPersons);
router.post('/reports/collection-register', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.R_DAILY_COLLECTION, MODULES.R_MONTHLY_COLLECTION, MODULES.R_CHEQUE_ENQUIRY, MODULES.R_DAY_REGISTER, MODULES.R_DEFAULT_CHARGE, MODULES.E_RECEIPT, MODULES.R_BULK_RECEIPT, MODULES.E_GROUP]), reportController.getCollectionRegister);
router.post('/reports/auction-register', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.R_AUCTION_TURNOVER, MODULES.R_BIDDERS_LIST, MODULES.R_GROUP_BIDDERS, MODULES.R_BIDS_REGISTER, MODULES.R_DIVIDEND_LIST, MODULES.R_GST_REPORT, MODULES.R_GST_SUMMARY, MODULES.R_MINUTES_FILING, MODULES.E_GROUP]), reportController.getAuctionRegister);
router.post('/reports/notice', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.R_PRL, MODULES.R_PRLG, MODULES.R_UCPL, MODULES.R_MRCL, MODULES.R_FORMAN_NOTICE, MODULES.R_LEGAL_NOTICE, MODULES.R_ADVOCATE_NOTICE, MODULES.R_INTIMATION, MODULES.R_DP_NOTICE, MODULES.R_NO_DUE]), reportController.getNoticeData);
router.post('/reports/statutory-form', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.R_FORM_1, MODULES.R_FORM_1B, MODULES.R_FORM_2, MODULES.R_FORM_3, MODULES.R_FORM_5, MODULES.R_FORM_6, MODULES.R_FORM_7, MODULES.R_FORM_10, MODULES.R_FORM_11, MODULES.R_ANNEXURE, MODULES.R_ACK]), reportController.getStatutoryFormContext);
router.post('/reports/outstanding', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.R_GROUP_OUTSTANDING, MODULES.R_AGENT_OUTSTANDING, MODULES.R_AREA_OUTSTANDING, MODULES.R_ROUTE_OUTSTANDING, MODULES.R_PS_OUTSTANDING, MODULES.R_NPS_OUTSTANDING, MODULES.R_SUIT_OUTSTANDING, MODULES.R_CUSTOM_OUTSTANDING, MODULES.R_DEFAULTER_LIST, MODULES.R_AGENT_WISE_OUTSTANDING, MODULES.E_PENALTY, MODULES.E_GROUP]), reportController.getOutstandingReport);
router.post('/reports/agent-float', authMiddleware.authenticateToken, authMiddleware.requireAnyPermission([MODULES.R_AGENT_FLOAT, MODULES.T_COLLECTION_VERIFY]), reportController.getAgentFloatReport);

module.exports = router;
