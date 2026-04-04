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

module.exports = {  
  getHomeRecordSchema,
  getAllHomeRecordsSchema
};
