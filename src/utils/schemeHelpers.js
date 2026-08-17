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
    const pricesArray = schemeConfig.prices
      ? (typeof schemeConfig.prices === 'string' ? JSON.parse(schemeConfig.prices) : schemeConfig.prices)
      : [];

    const winMonthRow = pricesArray[winMonth - 1];
    if (winMonthRow?.withdrawn != null) {
      await ChitsInstallment.update(
        { payable_amount: parseFloat(winMonthRow.withdrawn) },
        { where: { enrollment_id: winnerEnrollmentId, installment_no: winMonth }, ...options }
      );
    }

    const futureInstallments = await ChitsInstallment.findAll({ where: remainingWhere, ...options });

    for (const inst of futureInstallments) {
      const row = pricesArray[inst.installment_no - 1];
      if (row?.withdrawn != null) {
        await inst.update({ payable_amount: parseFloat(row.withdrawn) }, options);
      }
    }
  }

  if (schemeConfig.scheme_type === 63 /* FIXED_ADDING */) {
    await ChitsInstallment.update(
      { payable_amount: 0 },
      { where: { enrollment_id: winnerEnrollmentId, installment_no: winMonth }, ...options }
    );
    const addingAmount = parseFloat(schemeConfig.chit_value) * (parseFloat(schemeConfig.adding_percentage) / 100);
    await ChitsInstallment.increment(
      { payable_amount: addingAmount },
      { where: remainingWhere, ...options }
    );
  }

  if (schemeConfig.scheme_type === 64 || schemeConfig.scheme_type === 65) {
    await ChitsInstallment.update(
      { payable_amount: 0 },
      { where: { enrollment_id: winnerEnrollmentId, installment_no: winMonth }, ...options }
    );
  }
}

async function applyOpenAuctionAdjustments(auctionData, winnerEnrollmentId, groupId, transaction = null) {
  const { Enrollment } = require('../models');
  const options = transaction ? { transaction } : {};
  
  const allEnrollments = await Enrollment.findAll({ 
    where: { group_id: groupId, delete_status: 0 }, 
    ...options 
  });
  
  // Act standard: divide dividend among ALL N members (including winner)
  const divisor = allEnrollments.length > 0 ? allEnrollments.length : 1;
  const dividendPerMember = auctionData.dividend / divisor;
  const subscription = auctionData.subscription_amount;

  // Apply dividend to ALL members (including winner)
  for (const enrollment of allEnrollments) {
    // Track cumulative dividends for accounting/reporting
    const currentBalance = parseFloat(enrollment.dividend_credit_balance) || 0;
    const newBalance = currentBalance + dividendPerMember;
    await enrollment.update({ dividend_credit_balance: newBalance }, options);

    // Use THIS MONTH's dividend only — not the cumulative balance
    // (dividend_credit_balance is for accounting; installment uses single-month dividend)
    const newPayable = subscription - dividendPerMember;
    await ChitsInstallment.update(
      { payable_amount: Math.max(0, newPayable) },
      { where: { enrollment_id: enrollment.id, installment_no: auctionData.auction_number }, ...options }
    );
  }

  // Winner's future installments stay at base subscription (unchanged)
  await ChitsInstallment.update(
    { payable_amount: subscription },
    { where: { group_id: groupId, enrollment_id: winnerEnrollmentId, installment_no: { [Op.gt]: auctionData.auction_number } }, ...options }
  );
}

function calculateOpenAuctionFinancials({ chitAmount, installments, bidAmount, commissionPct, memberCount }) {
  const subscription = chitAmount / installments;
  const commission = chitAmount * (commissionPct / 100);
  const gstPct = 18; // Fixed GST rate
  const gst = commission * (gstPct / 100);
  const bidDiscount = chitAmount - bidAmount;
  const totalDividend = Math.max(0, bidDiscount - commission - gst);
  const divisor = memberCount > 0 ? memberCount : 1; // all N members (Act standard)
  const dividendPerMember = totalDividend / divisor;
  const netPayable = subscription - dividendPerMember;
  const winnerReceives = bidAmount; // full bid amount — commission deducted from pool only, not from winner
  
  return { subscription, commission, gst, bidDiscount, totalDividend, dividendPerMember, netPayable, winnerReceives };
}

module.exports = {
  getSchemeWinningAmount,
  getSchemeOriginalAmount,
  applyWinnerSchemeAdjustments,
  applyOpenAuctionAdjustments,
  calculateOpenAuctionFinancials
};
