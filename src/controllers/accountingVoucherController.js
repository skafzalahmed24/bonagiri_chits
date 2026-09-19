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
      message: error.message || 'Failed to save voucher'
    });
  }
};

const deleteVoucher = async (req, res) => {
  try {
    await accountingVoucherService.deleteVoucher(req.body.id, req.user);
    res.json({
      status: true,
      message: 'Voucher deleted successfully',
      data: null
    });
  } catch (error) {
    res.json({
      status: false,
      message: error.message || 'Failed to delete voucher'
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
