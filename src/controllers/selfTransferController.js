const selfTransferService = require('../services/selfTransferService');
const { resolveCompanyIdForAuth } = require('../services/adminService');

exports.getAll = async (req, res) => {
  try {
    const params = {
      ...req.body,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await selfTransferService.getAll(params);
    res.json({ status: true, message: 'Self transfers fetched successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await selfTransferService.getById(req.body.id, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Self transfer fetched successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.storeOrUpdate = async (req, res) => {
  try {
    const data = await selfTransferService.storeOrUpdate(req.body, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Self transfer saved successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.deleteTransfer = async (req, res) => {
  try {
    await selfTransferService.deleteTransfer(req.body.id, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Self transfer deleted successfully', data: null });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};
