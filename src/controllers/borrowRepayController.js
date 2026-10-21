const borrowRepayService = require('../services/borrowRepayService');
const { resolveCompanyIdForAuth } = require('../services/adminService');

// `code` lets the screen react, e.g. ask the admin for an override reason (LOCK_OVERRIDE_REQUIRED).
const fail = (res, error) => res.json({ status: false, message: error.message, code: error.code });

exports.getAll = async (req, res) => {
  try {
    const data = await borrowRepayService.getAll({ ...req.body, company_id: await resolveCompanyIdForAuth(req.user) });
    res.json({ status: true, message: 'Borrow/Repay entries fetched successfully', data });
  } catch (error) {
    fail(res, error);
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await borrowRepayService.getById(req.body.id, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Entry fetched successfully', data });
  } catch (error) {
    fail(res, error);
  }
};

exports.storeOrUpdate = async (req, res) => {
  try {
    const data = await borrowRepayService.storeOrUpdate(req.body, await resolveCompanyIdForAuth(req.user), req.user);
    res.json({ status: true, message: 'Entry saved successfully', data });
  } catch (error) {
    fail(res, error);
  }
};

// Money entries are cancelled, never erased; /delete is kept for older screens and cancels too.
exports.deleteEntry = async (req, res) => {
  try {
    const { id, reason, override_reason } = req.body;
    await borrowRepayService.cancel({ id, company_id: await resolveCompanyIdForAuth(req.user), user: req.user, reason, override_reason });
    res.json({ status: true, message: 'Entry cancelled', data: null });
  } catch (error) {
    fail(res, error);
  }
};
