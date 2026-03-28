const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const validate = require('../middlewares/validate');
const authMiddleware = require('../middlewares/authMiddleware');
const userValidation = require('../validations/userValidation');

// get home record based on subscriber_id
router.post('/home',  validate(userValidation.getHomeRecordSchema), userController.getHomeRecord);

module.exports = router;
