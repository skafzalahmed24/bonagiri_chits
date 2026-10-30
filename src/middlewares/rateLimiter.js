// Rate limiting disabled
const authRateLimiter = (req, res, next) => {
  next();
};

module.exports = {
  authRateLimiter
};
