const { errorResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');
const { verifyAccessToken } = require('../utils/jwtHelper');

if (!process.env.DEFAULT_API_TOKEN) {
  console.error("FATAL ERROR: DEFAULT_API_TOKEN is not defined in the environment.");
  process.exit(1);
}

const DEFAULT_API_TOKEN = process.env.DEFAULT_API_TOKEN;

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

const authenticateToken = async (req, res, next) => {
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
    const { RevokedToken, Company, StaffUser, Member } = require('../models');
    const isRevoked = await RevokedToken.findOne({ where: { token } });
    if (isRevoked) {
      return errorResponse(res, statusCodes.UNAUTHORIZED, 'Token has been revoked or logged out');
    }

    const decoded = verifyAccessToken(token);
    // Attach the decoded token payload to the request object so downstream controllers can use it
    req.user = decoded;
    next();
  } catch (error) {
    return errorResponse(res, statusCodes.UNAUTHORIZED, 'Invalid or expired access token');
  }
};

const authenticateSuperAdminToken = (req, res, next) => {
  authenticateToken(req, res, (err) => {
    if (err) return next(err);
    if (!req.user || req.user.role !== 'superadmin') {
      return errorResponse(res, statusCodes.FORBIDDEN, 'Access restricted to Super Admin');
    }
    next();
  });
};

const requirePermission = (moduleId) => (req, res, next) => {
  if (!req.user) return errorResponse(res, statusCodes.FORBIDDEN, 'Insufficient permissions');
  if (req.user.role === 'company') return next();
  if (req.user.role === 'staff' && req.user.permissions?.[moduleId]?.view) return next();
  return errorResponse(res, statusCodes.FORBIDDEN, `You don't have permission to access this module`);
};

const requirePermissionOrUserRole = (moduleId, extraRole) => (req, res, next) => {
  if (!req.user) return errorResponse(res, statusCodes.FORBIDDEN, 'Insufficient permissions');
  if (req.user.role === extraRole) return next();
  if (req.user.role === 'company') return next();
  if (req.user.role === 'staff' && req.user.permissions?.[moduleId]?.view) return next();
  return errorResponse(res, statusCodes.FORBIDDEN, `You don't have permission to access this module`);
};

const requireRole = (allowedRoles) => (req, res, next) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!req.user?.role || !roles.includes(req.user.role)) {
    return errorResponse(res, statusCodes.FORBIDDEN, `This action requires one of: ${roles.join(', ')}`);
  }
  next();
};

module.exports = {
  authenticateDefaultToken,
  authenticateToken,
  authenticateSuperAdminToken,
  requirePermission,
  requirePermissionOrUserRole,
  requireRole
};
