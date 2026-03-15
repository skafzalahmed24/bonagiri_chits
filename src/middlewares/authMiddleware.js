const { errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');
const { verifyAccessToken } = require('../utils/jwtHelper');

const DEFAULT_API_TOKEN = process.env.DEFAULT_API_TOKEN || 'secure-default-rest-api-token';

const authenticateDefaultToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  let token = authHeader;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token || token !== DEFAULT_API_TOKEN) {
    return errorResponse(res, statusCodes.UNAUTHORIZED, 'Invalid or missing default token');
  }

  next();
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  let token = authHeader;
  // The token generally comes in format: "Bearer <token>"
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return errorResponse(res, statusCodes.UNAUTHORIZED, 'Access token is missing or invalid');
  }

  try {
    const decoded = verifyAccessToken(token);
    // Attach the decoded token payload to the request object so downstream controllers can use it
    req.user = decoded;
    next();
  } catch (error) {
    return errorResponse(res, statusCodes.FORBIDDEN, 'Invalid or expired access token');
  }
};

module.exports = {
  authenticateDefaultToken,
  authenticateToken
};
