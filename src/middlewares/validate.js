const { errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

const validate = (schema) => (req, res, next) => {
  const payload = req.method === 'GET' ? req.query : req.body;
  const { error, value } = schema.validate(payload || {}, { abortEarly: false });
  
  if (req.method === 'GET') {
    req.query = value; // update with casted values (like numbers)
  } else {
    req.body = value;
  }

  if (error) {
    const errorMessage = error.details.map(detail => detail.message.replace(/\"/g, '')).join(', ');
    return errorResponse(res, statusCodes.BAD_REQUEST, errorMessage);
  }
  next();
};

module.exports = validate;
