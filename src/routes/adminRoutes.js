const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
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

module.exports = router;
