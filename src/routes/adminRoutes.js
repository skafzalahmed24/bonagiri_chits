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
router.post('/company/login', authMiddleware.authenticateDefaultToken, validate(adminValidation.companyLoginSchema), adminController.loginCompany);

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

module.exports = router;
