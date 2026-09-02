const rateLimit = require('express-rate-limit');
const statusCodes = require('../utils/statusCodes');
const { errorResponse } = require('../utils/responseHelper');

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per `window` (here, per 15 minutes)
  handler: (req, res) => {
    return errorResponse(res, statusCodes.TOO_MANY_REQUESTS || 429, 'Too many authentication attempts from this IP, please try again after 15 minutes');
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

module.exports = {
  authRateLimiter
};
