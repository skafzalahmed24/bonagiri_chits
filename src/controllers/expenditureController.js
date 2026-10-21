const expenditureService = require('../services/expenditureService');
const { resolveCompanyIdForAuth } = require('../services/adminService');

// `code` lets the screen react, e.g. ask the admin for an override reason (LOCK_OVERRIDE_REQUIRED).
const fail = (res, error) => res.json({ status: false, message: error.message, code: error.code });

exports.getAll = async (req, res) => {
  try {
    const data = await expenditureService.getAll({ ...req.body, company_id: await resolveCompanyIdForAuth(req.user) });
    res.json({ status: true, message: 'Expenditures fetched successfully', data });
  } catch (error) {
    fail(res, error);
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await expenditureService.getById(req.body.id, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Expenditure fetched successfully', data });
  } catch (error) {
    fail(res, error);
  }
};

exports.storeOrUpdate = async (req, res) => {
  try {
    const data = await expenditureService.storeOrUpdate(req.body, await resolveCompanyIdForAuth(req.user), req.user);
    res.json({ status: true, message: 'Expenditure saved successfully', data });
  } catch (error) {
    fail(res, error);
  }
};

// Money entries are cancelled, never erased; /delete is kept for older screens and cancels too.
exports.deleteExpenditure = async (req, res) => {
  try {
    const { id, reason, override_reason } = req.body;
    await expenditureService.cancel({ id, company_id: await resolveCompanyIdForAuth(req.user), user: req.user, reason, override_reason });
    res.json({ status: true, message: 'Expenditure cancelled', data: null });
  } catch (error) {
    fail(res, error);
  }
};
