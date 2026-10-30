const { CustomerPayment } = require('../models');

const getInstallmentBalance = async (installmentId, transaction = null) => {
  const paidRows = await CustomerPayment.findAll({
    where: { chits_installment_id: installmentId, payment_status: 1 },
    transaction
  });
  const paidSoFar = paidRows.reduce((sum, p) => sum + parseFloat(p.received_amount || 0), 0);
  return paidSoFar;
};

const getInstallmentsBalancesBatch = async (installmentIds) => {
  const paidRows = await CustomerPayment.findAll({
    where: { chits_installment_id: installmentIds, payment_status: 1 },
  });
  
  const balances = {};
  installmentIds.forEach(id => balances[id] = 0);
  
  paidRows.forEach(p => {
    balances[p.chits_installment_id] += parseFloat(p.received_amount || 0);
  });
  
  return balances;
};

// Penalty still owed on an instalment: what it carries, less the penalty already paid on its
// verified receipts (payment_status 1). A waiver already lowers penalty_amount itself
// (chargeService.waivePenalty), so it is not subtracted again. Same rule as chargeService.waivePenalty.
const penaltyOwed = (penaltyAmount, penaltyPaidSum) => {
  const owed = Math.round(((parseFloat(penaltyAmount) || 0) - (parseFloat(penaltyPaidSum) || 0)) * 100) / 100;
  return Math.max(0, owed);
};

module.exports = {
  getInstallmentBalance,
  getInstallmentsBalancesBatch,
  penaltyOwed
};
