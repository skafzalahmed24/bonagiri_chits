const svc = require('../services/suretyDenominationService');
const { resolveCompanyIdForAuth } = require('../services/adminService');

// Who counted the cash: the admin token carries no person, a staff token does.
const countedBy = (user) => {
  if (!user) return null;
  if (user.role === 'company') return 'Company admin';
  return user.name || (user.user_code ? `Staff ${user.user_code}` : 'Staff');
};

const handle = (fn, message) => async (req, res) => {
  try {
    const company_id = await resolveCompanyIdForAuth(req.user);
    if (!company_id) return res.status(400).json({ status: 0, message: 'No company on this session' });
    const data = await fn(req, company_id);
    return res.json({ status: 1, message, data });
  } catch (error) {
    return res.status(400).json({ status: 0, message: error.message });
  }
};

exports.listSureties = handle(
  (req, company_id) => svc.listSureties({ company_id, enrollment_id: req.body.enrollment_id, group_id: req.body.group_id }),
  'Sureties retrieved successfully'
);
exports.saveSurety = handle((req, company_id) => svc.saveSurety({ company_id, data: req.body }), 'Surety saved successfully');
exports.deleteSurety = handle((req, company_id) => svc.deleteSurety({ company_id, id: req.body.id }), 'Surety removed');

exports.getDenomination = handle(
  (req, company_id) => svc.getDenomination({ company_id, count_date: req.body.count_date }),
  'Cash count retrieved successfully'
);
exports.saveDenomination = handle(
  (req, company_id) => svc.saveDenomination({ company_id, data: req.body, counted_by: countedBy(req.user) }),
  'Cash count saved'
);
