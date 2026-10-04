const successResponse = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({
    status: 1,
    message,
    data,
  });
};

const errorResponse = (res, statusCode, message, errors = null) => {
  const response = {
    status: 0,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

module.exports = {
  successResponse,
  errorResponse,
};
