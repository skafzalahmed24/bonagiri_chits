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
    return errorResponse(res, statusCodes.NOT_FOUND, 'Invalid or missing default token');
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
    return errorResponse(res, statusCodes.NOT_FOUND, 'Access token is missing or invalid');
  }

  try {
    const decoded = verifyAccessToken(token);
    console.log("=== Decoded User Token Payload ===", decoded);
    // Attach the decoded token payload to the request object so downstream controllers can use it
    req.user = decoded;
    next();
  } catch (error) {
    return errorResponse(res, statusCodes.UNAUTHORIZED, 'Invalid or expired access token');
  }
};

const requirePermission = (moduleId) => (req, res, next) => {
  if (!req.user) return errorResponse(res, statusCodes.FORBIDDEN, 'Insufficient permissions');
  if (req.user.role === 'company') return next();
  if (req.user.role === 'staff' && req.user.permissions?.[moduleId]?.view) return next();
  return errorResponse(res, statusCodes.FORBIDDEN, `You don't have permission to access this module`);
};

module.exports = {
  authenticateDefaultToken,
  authenticateToken,
  requirePermission
};
