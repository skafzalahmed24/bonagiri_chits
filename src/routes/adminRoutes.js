const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const fixedSchemeController = require('../controllers/fixedSchemeController');
const validate = require('../middlewares/validate');
const authMiddleware = require('../middlewares/authMiddleware');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const adminValidation = require('../validations/adminValidation');

// auth routes
router.post('/login', authMiddleware.authenticateDefaultToken, validate(adminValidation.loginAdminSchema), adminController.loginAdmin);
router.post('/refresh-token', authMiddleware.authenticateDefaultToken, validate(adminValidation.refreshTokenSchema), adminController.refreshToken);

// company routes
router.post('/user/login', authMiddleware.authenticateDefaultToken, validate(adminValidation.companyLoginSchema), adminController.loginCompany);

// forgot password routes
router.post('/forgot-password', authMiddleware.authenticateDefaultToken, validate(adminValidation.forgotPasswordSchema), adminController.forgotPassword);
router.post('/verify-otp', authMiddleware.authenticateDefaultToken, validate(adminValidation.verifyOtpSchema), adminController.verifyOtp);
router.post('/reset-password', authMiddleware.authenticateDefaultToken, validate(adminValidation.resetPasswordSchema), adminController.resetPassword);
router.post('/change-password', authMiddleware.authenticateToken, validate(adminValidation.changePasswordSchema), adminController.changePassword);

// Contact Us routes
router.post('/contact-us/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.storeOrUpdateContactUsSchema), adminController.storeOrUpdateContactUs);
router.post('/contact-us/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllContactUsSchema), adminController.getAllContactUs);
router.post('/contact-us/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getContactUsById);
router.post('/contact-us/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteContactUsSchema), adminController.deleteContactUs);

// FAQ routes
router.post('/faq/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.storeOrUpdateFAQSchema), adminController.storeOrUpdateFAQ);
router.post('/faq/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllFAQSchema), adminController.getAllFAQ);
router.post('/faq/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getFAQById);
router.post('/faq/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteFAQSchema), adminController.deleteFAQ);

// Terms & Privacy routes
router.post('/terms-privacy/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.storeOrUpdateTermsPrivacySchema), adminController.storeOrUpdateTermsPrivacy);
router.post('/terms-privacy/get', authMiddleware.authenticateToken, validate(adminValidation.getTermsPrivacySchema), adminController.getTermsPrivacy);

// Logout route
router.post('/logout', authMiddleware.authenticateToken, adminController.logout);

// Protected company routes
router.post('/company/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.companyValidator), adminController.storeOrUpdateCompanyRegistraction);
router.post('/company/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllCompanySchema), adminController.getAllCompanyDetails);
router.post('/company/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteCompanySchema), adminController.deleteCompany);

//member routes
router.post('/member/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.memberValidator), adminController.storeOrUpdateMember);
router.post('/member/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllMemberSchema), adminController.getAllMemberDetails);
router.post('/member/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteMemberSchema), adminController.deleteMember);

// upload routes
router.post('/upload/document', authMiddleware.authenticateToken, uploadMiddleware.array('document', 20), validate(adminValidation.uploadDocumentSchema), adminController.uploadDocument);

// routes management
router.post('/route/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.routeValidator), adminController.storeOrUpdateRoute);
router.post('/route/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllRouteSchema), adminController.getAllRouteDetails);
router.post('/route/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteRouteSchema), adminController.deleteRoute);

// area management
router.post('/area/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.areaValidator), adminController.storeOrUpdateArea);
router.post('/area/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllAreaSchema), adminController.getAllAreaDetails);
router.post('/area/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteAreaSchema), adminController.deleteArea);

// chits-group management
router.post('/chits-group/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.chitsGroupValidator), adminController.storeOrUpdateChitsGroup);
router.post('/chits-group/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllChitsGroupSchema), adminController.getAllChitsGroupDetails);
router.post('/chits-group/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteChitsGroupSchema), adminController.deleteChitsGroup);
router.post('/chits-group/update-status', authMiddleware.authenticateToken, validate(adminValidation.updateChitsGroupStatusSchema), adminController.updateChitsGroupStatus);

// import locations 
router.post('/import-locations', authMiddleware.authenticateToken, adminController.importLocations);

// country & state routes
router.post('/get-countries', authMiddleware.authenticateToken, validate(adminValidation.getCountriesSchema), adminController.getCountriesList);
router.post('/get-states', authMiddleware.authenticateToken, validate(adminValidation.getStatesSchema), adminController.getStatesList);

// district routes
router.post('/district/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.districtValidator), adminController.storeOrUpdateDistrict);
router.post('/district/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllDistrictSchema), adminController.getAllDistrictDetails);
router.post('/get-districts', authMiddleware.authenticateToken, validate(adminValidation.getDistrictsSchema), adminController.getDistrictsList);

// city routes
router.post('/city/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.cityValidator), adminController.storeOrUpdateCity);
router.post('/city/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllCitySchema), adminController.getAllCityDetails);
router.post('/city/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteCitySchema), adminController.deleteCity);

router.post('/fetch-static-dropdown', authMiddleware.authenticateToken, validate(adminValidation.fetchStaticDropdownSchema), adminController.fetchStaticDropdown);
router.post('/fetch-static-dropdown-subcategory', authMiddleware.authenticateToken, adminController.getAllSubcategories);

// Enrollment Routes
router.post('/enrollment/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.enrollmentValidator), adminController.storeOrUpdateEnrollment);
router.post('/enrollment/get-all', authMiddleware.authenticateToken, validate(adminValidation.getEnrollmentSchema), adminController.getAllEnrollmentDetails);
router.post('/enrollment/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteEnrollmentSchema), adminController.deleteEnrollment);
router.post('/enrollment/get-position-numbers', authMiddleware.authenticateToken, validate(adminValidation.getPositionNumbersSchema), adminController.getPositionNumbers);

// upcoming-chit routes
router.post('/upcoming-chit/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.upcomingChitValidator), adminController.storeOrUpdateUpcomingChit);
router.post('/upcoming-chit/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllUpcomingChitSchema), adminController.getAllUpcomingChits);
router.post('/upcoming-chit/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteUpcomingChitSchema), adminController.deleteUpcomingChit);

router.post('/favorite/update', authMiddleware.authenticateToken, validate(adminValidation.updateFavoritesSchema), adminController.updateFavorites);

//fetch members by group id 
router.post('/group/members', authMiddleware.authenticateToken, validate(adminValidation.getGroupMembersSchema), adminController.getGroupMembers);

// suit-file-information routes
router.post('/suit-file-information/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.suitFileInformationValidator), adminController.storeOrUpdateSuitFileInformation);
router.post('/suit-file-information/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllSuitFileInformationSchema), adminController.getAllSuitFileInformation);
router.post('/suit-file-information/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteSuitFileInformationSchema), adminController.deleteSuitFileInformation);

// auction routes
router.post('/auction/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.auctionValidator), adminController.storeOrUpdateAuction);
router.post('/auction/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllAuctionsSchema), adminController.getAllAuctions);
router.post('/auction/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteAuctionSchema), adminController.deleteAuction);

// agent by type routes
router.post('/agent/get-by-type', authMiddleware.authenticateToken, validate(adminValidation.getAgentTargetSchema), adminController.getAgentByAgentType);
router.post('/agent/get-enrollments', authMiddleware.authenticateToken, validate(adminValidation.getAgentEnrollmentsSchema), adminController.getAgentEnrollments);
router.post('/agent-target-entry/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.storeOrUpdateAgentTargetEntrySchema), adminController.storeOrUpdateAgentTargetEntry);
router.post('/member/get-filtered-by-group-agent', authMiddleware.authenticateToken, validate(adminValidation.getFilteredMembersByGroupAndAgentSchema), adminController.getFilteredMembersByGroupAndAgent);
router.post('/agent/transfer-agent', authMiddleware.authenticateToken, validate(adminValidation.transferAgentUpdateSchema), adminController.transferAgentUpdate);

//get by id routes 
router.post('/company/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getCompanyById);
router.post('/member/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getMemberById);
router.post('/route/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getRouteById);
router.post('/area/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getAreaById);
router.post('/chits-group/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getChitsGroupById);
router.post('/country/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getCountryById);
router.post('/state/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getStateById);
router.post('/district/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getDistrictById);
router.post('/city/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getCityById);
router.post('/enrollment/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getEnrollmentById);
router.post('/upcoming-chit/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getUpcomingChitById);
router.post('/suit-file-information/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getSuitFileInformationById);
router.post('/auction/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getAuctionById);


router.post('/group-under-static-list/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllGroupUnderStaticListsSchema), adminController.getAllGroupUnderStaticLists);
router.post('/group-under-static-list/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.groupUnderStaticListValidator), adminController.storeOrUpdateGroupUnderStaticList);
router.post('/group-under-static-list/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteGroupUnderStaticListSchema), adminController.deleteGroupUnderStaticList);
router.post('/group-under-static-list/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getGroupUnderStaticListById);

router.post('/account-creation-details/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.storeOrUpdateAccountCreationDetailSchema), adminController.storeOrUpdateAccountCreationDetail);
router.post('/account-creation-details/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllGroupUnderStaticListsSchema), adminController.getAllAccountCreationDetails);
router.post('/account-creation-details/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getAccountCreationDetailById);
router.post('/account-creation-details/bulk-edit', authMiddleware.authenticateToken, validate(adminValidation.bulkEditAccountCreationDetailsSchema), adminController.bulkEditAccountCreationDetails);
router.post('/account-creation-details/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteAccountCreationDetailSchema), adminController.deleteAccountCreationDetail);
router.post('/account-tree/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllAccountTreeSchema), adminController.getAllAccountTree);

// self-chit routes
router.post('/self-chit/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.selfChitValidator), adminController.storeOrUpdateSelfChit);
router.post('/self-chit/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllSelfChitSchema), adminController.getAllSelfChitDetails);
router.post('/self-chit/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getSelfChitById);
router.post('/self-chit/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteSelfChitSchema), adminController.deleteSelfChit);

// fixed-scheme-chits-configuration routes
router.post('/fixed-scheme/store-or-update', authMiddleware.authenticateToken, fixedSchemeController.storeOrUpdateFixedScheme);
router.post('/fixed-scheme/get-all', authMiddleware.authenticateToken, fixedSchemeController.getAllFixedSchemes);
router.post('/fixed-scheme/get-by-id', authMiddleware.authenticateToken, fixedSchemeController.getFixedSchemeById);
router.post('/fixed-scheme/delete', authMiddleware.authenticateToken, fixedSchemeController.deleteFixedScheme);

// configure-business-agent-commission routes
router.post('/configure-business-agent-commission/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.configureBusinessAgentCommissionValidator), adminController.storeOrUpdateConfigureBusinessAgentCommission);
router.post('/configure-business-agent-commission/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllConfigureBusinessAgentCommissionSchema), adminController.getAllConfigureBusinessAgentCommissions);
router.post('/configure-business-agent-commission/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getConfigureBusinessAgentCommissionById);
router.post('/configure-business-agent-commission/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteConfigureBusinessAgentCommissionSchema), adminController.deleteConfigureBusinessAgentCommission);

// history-business-agent routes
router.post('/history-business-agent/store-or-update', authMiddleware.authenticateToken, validate(adminValidation.historyBusinessAgentValidator), adminController.storeOrUpdateHistoryBusinessAgent);
router.post('/history-business-agent/get-all', authMiddleware.authenticateToken, validate(adminValidation.getAllHistoryBusinessAgentSchema), adminController.getAllHistoryBusinessAgents);
router.post('/history-business-agent/get-by-id', authMiddleware.authenticateToken, validate(adminValidation.getByIdSchema), adminController.getHistoryBusinessAgentById);
router.post('/history-business-agent/delete', authMiddleware.authenticateToken, validate(adminValidation.deleteHistoryBusinessAgentSchema), adminController.deleteHistoryBusinessAgent);

// business-agent summary route
router.post('/configure-business-agent-commission/summary-by-agent', authMiddleware.authenticateToken, validate(adminValidation.getBusinessAgentCommissionSummarySchema), adminController.getBusinessAgentCommissionSummary);
router.post('/history-business-agent/history-by-group-id', authMiddleware.authenticateToken, validate(adminValidation.getHistoryByGroupIdSchema), adminController.getHistoryByGroupId);

module.exports = router;
