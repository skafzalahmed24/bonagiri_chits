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

    if (decoded.role === 'company') {
      const user = await Company.findByPk(decoded.id, {
        attributes: ['id', 'device_unique_id', 'is_deleted_status', 'status']
      });
      if (!user || user.is_deleted_status !== 0 || user.status === 0) {
        return errorResponse(res, statusCodes.UNAUTHORIZED, 'User account is inactive or not found');
      }
      if (!user.device_unique_id || user.device_unique_id !== decoded.device_unique_id) {
        return errorResponse(res, statusCodes.UNAUTHORIZED, 'Another device has been logged in');
      }
    } else if (decoded.role === 'staff') {
      const user = await StaffUser.findByPk(decoded.id, {
        attributes: ['id', 'device_unique_id', 'is_deleted_status', 'is_active']
      });
      if (!user || user.is_deleted_status !== 0 || !user.is_active) {
        return errorResponse(res, statusCodes.UNAUTHORIZED, 'User account is inactive or not found');
      }
      if (!user.device_unique_id || user.device_unique_id !== decoded.device_unique_id) {
        return errorResponse(res, statusCodes.UNAUTHORIZED, 'Another device has been logged in');
      }
    } else if (decoded.role === 'member') {
      const user = await Member.findByPk(decoded.id, {
        attributes: ['id', 'device_unique_id', 'is_deleted_status', 'is_verified']
      });
      if (!user || user.is_deleted_status !== 0 || !user.is_verified) {
        return errorResponse(res, statusCodes.UNAUTHORIZED, 'User account is inactive or not found');
      }
      if (!user.device_unique_id || user.device_unique_id !== decoded.device_unique_id) {
        return errorResponse(res, statusCodes.UNAUTHORIZED, 'Another device has been logged in');
      }
    }

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
  requirePermission,
  requirePermissionOrUserRole,
  requireRole
};
