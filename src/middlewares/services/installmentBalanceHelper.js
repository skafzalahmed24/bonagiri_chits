const { CustomerPayment } = require('../models');

const getInstallmentBalance = async (installmentId) => {
  const paidRows = await CustomerPayment.findAll({
    where: { chits_installment_id: installmentId, payment_status: 1 },
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

module.exports = {
  getInstallmentBalance,
  getInstallmentsBalancesBatch
};
