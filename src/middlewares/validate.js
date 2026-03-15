const { errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body || {}, { abortEarly: false });
  if (error) {
    const errorMessage = error.details[0].message.replace(/\"/g, ''); // Optionally remove Joi's quotes from the property name
    return errorResponse(res, statusCodes.BAD_REQUEST, errorMessage);
  }
  next();
};

module.exports = validate;
