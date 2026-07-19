const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const fixedSchemeController = require('../controllers/fixedSchemeController');
const validate = require('../middlewares/validate');
const authMiddleware = require('../middlewares/authMiddleware');
const userValidation = require('../validations/userValidation');

// get home record based on subscriber_id
router.post('/home', authMiddleware.authenticateToken, validate(userValidation.getHomeRecordSchema), userController.getHomeRecord);
router.post('/all-chits-groups',  validate(userValidation.getAllHomeRecordsSchema), userController.getAllHomeRecords);

// upcoming chits routes (authenticated)
router.post('/upcoming-chits', authMiddleware.authenticateToken, validate(userValidation.getUpcomingChitsSchema), userController.getUpcomingChits);
router.post('/upcoming-chit/interest', authMiddleware.authenticateToken, validate(userValidation.submitChitInterestSchema), userController.submitChitInterest);

// pending payments route (authenticated)
router.post('/pending-payments', authMiddleware.authenticateToken, validate(userValidation.getPendingPaymentsSchema), userController.getPendingPayments);

// bids and bid-details routes (authenticated)
router.post('/bids', authMiddleware.authenticateToken, validate(userValidation.getBidsSchema), userController.getBids);
router.post('/bid-details', authMiddleware.authenticateToken, validate(userValidation.getBidDetailsSchema), userController.getBidDetails);
router.post('/chit-details', authMiddleware.authenticateToken, validate(userValidation.getChitDetailsSchema), userController.getChitDetails);

// payment history & receipt routes (authenticated)
router.post('/payment-history', authMiddleware.authenticateToken, validate(userValidation.getPaymentHistorySchema), userController.getPaymentHistory);
router.post('/payment-receipt', authMiddleware.authenticateToken, validate(userValidation.getPaymentReceiptSchema), userController.getPaymentReceipt);

// business-agent routes (authenticated)
router.post('/member/businesslist-under-members', authMiddleware.authenticateToken, validate(userValidation.getBusinessListUnderMembersSchema), userController.getBusinessListUnderMembers);

// collection-agent routes (authenticated)
router.post('/collection-agent/dashboard', authMiddleware.authenticateToken, validate(userValidation.getCollectionAgentDashboardSchema), userController.getCollectionAgentDashboard);
router.post('/collection-agent/group-dashboard', authMiddleware.authenticateToken, validate(userValidation.getCollectionAgentGroupDashboardSchema), userController.getCollectionAgentGroupDashboard);
router.post('/collection-agent/active-groups', authMiddleware.authenticateToken, validate(userValidation.getCollectionAgentActiveGroupsSchema), userController.getCollectionAgentActiveGroups);
router.post('/collection-agent/pending-members', authMiddleware.authenticateToken, validate(userValidation.getPendingMembersSchema), userController.getPendingMembers);
router.post('/collection-agent/member-dues', authMiddleware.authenticateToken, validate(userValidation.getMemberDuesSchema), userController.getMemberDues);
router.post('/collection-agent/submissions', authMiddleware.authenticateToken, validate(userValidation.getSubmissionsSchema), userController.getSubmissions);
router.post('/collection-agent/submit-payment', authMiddleware.authenticateToken, validate(userValidation.submitCollectionPaymentSchema), userController.submitCollectionPayment);

// gallery routes
router.post('/gallery/get-all', authMiddleware.authenticateToken, validate(userValidation.getAllGallerySchema), userController.getAllGallery);

// Fixed Scheme Chits Routes (Public / No Authorization)
router.post('/fixed-scheme-details', fixedSchemeController.getFixedSchemeByType);

// fcm notifications routes
router.post('/notifications/register-token', authMiddleware.authenticateToken, validate(userValidation.registerTokenSchema), userController.registerDeviceToken);
router.post('/notifications/history', authMiddleware.authenticateToken, validate(userValidation.getNotificationHistorySchema), userController.getNotificationHistory);
router.post('/notifications/mark-read', authMiddleware.authenticateToken, validate(userValidation.markNotificationReadSchema), userController.markNotificationRead);

module.exports = router;
