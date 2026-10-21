const chargeService = require('../services/chargeService');
const advanceService = require('../services/advanceService');
const receiptService = require('../services/receiptService');
const adminService = require('../services/adminService');
const { successResponse } = require('../utils/responseHelper');
const statusCodes = require('../utils/statusCodes');

/**
 * Charges, penalty waivers, cheque returns and counter advances (docs/MONEY_FLOW_BATCH2_3.md §3).
 * Admin-only actions are enforced in the services. `code` lets a screen react to a rule
 * (e.g. LOCK_OVERRIDE_REQUIRED asks the admin for an override reason).
 */
const handle = (fn, message) => async (req, res) => {
  try {
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
    const data = await fn({ ...(req.body || {}), companyId, user: req.user });
    return successResponse(res, statusCodes.OK, message, data);
  } catch (error) {
    return res.status(statusCodes.BAD_REQUEST).json({ status: 0, message: error.message, code: error.code });
  }
};

exports.listCharges = handle(({ companyId, enrollment_id, only_due }) => chargeService.listForEnrollment({ companyId, enrollment_id, onlyDue: !!only_due }), 'Charges retrieved');
exports.addCharge = handle((p) => chargeService.addOtherCharge({ companyId: p.companyId, enrollment_id: p.enrollment_id, amount: p.amount, reason: p.reason, user: p.user }), 'Charge added');
exports.waiveCharge = handle((p) => chargeService.waiveCharge({ companyId: p.companyId, id: p.id, amount: p.amount, reason: p.reason, user: p.user }), 'Charge waived');
exports.postNoticeCharges = handle((p) => chargeService.postNoticeCharges({ companyId: p.companyId, enrollment_ids: p.enrollment_ids, amount: p.amount, notice_type: p.notice_type, notice_date: p.notice_date, user: p.user }), 'Notice charges posted');
exports.waivePenalty = handle((p) => chargeService.waivePenalty({ companyId: p.companyId, chits_installment_id: p.chits_installment_id, amount: p.amount, reason: p.reason, user: p.user }), 'Penalty waived');
exports.chequeReturned = handle((p) => receiptService.chequeReturned({ companyId: p.companyId, customer_payment_id: p.customer_payment_id, reason: p.reason, override_reason: p.override_reason, user: p.user }), 'Receipt cancelled and cheque-return charge added');
exports.takeAdvance = handle((p) => advanceService.takeAdvance({ companyId: p.companyId, member_id: p.member_id, amount: p.amount, account_id: p.account_id, date: p.date, narration: p.narration, override_reason: p.override_reason, user: p.user }), 'Advance received');
exports.refundAdvance = handle((p) => advanceService.refundAdvance({ companyId: p.companyId, member_advance_id: p.member_advance_id, amount: p.amount, account_id: p.account_id, date: p.date, reason: p.reason, override_reason: p.override_reason, user: p.user }), 'Advance refunded');
