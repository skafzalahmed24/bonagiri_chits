const { AuditLog } = require('../models');

const auditLogger = async (req, res, next) => {
  // Wait for the request to finish to know if it succeeded
  res.on('finish', async () => {
    // Only log if the request was successful to avoid logging validation errors (or you can remove this check to log everything)
    if (res.statusCode >= 200 && res.statusCode < 400) {
      let actionType = 'READ';
      
      // Separate CREATE vs UPDATE by checking if the payload has an ID
      if (req.method === 'POST') {
        if (req.body && req.body.id) {
          actionType = 'UPDATE';
        } else {
          actionType = 'CREATE';
        }
      }
      
      if (req.originalUrl.includes('delete')) actionType = 'DELETE';
      if (req.originalUrl.includes('login')) actionType = 'LOGIN';
      if (req.originalUrl.includes('logout')) actionType = 'LOGOUT';
      if (req.originalUrl.includes('get-all') || req.originalUrl.includes('get-by-id')) actionType = 'READ';

      // Currently ignoring READ actions to prevent database bloat
      if (actionType === 'READ') return;

      // Scrub sensitive data
      const safeBody = { ...req.body };
      delete safeBody.password;
      delete safeBody.company_password;
      delete safeBody.old_password;
      delete safeBody.new_password;

      // Extract user info if available (depends on authMiddleware running before this)
      const userId = req.user ? req.user.id : null;
      const userType = req.user ? req.user.role : 'Guest';
      const companyId = req.user ? req.user.company_id : (req.body && req.body.company_id ? req.body.company_id : null);
      
      try {
        await AuditLog.create({
          user_id: userId ? String(userId) : null,
          user_type: userType,
          company_id: companyId ? String(companyId) : null,
          action_type: actionType,
          module_or_route: req.originalUrl,
          request_payload: safeBody,
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        });
      } catch (error) {
        console.error('Failed to write audit log:', error);
      }
    }
  });
  next();
};

module.exports = auditLogger;
