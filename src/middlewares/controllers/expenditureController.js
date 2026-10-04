const expenditureService = require('../services/expenditureService');
const { resolveCompanyIdForAuth } = require('../services/adminService');

exports.getAll = async (req, res) => {
  try {
    const params = {
      ...req.body,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await expenditureService.getAll(params);
    res.json({ status: true, message: 'Expenditures fetched successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await expenditureService.getById(req.body.id, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Expenditure fetched successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.storeOrUpdate = async (req, res) => {
  try {
    const data = await expenditureService.storeOrUpdate(req.body, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Expenditure saved successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.deleteExpenditure = async (req, res) => {
  try {
    await expenditureService.deleteExpenditure(req.body.id, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Expenditure deleted successfully', data: null });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};
