const borrowRepayService = require('../services/borrowRepayService');
const { resolveCompanyIdForAuth } = require('../services/adminService');

exports.getAll = async (req, res) => {
  try {
    const params = {
      ...req.body,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await borrowRepayService.getAll(params);
    res.json({ status: true, message: 'Borrow/Repay entries fetched successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await borrowRepayService.getById(req.body.id, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Entry fetched successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.storeOrUpdate = async (req, res) => {
  try {
    const data = await borrowRepayService.storeOrUpdate(req.body, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Entry saved successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    await borrowRepayService.deleteEntry(req.body.id, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Entry deleted successfully', data: null });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};
