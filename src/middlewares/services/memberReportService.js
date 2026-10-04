const { Op } = require('sequelize');
const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const {
  Member,
  Enrollment,
  ChitsGroup,
  ChitsInstallment,
  CustomerPayment,
  Auction,
  CustomerVisit,
  MemberDocument,
  SuitFileInformation,
  MemberReferral,
  StaticDropdownsList,
  StaticDropdownSubcategoryList,
  StaffUser,
  sequelize
} = require('../models');

/**
 * Generates Member 360° Comprehensive Activity & Financial Health Report with Smart Scoring & Star Rating
 * @param {Object} res Express response object
 * @param {string|null} companyId Resolved company ID from token/request
 * @param {number|string} memberIdInput Member ID, User Code, or Member Code
 */
const getMember360ReportService = async (res, companyId, memberIdInput) => {
  try {
    const memberWhere = { is_deleted_status: 0 };
    if (companyId) {
      memberWhere.company_id = companyId;
    }

    if (typeof memberIdInput === 'number' || (!isNaN(memberIdInput) && Number.isInteger(Number(memberIdInput)))) {
      const numId = parseInt(memberIdInput, 10);
      memberWhere[Op.or] = [
        { id: numId },
        { member_id: String(memberIdInput) },
        { other_info_user_code: numId }
      ];
    } else {
      memberWhere[Op.or] = [
        { member_id: String(memberIdInput) },
        { name: { [Op.iLike || Op.like]: `%${memberIdInput}%` } }
      ];
    }

    const member = await Member.findOne({
      where: memberWhere,
      attributes: { exclude: ['verification_otp', 'verification_otp_expires_at', 'verification_otp_attempts', 'other_info_user_password'] },
      include: [
        { model: StaticDropdownsList, as: 'title', attributes: ['dropdown_name'] },
        { model: StaticDropdownSubcategoryList, as: 'parental_title', attributes: ['subcategory_name'] },
        { model: StaticDropdownsList, as: 'gender_dropdown', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'occupation', attributes: ['dropdown_name'] },
        { model: StaticDropdownsList, as: 'emp_type', attributes: ['dropdown_name'] },
        { model: StaticDropdownSubcategoryList, as: 'business_type_details', attributes: ['subcategory_name'] }
      ]
    });

    if (!member) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
    }

    const memberId = member.id;

    // 1. Fetch Enrollments with ChitsGroup
    const enrollments = await Enrollment.findAll({
      where: { subscriber_id: memberId, delete_status: 0 },
      include: [
        {
          model: ChitsGroup,
          as: 'group',
          where: { is_deleted_status: 0 },
          required: true
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const enrollmentIds = enrollments.map(e => e.id);

    // 2. Fetch all ChitsInstallments and nested CustomerPayments
    const installments = await ChitsInstallment.findAll({
      where: { enrollment_id: { [Op.in]: enrollmentIds.length > 0 ? enrollmentIds : [-1] } },
      include: [
        {
          model: CustomerPayment,
          as: 'payments'
        }
      ],
      order: [['installment_no', 'ASC']]
    });

    // 3. Flatten payments
    const allPayments = [];
    installments.forEach(inst => {
      if (inst.payments && inst.payments.length > 0) {
        inst.payments.forEach(p => {
          allPayments.push({
            ...p.toJSON(),
            installment_no: inst.installment_no,
            due_date: inst.due_date,
            enrollment_id: inst.enrollment_id,
            group_id: inst.group_id,
            payable_amount: parseFloat(inst.payable_amount) || 0
          });
        });
      }
    });

    // 4. Fetch All Auctions won by member
    const wonAuctions = await Auction.findAll({
      where: { bidder_id: memberId },
      include: [
        { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name', 'chit_amount'] }
      ],
      order: [['auction_date', 'DESC']]
    });

    // 5. Fetch Field Customer Visits
    const visits = await CustomerVisit.findAll({
      where: { member_id: memberId },
      include: [
        { model: Member, as: 'collection_agent', attributes: ['id', 'name', 'rep_by_first_name', 'sur_name', 'other_info_user_code'], required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    // 6. Fetch Member Documents
    const documents = await MemberDocument.findAll({
      where: { member_id: memberId },
      order: [['createdAt', 'DESC']]
    });

    // 7. Fetch Legal Suits / Disputes
    const legalSuits = await SuitFileInformation.findAll({
      where: { subscriber_id: memberId }
    });

    // 7. Fetch Member Referrals
    const referrals = await MemberReferral.findAll({
      where: { refer_by_user_id: memberId }
    });

    // --- AGGREGATE FINANCIALS & CHIT PORTFOLIO ---
    let totalChitPortfolioValue = 0;
    let totalDemandedAmount = 0;
    let totalPaidAmount = 0;
    let totalPenaltyPaid = 0;
    let totalPrizeMoneyReceived = 0;
    let activeChitsCount = 0;
    let completedChitsCount = 0;

    const chitGroupsReport = enrollments.map((enr) => {
      const grp = enr.group;
      const chitVal = parseFloat(grp.chit_amount) || parseFloat(grp.chit_value) || 0;
      totalChitPortfolioValue += chitVal;

      const grpStatus = Number(grp.chits_group_status);
      if (grpStatus === 2) {
        completedChitsCount++;
      } else {
        activeChitsCount++;
      }

      // Filter installments & payments for this enrollment
      const grpInstallments = installments.filter(inst => inst.enrollment_id === enr.id);
      let grpDemand = 0;
      let grpPaid = 0;
      let grpPenalty = 0;

      grpInstallments.forEach(inst => {
        grpDemand += parseFloat(inst.payable_amount) || 0;
        if (inst.payments && inst.payments.length > 0) {
          inst.payments.forEach(p => {
            grpPaid += parseFloat(p.received_amount) || 0;
            grpPenalty += parseFloat(p.penalty_paid) || 0;
          });
        }
      });

      // If installments table is empty, use default chit installment
      if (grpInstallments.length === 0) {
        grpDemand = parseFloat(grp.installment_amount) || 0;
      }

      totalDemandedAmount += grpDemand;
      totalPaidAmount += grpPaid;
      totalPenaltyPaid += grpPenalty;

      const grpPending = Math.max(0, grpDemand - grpPaid);

      // Check if won this group
      const grpWonAuction = wonAuctions.find(a => a.group_id === grp.id);
      const isWinner = !!grpWonAuction;
      let winningDetails = null;

      if (grpWonAuction) {
        const prizeAmt = parseFloat(grpWonAuction.bid_payable) || parseFloat(grpWonAuction.net_payable) || (chitVal - (parseFloat(grpWonAuction.bid_amount) || 0));
        totalPrizeMoneyReceived += prizeAmt;
        winningDetails = {
          auction_number: grpWonAuction.auction_number,
          auction_date: grpWonAuction.auction_date,
          bid_amount: parseFloat(grpWonAuction.bid_amount) || 0,
          prize_money: prizeAmt,
          dividend_per_share: parseFloat(grpWonAuction.dividend) || 0
        };
      }

      return {
        enrollment_id: enr.id,
        group_id: grp.id,
        group_name: grp.group_name,
        chit_value: chitVal,
        monthly_installment: parseFloat(grp.installment_amount) || 0,
        total_months: grp.no_of_months,
        ticket_number: enr.group_position_number || enr.chit_number || null,
        group_status: grpStatus === 2 ? 'Completed' : (grpStatus === 1 ? 'Active' : 'Not Started'),
        total_installments_count: grpInstallments.length,
        total_demanded: Math.round(grpDemand * 100) / 100,
        total_paid: Math.round(grpPaid * 100) / 100,
        pending_amount: Math.round(grpPending * 100) / 100,
        penalty_paid: Math.round(grpPenalty * 100) / 100,
        is_winner: isWinner,
        winning_details: winningDetails
      };
    });

    // Customer payments summary & habits
    let onTimePaymentsCount = 0;
    let delayedPaymentsCount = 0;
    const paymentModeBreakdown = { Cash: 0, Cheque: 0, BankTransfer: 0, UPI: 0, Other: 0 };

    allPayments.forEach(p => {
      const mode = Number(p.payment_mode);
      if (mode === 1) paymentModeBreakdown.Cash++;
      else if (mode === 2) paymentModeBreakdown.UPI++;
      else if (mode === 3) paymentModeBreakdown.Cheque++;
      else if (mode === 4) paymentModeBreakdown.BankTransfer++;
      else paymentModeBreakdown.Other++;

      if (parseFloat(p.penalty_paid) > 0) {
        delayedPaymentsCount++;
      } else {
        onTimePaymentsCount++;
      }
    });

    const totalPaymentsCount = allPayments.length;
    const totalPendingAmount = Math.max(0, totalDemandedAmount - totalPaidAmount);
    const onTimePaymentPercentage = totalPaymentsCount > 0
      ? Math.round((onTimePaymentsCount / totalPaymentsCount) * 1000) / 10
      : 100;

    // --- DYNAMIC SCORING ALGORITHM (0 - 100) ---
    // 1. Payment Timeliness (Max 40 points)
    let paymentTimelinessScore = 40;
    if (totalPaymentsCount > 0) {
      paymentTimelinessScore = Math.round((onTimePaymentsCount / totalPaymentsCount) * 40);
    } else if (totalDemandedAmount > 0 && totalPaidAmount === 0) {
      paymentTimelinessScore = 0;
    } else {
      paymentTimelinessScore = 30; // Base score for fresh enrollments
    }

    // 2. Outstanding & Overdue Ratio (Max 25 points)
    let outstandingRatioScore = 25;
    if (totalDemandedAmount > 0) {
      const overdueRatio = totalPendingAmount / totalDemandedAmount;
      if (overdueRatio === 0) outstandingRatioScore = 25;
      else if (overdueRatio <= 0.10) outstandingRatioScore = 20;
      else if (overdueRatio <= 0.25) outstandingRatioScore = 14;
      else if (overdueRatio <= 0.50) outstandingRatioScore = 7;
      else outstandingRatioScore = 0;
    }

    // 3. Track Record / Tenure & Completed Chits (Max 15 points)
    let tenureScore = 5;
    if (completedChitsCount >= 2) tenureScore = 15;
    else if (completedChitsCount === 1) tenureScore = 12;
    else if (activeChitsCount > 0 && totalPaidAmount > 50000) tenureScore = 9;
    else if (activeChitsCount > 0) tenureScore = 7;

    // 4. Post-Winning / Prized Discipline (Max 10 points)
    let postWinningDisciplineScore = 8;
    const prizedGroups = chitGroupsReport.filter(g => g.is_winner);
    if (prizedGroups.length > 0) {
      const prizedPending = prizedGroups.reduce((sum, g) => sum + g.pending_amount, 0);
      if (prizedPending === 0) {
        postWinningDisciplineScore = 10;
      } else {
        const prizedPendingRatio = prizedPending / (prizedGroups.reduce((sum, g) => sum + g.chit_value, 0) || 1);
        postWinningDisciplineScore = Math.max(0, Math.round(10 - (prizedPendingRatio * 20)));
      }
    }

    // 5. KYC Compliance (Max 10 points)
    let kycComplianceScore = 0;
    if (member.is_verified) kycComplianceScore += 5;
    if (member.account_number && member.ifsc_code) kycComplianceScore += 2;
    if (documents.length > 0) kycComplianceScore += 3;
    kycComplianceScore = Math.min(10, kycComplianceScore);

    // Final Score Calculation
    let finalScore = paymentTimelinessScore + outstandingRatioScore + tenureScore + postWinningDisciplineScore + kycComplianceScore;

    // Penalty for active legal suits
    const hasActiveLegalSuit = legalSuits.length > 0;
    if (hasActiveLegalSuit) {
      finalScore = Math.max(0, finalScore - 40);
    }
    finalScore = Math.max(0, Math.min(100, finalScore));

    // Star Rating (1 to 5 Stars) & Trust Level
    let starRating = 1;
    let trustTier = 'Defaulter / Critical Risk';
    let riskLevel = 'Critical';
    let recommendation = 'High risk. Block auction bidding and assign collection agent.';
    const badges = [];

    if (finalScore >= 90) {
      starRating = 5;
      trustTier = 'Platinum / Prime Member';
      riskLevel = 'Extremely Low';
      recommendation = 'Eligible for instant auction approval and high-value chits without additional guarantor.';
    } else if (finalScore >= 75) {
      starRating = 4;
      trustTier = 'Gold / Trusted Member';
      riskLevel = 'Low';
      recommendation = 'Approved for standard bidding and new chit enrollments with standard surety.';
    } else if (finalScore >= 55) {
      starRating = 3;
      trustTier = 'Silver / Moderate';
      riskLevel = 'Medium';
      recommendation = 'Caution recommended. Require 2 verified guarantors before releasing prized amount.';
    } else if (finalScore >= 35) {
      starRating = 2;
      trustTier = 'Bronze / High Risk';
      riskLevel = 'High';
      recommendation = 'Hold bidding eligibility until all overdue installments are cleared.';
    } else {
      starRating = 1;
      trustTier = 'Defaulter / Critical Risk';
      riskLevel = 'Critical';
      recommendation = 'High default risk. Block bidding and assign field collection agent.';
    }

    if (member.is_verified) badges.push('KYC Verified');
    if (paymentTimelinessScore >= 35) badges.push('Prompt Payer');
    if (outstandingRatioScore === 25) badges.push('Zero Overdue');
    if (completedChitsCount > 0) badges.push('Chit Veteran');
    if (prizedGroups.length > 0 && postWinningDisciplineScore === 10) badges.push('Reliable Winner');
    if (referrals.length >= 3) badges.push('Top Referrer');

    // Parse introduced_as labels
    let introducedAsLabels = [];
    if (member.introduced_as) {
      let intIds = [];
      if (Array.isArray(member.introduced_as)) {
        intIds = member.introduced_as.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      } else if (typeof member.introduced_as === 'string') {
        try { intIds = JSON.parse(member.introduced_as).map(id => parseInt(id, 10)).filter(id => !isNaN(id)); }
        catch (e) { intIds = [parseInt(member.introduced_as, 10)].filter(id => !isNaN(id)); }
      }
      if (intIds.length > 0) {
        const intDropdowns = await StaticDropdownsList.findAll({
          where: { id: { [Op.in]: intIds } },
          attributes: ['id', 'dropdown_name']
        });
        introducedAsLabels = intDropdowns.map(d => d.dropdown_name);
      }
    }

    const responseData = {
      profile: {
        id: member.id,
        member_id: member.member_id,
        user_code: member.other_info_user_code,
        name: member.name || `${member.rep_by_first_name || ''} ${member.sur_name || ''}`.trim(),
        title: member.title?.dropdown_name || null,
        mobile_number: member.mobile_number,
        email: member.email,
        gender: member.gender_dropdown?.dropdown_name || null,
        date_of_birth: member.date_of_birth,
        age: member.age,
        registration_date: member.registration_date || member.createdAt,
        occupation: member.occupation?.dropdown_name || null,
        employment_type: member.emp_type?.dropdown_name || null,
        organisation: member.employee_organisation || null,
        designation: member.employee_designation || null,
        annual_income: member.annual_income ? parseFloat(member.annual_income) : null,
        is_verified: member.is_verified,
        introduced_as: introducedAsLabels,
        address: {
          door_no: member.address_info_door_no,
          street: member.address_info_street_name,
          full_address: member.address_info_address,
          phone: member.address_info_phone
        },
        bank_details: {
          account_holder: member.account_holder_name,
          account_number: member.account_number,
          bank_name: member.bank_name,
          branch: member.bank_branch,
          ifsc_code: member.ifsc_code
        }
      },
      scoring: {
        score: finalScore,
        star_rating: starRating,
        trust_tier: trustTier,
        risk_level: riskLevel,
        recommendation,
        badges,
        metrics_breakdown: {
          payment_timeliness_score: paymentTimelinessScore,
          outstanding_ratio_score: outstandingRatioScore,
          tenure_score: tenureScore,
          post_winning_discipline_score: postWinningDisciplineScore,
          kyc_compliance_score: kycComplianceScore
        }
      },
      financial_summary: {
        total_chits_enrolled: enrollments.length,
        active_chits_count: activeChitsCount,
        completed_chits_count: completedChitsCount,
        total_chit_portfolio_value: Math.round(totalChitPortfolioValue * 100) / 100,
        total_demand_amount: Math.round(totalDemandedAmount * 100) / 100,
        total_paid_amount: Math.round(totalPaidAmount * 100) / 100,
        total_pending_amount: Math.round(totalPendingAmount * 100) / 100,
        total_penalty_paid: Math.round(totalPenaltyPaid * 100) / 100,
        total_prize_money_received: Math.round(totalPrizeMoneyReceived * 100) / 100
      },
      payment_habits: {
        on_time_payment_percentage: onTimePaymentPercentage,
        total_payments_count: totalPaymentsCount,
        on_time_payments_count: onTimePaymentsCount,
        delayed_payments_count: delayedPaymentsCount,
        payment_modes_breakdown: paymentModeBreakdown
      },
      chit_groups: chitGroupsReport,
      auctions_won: wonAuctions.map(a => ({
        id: a.id,
        group_id: a.group_id,
        group_name: a.group?.group_name,
        chit_value: parseFloat(a.group?.chit_amount) || parseFloat(a.group?.chit_value) || 0,
        auction_number: a.auction_number,
        auction_date: a.auction_date,
        bid_amount: parseFloat(a.bid_amount) || 0,
        net_paid_to_winner: parseFloat(a.bid_payable) || parseFloat(a.net_payable) || 0,
        dividend: parseFloat(a.dividend) || 0
      })),
      field_visits: visits.map(v => ({
        id: v.id,
        visit_date: v.createdAt,
        visitor_type: v.visitor_type === 1 ? 'Collection Agent' : 'Business Agent',
        agent_name: v.collection_agent ? (v.collection_agent.name || `${v.collection_agent.rep_by_first_name || ''} ${v.collection_agent.sur_name || ''}`.trim()) : null,
        agent_code: v.collection_agent?.other_info_user_code || null,
        remarks: v.remarks,
        proof_url: v.upload_proof,
        status: v.customer_vistor_status === 1 ? 'Approved' : (v.customer_vistor_status === 3 ? 'Dispute/Rejected' : 'Pending')
      })),
      documents: documents.map(d => ({
        id: d.id,
        group_id: d.group_id,
        documents: d.documents,
        status: d.status === 1 ? 'Verified' : 'Pending'
      })),
      referrals: {
        count: referrals.length,
        rows: referrals.map(r => ({
          id: r.id,
          name: r.name,
          mobile_number: r.mobile_number,
          status: r.status,
          date: r.createdAt
        }))
      },
      legal_suits: {
        has_legal_dispute: hasActiveLegalSuit,
        count: legalSuits.length,
        rows: legalSuits.map(s => ({
          id: s.id,
          suit_no: s.suit_no,
          court_name: s.court_name,
          advocate_name: s.advocate_name,
          suit_cause: s.suit_cause,
          claim_amount: parseFloat(s.claim_amount) || parseFloat(s.principle_amount) || 0,
          legal_notice_date: s.legal_notice_date,
          filing_date: s.suit_file_date
        }))
      }
    };

    return successResponse(res, statusCodes.OK, 'Member 360 report generated successfully', responseData);
  } catch (error) {
    console.error('Error in getMember360ReportService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Failed to generate member 360 report');
  }
};

module.exports = {
  getMember360ReportService
};
