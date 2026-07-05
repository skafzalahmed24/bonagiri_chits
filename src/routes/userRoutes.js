const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
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

// business-agent routes (authenticated)
router.post('/member/businesslist-under-members', authMiddleware.authenticateToken, validate(userValidation.getBusinessListUnderMembersSchema), userController.getBusinessListUnderMembers);

module.exports = router;
