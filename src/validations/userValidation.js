const Joi = require('joi');

const getHomeRecordSchema = Joi.object({
  subscriber_id: Joi.number().required()
});

module.exports = {
  getHomeRecordSchema
};
