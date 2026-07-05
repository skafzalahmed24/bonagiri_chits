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

const getPendingPaymentsSchema = Joi.object({
  subscriber_id: Joi.number().integer().optional(),
  min: Joi.number().integer().min(0).optional().default(0),
  max: Joi.number().integer().min(1).optional().default(10)
});

const getBidsSchema = Joi.object({
  type: Joi.number().integer().valid(1, 2, 3).required().messages({
    'any.required': 'Type is required',
    'any.only': 'Invalid type. Must be 1 (ongoing), 2 (upcoming), or 3 (history).'
  }),
  min: Joi.number().integer().min(0).optional().default(0),
  max: Joi.number().integer().min(1).optional().default(10)
});

const getBidDetailsSchema = Joi.object({
  group_id: Joi.string().uuid().required().messages({
    'any.required': 'Group ID is required',
    'string.uuid': 'Invalid Group ID format'
  })
});

const getChitDetailsSchema = Joi.object({
  group_id: Joi.string().uuid().required().messages({
    'any.required': 'Group ID is required',
    'string.uuid': 'Invalid Group ID format'
  })
});

const getBusinessListUnderMembersSchema = Joi.object({
  business_agent_id: Joi.number().integer().required(),
  min: Joi.number().integer().min(0).optional(),
  max: Joi.number().integer().min(1).optional()
});

module.exports = {  
  getHomeRecordSchema,
  getAllHomeRecordsSchema,
  getUpcomingChitsSchema,
  submitChitInterestSchema,
  getPendingPaymentsSchema,
  getBidsSchema,
  getBidDetailsSchema,
  getChitDetailsSchema,
  getBusinessListUnderMembersSchema
};
