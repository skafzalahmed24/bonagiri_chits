'use strict';

const { Op } = require('sequelize');
const {
  Member,
  Enrollment,
  ChitsGroup,
  ChitsInstallment,
  CustomerPayment,
  Auction,
  MemberDocument,
  SuitFileInformation,
  MemberReferral
} = require('../models');

/**
 * Calculates a member's 360-degree financial health score and star rating.
 * 
 * Rating Tiers:
 * - Gold: 4.5 to 5.0 (Prompt payers, high completion, KYC verified)
 * - Silver: 3.0 to below 4.5 (Moderate risk, occasional delays, standard surety)
 * - Red Star: Below 3.0 (High default risk, overdue payments, active legal suits)
 * 
 * @param {number|string} memberId Member ID
 * @param {Object|null} preloadedMember Optional preloaded Member model instance
 * @returns {Promise<Object>} Rating details { star_rating, rating_tier, rating_category, rating_color, ... }
 */
const calculateMemberRating = async (memberId, preloadedMember = null) => {
  try {
    const member = preloadedMember || await Member.findByPk(memberId, {
      attributes: ['id', 'name', 'member_id', 'other_info_user_code', 'is_verified', 'account_number', 'ifsc_code', 'createdAt']
    });

    if (!member) {
      return {
        score: 70,
        star_rating: 3.5,
        rating_tier: 'Silver',
        rating_category: 'silver',
        rating_color: '#C0C0C0',
        rating_label: 'Silver Star (3.0 - 4.5)',
        trust_tier: 'Silver / Moderate',
        risk_level: 'Medium',
        badges: []
      };
    }

    const mId = member.id;

    // 1. Fetch active/completed Enrollments
    const enrollments = await Enrollment.findAll({
      where: { subscriber_id: mId, delete_status: 0 },
      include: [
        {
          model: ChitsGroup,
          as: 'group',
          where: { is_deleted_status: 0 },
          required: true
        }
      ]
    });

    const enrollmentIds = enrollments.map(e => e.id);

    // 2. Fetch Installments & Payments
    let installments = [];
    if (enrollmentIds.length > 0) {
      installments = await ChitsInstallment.findAll({
        where: { enrollment_id: { [Op.in]: enrollmentIds } },
        include: [
          {
            model: CustomerPayment,
            as: 'payments'
          }
        ]
      });
    }

    // Flatten payments
    const allPayments = [];
    let totalDemandedAmount = 0;
    let totalPaidAmount = 0;
    let totalPenaltyPaid = 0;
    let onTimePaymentsCount = 0;
    let delayedPaymentsCount = 0;
    let completedChitsCount = 0;
    let activeChitsCount = 0;

    enrollments.forEach(enr => {
      const grp = enr.group;
      const grpStatus = Number(grp.chits_group_status);
      if (grpStatus === 2) completedChitsCount++;
      else activeChitsCount++;

      const grpInstallments = installments.filter(inst => inst.enrollment_id === enr.id);
      let grpDemand = 0;
      let grpPaid = 0;

      grpInstallments.forEach(inst => {
        grpDemand += parseFloat(inst.payable_amount) || 0;
        if (inst.payments && inst.payments.length > 0) {
          inst.payments.forEach(p => {
            const rcv = parseFloat(p.received_amount) || 0;
            const pen = parseFloat(p.penalty_paid) || 0;
            grpPaid += rcv;
            totalPenaltyPaid += pen;
            allPayments.push(p);

            if (pen > 0) {
              delayedPaymentsCount++;
            } else {
              onTimePaymentsCount++;
            }
          });
        }
      });

      if (grpInstallments.length === 0) {
        grpDemand = parseFloat(grp.installment_amount) || 0;
      }

      totalDemandedAmount += grpDemand;
      totalPaidAmount += grpPaid;
    });

    const totalPaymentsCount = allPayments.length;
    const totalPendingAmount = Math.max(0, totalDemandedAmount - totalPaidAmount);

    // 3. Auctions Won
    const wonAuctions = await Auction.findAll({
      where: { bidder_id: mId },
      attributes: ['id', 'group_id', 'bid_amount', 'auction_number']
    });

    // 4. Member Documents
    const documents = await MemberDocument.findAll({
      where: { member_id: mId },
      attributes: ['id']
    });

    // 5. Legal Suits
    const legalSuits = await SuitFileInformation.findAll({
      where: { subscriber_id: mId },
      attributes: ['id']
    });

    // 6. Referrals
    const referrals = await MemberReferral.findAll({
      where: { refer_by_user_id: mId },
      attributes: ['id']
    });

    // --- Dynamic Scoring Algorithm (0 - 100) ---
    // A. Payment Timeliness (Max 40 points)
    let paymentTimelinessScore = 40;
    if (totalPaymentsCount > 0) {
      paymentTimelinessScore = Math.round((onTimePaymentsCount / totalPaymentsCount) * 40);
    } else if (totalDemandedAmount > 0 && totalPaidAmount === 0) {
      paymentTimelinessScore = 0;
    } else {
      paymentTimelinessScore = 32; // Fresh baseline
    }

    // B. Outstanding / Overdue Ratio (Max 25 points)
    let outstandingRatioScore = 25;
    if (totalDemandedAmount > 0) {
      const overdueRatio = totalPendingAmount / totalDemandedAmount;
      if (overdueRatio === 0) outstandingRatioScore = 25;
      else if (overdueRatio <= 0.10) outstandingRatioScore = 20;
      else if (overdueRatio <= 0.25) outstandingRatioScore = 14;
      else if (overdueRatio <= 0.50) outstandingRatioScore = 7;
      else outstandingRatioScore = 0;
    }

    // C. Tenure & Completed Chits (Max 15 points)
    let tenureScore = 5;
    if (completedChitsCount >= 2) tenureScore = 15;
    else if (completedChitsCount === 1) tenureScore = 12;
    else if (activeChitsCount > 0 && totalPaidAmount > 50000) tenureScore = 9;
    else if (activeChitsCount > 0) tenureScore = 7;

    // D. Post-Winning Discipline (Max 10 points)
    let postWinningDisciplineScore = 8;
    if (wonAuctions.length > 0) {
      postWinningDisciplineScore = totalPendingAmount === 0 ? 10 : Math.max(0, 8 - Math.round((totalPendingAmount / (totalDemandedAmount || 1)) * 10));
    }

    // E. KYC & Profile Completeness (Max 10 points)
    let kycComplianceScore = 0;
    if (member.is_verified) kycComplianceScore += 5;
    if (member.account_number && member.ifsc_code) kycComplianceScore += 2;
    if (documents.length > 0) kycComplianceScore += 3;
    kycComplianceScore = Math.min(10, kycComplianceScore);

    // Final Score
    let finalScore = paymentTimelinessScore + outstandingRatioScore + tenureScore + postWinningDisciplineScore + kycComplianceScore;

    // Deduct penalty for active legal disputes
    if (legalSuits.length > 0) {
      finalScore = Math.max(0, finalScore - 40);
    }
    finalScore = Math.max(0, Math.min(100, finalScore));

    // Calculate 1.0 to 5.0 Star Rating
    const rawRating = (finalScore / 20);
    const starRating = parseFloat(Math.min(5.0, Math.max(1.0, rawRating)).toFixed(1));

    // Categorization according to requirements:
    // Gold: 4.5 above to 5.0
    // Silver: 3.0 above to below 4.5
    // Red Star: below 3.0
    let ratingTier = 'Silver';
    let ratingCategory = 'silver';
    let ratingColor = '#C0C0C0';
    let ratingLabel = 'Silver Star (3.0 - 4.5)';
    let trustTier = 'Silver / Moderate';
    let riskLevel = 'Medium';

    if (starRating >= 4.5) {
      ratingTier = 'Gold';
      ratingCategory = 'gold';
      ratingColor = '#FFD700';
      ratingLabel = 'Gold Star (4.5 - 5.0)';
      trustTier = 'Platinum / Prime Member';
      riskLevel = 'Extremely Low';
    } else if (starRating >= 3.0) {
      ratingTier = 'Silver';
      ratingCategory = 'silver';
      ratingColor = '#C0C0C0';
      ratingLabel = 'Silver Star (3.0 - 4.5)';
      trustTier = 'Silver / Moderate';
      riskLevel = 'Medium';
    } else {
      ratingTier = 'Red Star';
      ratingCategory = 'red';
      ratingColor = '#FF3B30';
      ratingLabel = 'Red Star (Below 3.0)';
      trustTier = 'Defaulter / Critical Risk';
      riskLevel = 'Critical';
    }

    const badges = [];
    if (member.is_verified) badges.push('KYC Verified');
    if (paymentTimelinessScore >= 35) badges.push('Prompt Payer');
    if (outstandingRatioScore === 25) badges.push('Zero Overdue');
    if (completedChitsCount > 0) badges.push('Chit Veteran');
    if (referrals.length >= 3) badges.push('Top Referrer');

    return {
      score: finalScore,
      star_rating: starRating,
      rating_tier: ratingTier,
      rating_category: ratingCategory,
      rating_color: ratingColor,
      rating_label: ratingLabel,
      trust_tier: trustTier,
      risk_level: riskLevel,
      badges,
      metrics: {
        payment_timeliness: paymentTimelinessScore,
        outstanding_ratio: outstandingRatioScore,
        tenure: tenureScore,
        post_winning_discipline: postWinningDisciplineScore,
        kyc_compliance: kycComplianceScore
      }
    };
  } catch (error) {
    console.error('Error in calculateMemberRating:', error);
    return {
      score: 70,
      star_rating: 3.5,
      rating_tier: 'Silver',
      rating_category: 'silver',
      rating_color: '#C0C0C0',
      rating_label: 'Silver Star (3.0 - 4.5)',
      trust_tier: 'Silver / Moderate',
      risk_level: 'Medium',
      badges: []
    };
  }
};

module.exports = {
  calculateMemberRating
};
