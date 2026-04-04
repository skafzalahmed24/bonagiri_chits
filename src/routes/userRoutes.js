const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const validate = require('../middlewares/validate');
const authMiddleware = require('../middlewares/authMiddleware');
const userValidation = require('../validations/userValidation');

// get home record based on subscriber_id
router.post('/home', authMiddleware.authenticateToken, validate(userValidation.getHomeRecordSchema), userController.getHomeRecord);
router.post('/all-chits-groups',  validate(userValidation.getAllHomeRecordsSchema), userController.getAllHomeRecords);


module.exports = router;
