const { Op } = require('sequelize');
const { ChitsInstallment, sequelize } = require('../models');

function getSchemeWinningAmount(schemeConfig, auctionNumber) {
  if (!schemeConfig) return null;
  const prices = typeof schemeConfig.prices === 'string' ? JSON.parse(schemeConfig.prices) : schemeConfig.prices;

  if (schemeConfig.scheme_type === 63) {
    const commission = parseFloat(schemeConfig.chit_value) * (parseFloat(schemeConfig.company_percentage) / 100);
    const companyMonths = parseInt(schemeConfig.company_chit) || 1;
    if (auctionNumber <= companyMonths) return null;
    const addingAmount = parseFloat(schemeConfig.chit_value) * (parseFloat(schemeConfig.adding_percentage) / 100);
    const winnersSoFar = auctionNumber - companyMonths - 1;
    return parseFloat(schemeConfig.chit_value) - commission + (winnersSoFar * addingAmount);
  }

  const row = prices?.[auctionNumber - 1];
  return parseFloat(row?.chit_amount) || 0;
}

function getSchemeOriginalAmount(schemeConfig, auction) {
  if (!schemeConfig) {
    return parseFloat(auction.subscription_amount) || 0.00;
  }

  const prices = typeof schemeConfig.prices === 'string' ? JSON.parse(schemeConfig.prices) : schemeConfig.prices;

  if (schemeConfig.scheme_type === 63) {
    return parseFloat(schemeConfig.installment) || 0.00;
  }
  if (schemeConfig.scheme_type === 62) {
    const row = prices?.[auction.auction_number - 1];
    return parseFloat(row?.not_withdrawn) || 0.00;
  }
  const row = prices?.[auction.auction_number - 1];
  return parseFloat(row?.installment) || 0.00;
}

async function applyWinnerSchemeAdjustments(auctionData, schemeConfig, winnerEnrollmentId, transaction = null) {
  if (!schemeConfig || !winnerEnrollmentId) return;

  const winMonth = auctionData.auction_number;
  const PAID_INSTALLMENT_SUBQUERY = '(SELECT chits_installment_id FROM customer_payments WHERE payment_status = 1 AND chits_installment_id IS NOT NULL)';
  
  const remainingWhere = {
    enrollment_id: winnerEnrollmentId,
    installment_no: { [Op.gt]: winMonth },
    id: { [Op.notIn]: sequelize.literal(PAID_INSTALLMENT_SUBQUERY) }
  };

  const options = transaction ? { transaction } : {};

  if (schemeConfig.scheme_type === 62 /* WITHDRAWN */) {
    const futureInstallments = await ChitsInstallment.findAll({ where: remainingWhere, ...options });
    const pricesArray = schemeConfig.prices
      ? (typeof schemeConfig.prices === 'string' ? JSON.parse(schemeConfig.prices) : schemeConfig.prices)
      : [];

    for (const inst of futureInstallments) {
      const row = pricesArray[inst.installment_no - 1];
      if (row?.withdrawn != null) {
        await inst.update({ payable_amount: parseFloat(row.withdrawn) }, options);
      }
    }
  }

  if (schemeConfig.scheme_type === 63 /* FIXED_ADDING */) {
    const addingAmount = parseFloat(schemeConfig.chit_value) * (parseFloat(schemeConfig.adding_percentage) / 100);
    await ChitsInstallment.increment(
      { payable_amount: addingAmount },
      { where: remainingWhere, ...options }
    );
  }
}

module.exports = {
  getSchemeWinningAmount,
  getSchemeOriginalAmount,
  applyWinnerSchemeAdjustments
};
