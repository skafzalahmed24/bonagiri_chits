const accountingVoucherService = require('../services/accountingVoucherService');

const getAll = async (req, res) => {
  try {
    const data = await accountingVoucherService.getAllVouchers(req.body, req.user);
    res.json({
      status: true,
      message: 'Vouchers fetched successfully',
      data
    });
  } catch (error) {
    res.json({
      status: false,
      message: error.message || 'Failed to fetch vouchers'
    });
  }
};

const getById = async (req, res) => {
  try {
    const data = await accountingVoucherService.getVoucherById(req.body.id, req.user);
    res.json({
      status: true,
      message: 'Voucher fetched successfully',
      data
    });
  } catch (error) {
    res.json({
      status: false,
      message: error.message || 'Failed to fetch voucher'
    });
  }
};

const storeOrUpdate = async (req, res) => {
  try {
    const data = await accountingVoucherService.storeOrUpdateVoucher(req.body, req.user);
    res.json({
      status: true,
      message: 'Voucher saved successfully',
      data
    });
  } catch (error) {
    res.json({
      status: false,
      message: error.message || 'Failed to save voucher',
      code: error.code
    });
  }
};

// Vouchers are cancelled, never erased; /delete is kept for older screens and cancels too.
const deleteVoucher = async (req, res) => {
  try {
    const { id, reason, override_reason } = req.body;
    await accountingVoucherService.cancelVoucher({ id, user: req.user, reason, override_reason });
    res.json({
      status: true,
      message: 'Voucher cancelled',
      data: null
    });
  } catch (error) {
    res.json({
      status: false,
      message: error.message || 'Failed to cancel voucher',
      code: error.code
    });
  }
};

const getAccountBalance = async (req, res) => {
  try {
    const data = await accountingVoucherService.getAccountBalance(req.body, req.user);
    res.json({
      status: true,
      message: 'Balance fetched successfully',
      data
    });
  } catch (error) {
    res.json({
      status: false,
      message: error.message || 'Failed to fetch balance'
    });
  }
};

module.exports = {
  getAll,
  getById,
  storeOrUpdate,
  deleteVoucher,
  getAccountBalance
};
