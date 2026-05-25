const Joi = require('joi');

const getHomeRecordSchema = Joi.object({
  subscriber_id: Joi.string().required()
});

const getAllHomeRecordsSchema = Joi.object({
  subscriber_id: Joi.string().required(),
  type: Joi.number().valid(0, 1, 2).optional().default(0),
  min: Joi.number().min(0).optional().default(0),
  max: Joi.number().min(1).optional().default(10)
});

const getUpcomingChitsSchema = Joi.object({
  min: Joi.number().integer().min(0).optional().default(0),
  max: Joi.number().integer().min(1).optional().default(10)
});

const submitChitInterestSchema = Joi.object({
  upcoming_chit_id: Joi.string().uuid().required().messages({
    'any.required': 'Upcoming Chit ID is required',
    'string.uuid': 'Invalid Upcoming Chit ID format'
  }),
  showing_interest: Joi.number().integer().valid(0, 1).required().messages({
    'any.required': 'Showing Interest is required (1 = Interested, 0 = Not Interested)',
    'any.only': 'Invalid showing_interest value. Must be 0 or 1.'
  })
});

module.exports = {  
  getHomeRecordSchema,
  getAllHomeRecordsSchema,
  getUpcomingChitsSchema,
  submitChitInterestSchema
};
