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

module.exports = router;
