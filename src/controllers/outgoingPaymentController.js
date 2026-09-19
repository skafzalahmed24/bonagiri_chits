const outgoingPaymentService = require('../services/outgoingPaymentService');
const { resolveCompanyIdForAuth } = require('../services/adminService');

exports.getAll = async (req, res) => {
  try {
    const params = {
      ...req.body,
      company_id: await resolveCompanyIdForAuth(req.user),
    };
    const data = await outgoingPaymentService.getAll(params);
    res.json({ status: true, message: 'Payments fetched successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await outgoingPaymentService.getById(req.body.id, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Payment fetched successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.storeOrUpdate = async (req, res) => {
  try {
    const data = await outgoingPaymentService.storeOrUpdate(req.body, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Payment saved successfully', data });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};

exports.deletePayment = async (req, res) => {
  try {
    await outgoingPaymentService.deletePayment(req.body.id, await resolveCompanyIdForAuth(req.user));
    res.json({ status: true, message: 'Payment deleted successfully', data: null });
  } catch (error) {
    res.json({ status: false, message: error.message });
  }
};
