const selfTransferService = require('../services/selfTransferService');
const { resolveCompanyIdForAuth } = require('../services/adminService');

// `code` lets the screen react, e.g. ask the admin for an override reason (LOCK_OVERRIDE_REQUIRED).
const fail = (res, error) => res.json({ status: false, message: error.message, code: error.code });

exports.getAll = async (req, res) => {
  try {
    const data = await selfTransferService.getAll({ ...req.body, company_id: await resolveCompanyIdForAuth(req.user) });
    res.json({ status: true, message: 'Self transfers fetched successfully', data });
  } catch (error) {
    fail(res, error);
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await selfTransferService.getById(req.body.id, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Self transfer fetched successfully', data });
  } catch (error) {
    fail(res, error);
  }
};

exports.storeOrUpdate = async (req, res) => {
  try {
    const data = await selfTransferService.storeOrUpdate(req.body, await resolveCompanyIdForAuth(req.user), req.user);
    res.json({ status: true, message: 'Self transfer saved successfully', data });
  } catch (error) {
    fail(res, error);
  }
};

// Money entries are cancelled, never erased; /delete is kept for older screens and cancels too.
exports.deleteTransfer = async (req, res) => {
  try {
    const { id, reason, override_reason } = req.body;
    await selfTransferService.cancel({ id, company_id: await resolveCompanyIdForAuth(req.user), user: req.user, reason, override_reason });
    res.json({ status: true, message: 'Self transfer cancelled', data: null });
  } catch (error) {
    fail(res, error);
  }
};
