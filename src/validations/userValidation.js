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

const getPaymentHistorySchema = Joi.object({
  group_id: Joi.string().uuid().optional().allow(null, ''),
  min: Joi.number().integer().min(0).optional().default(0),
  max: Joi.number().integer().min(1).optional().default(20)
});

const getPaymentReceiptSchema = Joi.object({
  payment_id: Joi.string().uuid().required().messages({
    'any.required': 'Payment ID is required',
    'string.uuid': 'Invalid Payment ID format'
  })
});

const getBusinessListUnderMembersSchema = Joi.object({
  business_agent_id: Joi.number().integer().required(),
  min: Joi.number().integer().min(0).optional(),
  max: Joi.number().integer().min(1).optional()
});

const getCollectionAgentDashboardSchema = Joi.object({
  collection_agent_id: Joi.number().integer().required()
});

const getCollectionAgentGroupDashboardSchema = Joi.object({
  group_id: Joi.string().uuid().required()
});

const getPendingMembersSchema = Joi.object({
  collection_agent_id: Joi.number().integer().required(),
  min: Joi.number().integer().min(0).optional(),
  max: Joi.number().integer().min(1).optional()
});

const getCollectionAgentActiveGroupsSchema = Joi.object({
  collection_agent_id: Joi.number().integer().required(),
  min: Joi.number().integer().min(0).optional(),
  max: Joi.number().integer().min(1).optional()
});

const getMemberDuesSchema = Joi.object({
  member_id: Joi.number().integer().required()
});

const getSubmissionsSchema = Joi.object({
  collection_agent_id: Joi.number().integer().required(),
  type: Joi.number().integer().valid(1, 2, 3, 4).required(),
  min: Joi.number().integer().min(0).optional(),
  max: Joi.number().integer().min(1).optional()
});

const submitCollectionPaymentSchema = Joi.object({
  collection_agent_id: Joi.number().integer().required(),
  member_id: Joi.number().integer().required(),
  payment_type: Joi.number().integer().valid(1, 2, 3, 4, 5).required(),
  amount: Joi.number().precision(2).required(),
  cash: Joi.object().optional(),
  transaction_id: Joi.string().optional(),
  cheque_number: Joi.string().optional(),
  bank_details: Joi.object().optional(),
  other_details: Joi.string().optional()
});

const getAllGallerySchema = Joi.object({
  company_id: Joi.string().uuid().optional(),
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
  getPaymentHistorySchema,
  getPaymentReceiptSchema,
  getBusinessListUnderMembersSchema,
  getCollectionAgentDashboardSchema,
  getCollectionAgentGroupDashboardSchema,
  getCollectionAgentActiveGroupsSchema,
  getPendingMembersSchema,
  getMemberDuesSchema,
  getSubmissionsSchema,
  submitCollectionPaymentSchema,
  getAllGallerySchema
};
