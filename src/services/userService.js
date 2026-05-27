const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { Enrollment, Company, ChitsGroup, Member, StaticDropdownsList, Area, City, ChitsInstallment, UpcomingChit, UpcomingChitInterest, Auction, sequelize } = require('../models');
const { Op } = require('sequelize');

const getHomeRecordService = async (res, subscriber_id) => {
  try {
    // 1. Fetch only essential Enrollment fields
    const enrollment = await Enrollment.findOne({
      where: {
        subscriber_id,
        delete_status: 0
      },
      attributes: ['id', 'group_id', 'subscriber_id'],
      order: [['createdAt', 'DESC']]
    });

    if (!enrollment) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'No enrollment record found for this subscriber');
    }

    // 2. Fetch basic ChitsGroup info
    const group = await ChitsGroup.findOne({
      where: { id: enrollment.group_id },
      attributes: ['id', 'group_name', 'chit_amount']
    });

    // 3. Fetch the exact NEXT UPCOMING installment (Not Paid yet)
    const upcomingInstallment = await ChitsInstallment.findOne({
      where: {
        enrollment_id: enrollment.id,
        id: {
          [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`)
        }
      },
      order: [['installment_no', 'ASC']]
    });

    // 4. Static payload for upcoming auctions as requested
    const upcoming_auction = [
      {
        date: "12",
        month_name: "April",
        time: "10:00 AM",
        current_bid_price: "5000.00"
      },
      {
        date: "25",
        month_name: "May",
        time: "02:30 PM",
        current_bid_price: "7500.00"
      }
    ];

    const responseData = {
      id: enrollment.id,
      group_id: enrollment.group_id,
      subscriber_id: enrollment.subscriber_id,
      group_name: group ? group.group_name : null,
      chit_amount: group ? group.chit_amount : null,
      upcoming_instalment_id: upcomingInstallment ? upcomingInstallment.id : null,
      enrollment_id: enrollment.id,
      next_due_date: upcomingInstallment ? upcomingInstallment.due_date : null,
      payable_amount: upcomingInstallment ? upcomingInstallment.payable_amount : null,
      ...(upcomingInstallment && {
        createdAt: upcomingInstallment.createdAt,
        updatedAt: upcomingInstallment.updatedAt
      }),
      upcoming_auction
    };

    return successResponse(res, statusCodes.OK, 'Latest home record and upcoming installment retrieved successfully', responseData);
  } catch (error) {
    console.error('Error in getHomeRecordService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getAllHomeRecordsService = async (res, subscriber_id, type = 0, min = 0, max = 10) => {
  try {
    const enrollments = await Enrollment.findAll({
      where: {
        subscriber_id,
        delete_status: 0
      },
      attributes: ['id', 'group_id', 'subscriber_id'],
      order: [['createdAt', 'DESC']]
    });

    if (!enrollments || enrollments.length === 0) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'No enrollment records found for this subscriber');
    }

    const resolvedData = await Promise.all(enrollments.map(async (enrollment) => {
      const group = await ChitsGroup.findOne({
        where: { id: enrollment.group_id },
        attributes: ['id', 'group_name', 'chit_amount']
      });

      const upcomingInstallment = await ChitsInstallment.findOne({
        where: {
          enrollment_id: enrollment.id,
          id: {
            [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`)
          }
        },
        order: [['installment_no', 'ASC']]
      });

      const occupiedCount = await Enrollment.count({
        where: { group_id: enrollment.group_id, delete_status: 0 }
      });

      return {
        id: enrollment.id,
        group_id: enrollment.group_id,
        subscriber_id: enrollment.subscriber_id,
        group_name: group ? group.group_name : null,
        chit_amount: group ? group.chit_amount : null,
        positions_occupied_count: occupiedCount,
        total_positions: 20,
        upcoming_instalment_id: upcomingInstallment ? upcomingInstallment.id : null,
        enrollment_id: enrollment.id,
        next_due_date: upcomingInstallment ? upcomingInstallment.due_date : null,
        payable_amount: upcomingInstallment ? upcomingInstallment.payable_amount : null,
        ...(upcomingInstallment && {
          createdAt: upcomingInstallment.createdAt,
          updatedAt: upcomingInstallment.updatedAt
        })
      };
    }));

    // Apply Filter logic dynamically based on group capacity
    let filteredData = resolvedData;
    const typeInt = Number(type);
    
    if (typeInt === 1) { // Only fetch perfectly complete groups
      filteredData = resolvedData.filter(item => item.positions_occupied_count >= item.total_positions);
    } else if (typeInt === 2) { // Fetch explicitly incomplete active groups
      filteredData = resolvedData.filter(item => item.positions_occupied_count < item.total_positions);
    }

    // Process numerical pagination offsets cleanly enforcing boundaries
    const offset = parseInt(min, 10) || 0;
    const limit = parseInt(max, 10) || 10;
    const paginatedRows = filteredData.slice(offset, offset + limit);

    return successResponse(res, statusCodes.OK, 'All home records retrieved successfully', {
      count: filteredData.length,
      rows: paginatedRows
    });
  } catch (error) {
    console.error('Error in getAllHomeRecordsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getUpcomingChitsService = async (res, userPayload, min = 0, max = 10) => {
  try {
    const { id: user_id } = userPayload;

    const member = await Member.findByPk(user_id);
    if (!member) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
    }
    const company_id = member.company_id;

    const limit = parseInt(max, 10) || 10;
    const offset = parseInt(min, 10) || 0;

    const whereClause = {
      status: 0
    };
    if (company_id) {
      whereClause.company_id = company_id;
    }

    const { count, rows: chits } = await UpcomingChit.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: UpcomingChitInterest,
          as: 'interests',
          where: { user_id },
          required: false // LEFT JOIN
        }
      ],
      limit,
      offset,
      order: [['chit_date', 'ASC']]
    });

    // Map through chits and resolve showing_interest status dynamically per user
    const resolvedRows = chits.map((chit) => {
      const chitJson = chit.toJSON();
      const hasInterest = chitJson.interests && chitJson.interests.length > 0;
      const showingInterestVal = hasInterest ? chitJson.interests[0].showing_interest : 0;
      
      delete chitJson.interests;

      return {
        ...chitJson,
        showing_interest: showingInterestVal
      };
    });

    return successResponse(res, statusCodes.OK, 'Upcoming chits retrieved successfully', {
      count,
      rows: resolvedRows
    });
  } catch (error) {
    console.error('Error in getUpcomingChitsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const submitChitInterestService = async (res, userPayload, upcoming_chit_id, showing_interest) => {
  try {
    const { id: user_id } = userPayload;

    const chit = await UpcomingChit.findByPk(upcoming_chit_id);
    if (!chit) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Upcoming chit not found');
    }

    const interestInt = Number(showing_interest);

    if (interestInt === 0) {
      // If showing_interest is 0 (uninterested), delete the record from database
      await UpcomingChitInterest.destroy({
        where: { upcoming_chit_id, user_id }
      });
    } else if (interestInt === 1) {
      // If showing_interest is 1 (interested), find or create the record
      const [interestRecord] = await UpcomingChitInterest.findOrCreate({
        where: { upcoming_chit_id, user_id },
        defaults: { showing_interest: 1 }
      });
      if (interestRecord.showing_interest !== 1) {
        await interestRecord.update({ showing_interest: 1 });
      }
    }

    const responseChit = {
      ...chit.toJSON(),
      showing_interest: interestInt
    };

    return successResponse(res, statusCodes.OK, 'Upcoming chit interest updated successfully', responseChit);
  } catch (error) {
    console.error('Error in submitChitInterestService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getPendingPaymentsService = async (res, userPayload, bodySubscriberId, min = 0, max = 10) => {
  try {
    let subscriber_id = bodySubscriberId;

    if (!subscriber_id) {
      if (!userPayload) {
        return errorResponse(res, statusCodes.BAD_REQUEST, 'Subscriber ID is required');
      }
      subscriber_id = userPayload.id;
    }

    const member = await Member.findByPk(subscriber_id);
    if (!member) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Subscriber not found');
    }

    // Find all won auctions by this subscriber in any group
    const wonAuctions = await Auction.findAll({
      where: {
        bidder_id: subscriber_id
      },
      attributes: ['group_id']
    });
    const wonGroupIds = new Set(wonAuctions.map(a => a.group_id));

    // 1. Fetch active enrollments for this subscriber
    const enrollments = await Enrollment.findAll({
      where: {
        subscriber_id,
        delete_status: 0
      },
      include: [
        {
          model: ChitsGroup,
          as: 'group',
          where: { is_deleted_status: 0 }
        }
      ]
    });

    if (!enrollments || enrollments.length === 0) {
      return successResponse(res, statusCodes.OK, 'No pending payments found', {
        total_payments_count: 0,
        overdue_payments_count: 0,
        grand_amount: 0.00,
        rows: []
      });
    }

    const enrollmentIds = enrollments.map(e => e.id);

    const now = new Date();
    // Normalize to isolate end of current month in local time
    const endOfCurrentMonthStr = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString().split('T')[0];

    // 2. Fetch all unpaid installments for these enrollments
    const unpaidInstallments = await ChitsInstallment.findAll({
      where: {
        enrollment_id: { [Op.in]: enrollmentIds },
        due_date: { [Op.lte]: endOfCurrentMonthStr },
        id: {
          [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`)
        }
      },
      include: [
        {
          model: Enrollment,
          as: 'enrollment',
          include: [
            {
              model: ChitsGroup,
              as: 'group'
            }
          ]
        }
      ],
      order: [['due_date', 'ASC']]
    });

    // Format helper for date to produce: e.g. "15th March 2026"
    const formatDateToOrdinal = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const day = date.getDate();
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      
      let suffix = 'th';
      if (day === 1 || day === 21 || day === 31) suffix = 'st';
      else if (day === 2 || day === 22) suffix = 'nd';
      else if (day === 3 || day === 23) suffix = 'rd';
      
      return `${day}${suffix} ${month} ${year}`;
    };

    let grandAmount = 0.00;
    let overduePaymentsCount = 0;

    const formattedRows = unpaidInstallments.map((installment) => {
      const group = installment.enrollment?.group;
      const groupName = group ? group.group_name : 'Unknown Chit';
      
      const dueAmount = parseFloat(installment.payable_amount) || 0.00;
      const grossAmount = group ? (parseFloat(group.installment_amount) || 0.00) : dueAmount;
      
      // Calculate dynamic over_due_days_count based on current date
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = new Date(installment.due_date);
      dueDate.setHours(0, 0, 0, 0);

      let overDueDaysCount = 0;
      if (dueDate < today) {
        const diffTime = today.getTime() - dueDate.getTime();
        overDueDaysCount = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }
      const isOverdue = overDueDaysCount > 0;

      if (isOverdue) {
        overduePaymentsCount++;
      }

      // Check if subscriber is an auction winner (Prized Subscriber) in this group
      const isWinner = group ? wonGroupIds.has(group.id) : false;

      // Select dynamic penalty rate: penality_for_ps for winners, penality_for_nps for non-winners
      const penaltyRate = isWinner
        ? (group ? parseFloat(group.penality_for_ps) || 0.00 : 0.00)
        : (group ? parseFloat(group.penality_for_nps) || 0.00 : 0.00);

      let penaltyAmountPerDay = 0.00;
      let displayPercentage = 2.0;

      if (penaltyRate > 0) {
        if (penaltyRate <= 20) {
          // Dynamic percentage rate per day
          displayPercentage = penaltyRate;
          penaltyAmountPerDay = (penaltyRate / 100) * dueAmount;
        } else {
          // Flat daily penalty amount
          penaltyAmountPerDay = penaltyRate;
          displayPercentage = dueAmount > 0 ? parseFloat(((penaltyAmountPerDay / dueAmount) * 100).toFixed(1)) : 2.0;
        }
      } else {
        // Fallback default: 2.0% per day
        displayPercentage = 2.0;
        penaltyAmountPerDay = 0.02 * dueAmount;
      }

      // Dynamic calculation of penalty_amount
      const penaltyAmount = isOverdue 
        ? parseFloat((overDueDaysCount * penaltyAmountPerDay).toFixed(2)) 
        : 0.00;

      const penaltyText = isOverdue 
        ? `Penalty ${displayPercentage}% per day x ${overDueDaysCount} days` 
        : null;

      const finalPayableAmount = parseFloat((dueAmount + penaltyAmount).toFixed(2));
      grandAmount += finalPayableAmount;

      return {
        id: installment.id,
        chit_group_name: groupName,
        due_date: installment.due_date,
        due_date_formatted: formatDateToOrdinal(installment.due_date),
        due_amount: dueAmount,
        gross_installment_amount: grossAmount,
        penalty_amount: penaltyAmount,
        over_due_days_count: overDueDaysCount,
        penalty_text: penaltyText,
        final_payable_amount: finalPayableAmount,
        is_overdue: isOverdue
      };
    });

    const offset = parseInt(min, 10) || 0;
    const limit = parseInt(max, 10) || 10;
    const paginatedRows = formattedRows.slice(offset, offset + limit);

    const responsePayload = {
      total_payments_count: formattedRows.length,
      overdue_payments_count: overduePaymentsCount,
      grand_amount: parseFloat(grandAmount.toFixed(2)),
      rows: paginatedRows
    };

    return successResponse(res, statusCodes.OK, 'Pending payments retrieved successfully', responsePayload);
  } catch (error) {
    console.error('Error in getPendingPaymentsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getBidsService = async (res, userPayload, type, min = 0, max = 10) => {
  try {
    if (!userPayload) {
      return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');
    }
    const subscriber_id = userPayload.id;

    // 1. Fetch active enrollments for this subscriber
    const enrollments = await Enrollment.findAll({
      where: {
        subscriber_id,
        delete_status: 0
      },
      include: [
        {
          model: ChitsGroup,
          as: 'group',
          where: { is_deleted_status: 0 }
        }
      ]
    });

    if (!enrollments || enrollments.length === 0) {
      return successResponse(res, statusCodes.OK, 'No bids found', []);
    }

    // 2. Filter groups based on type
    const todayStr = new Date().toISOString().split('T')[0];
    const resolvedRows = [];

    // Helper for date formatting
    const formatDateToOrdinal = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const day = date.getDate();
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      
      let suffix = 'th';
      if (day === 1 || day === 21 || day === 31) suffix = 'st';
      else if (day === 2 || day === 22) suffix = 'nd';
      else if (day === 3 || day === 23) suffix = 'rd';
      
      return `${day}${suffix} ${month} ${year}`;
    };

    for (const e of enrollments) {
      const group = e.group;
      if (!group) continue;

      let isMatch = false;
      let badgeLabel = '';
      let timingLabel = '';

      const groupStatus = Number(group.chits_group_status); // 0 - Not started, 1 - started, 2 - completed

      if (type === 'ongoing') {
        if (groupStatus === 1) {
          isMatch = true;
          // If auction is scheduled today, label it "Live Now" or "Today"
          const isAuctionToday = group.auction_date === todayStr;
          badgeLabel = isAuctionToday ? 'Live Now' : 'Active';
          timingLabel = isAuctionToday ? 'Today' : (group.auction_date ? formatDateToOrdinal(group.auction_date) : 'Today');
        }
      } else if (type === 'upcoming') {
        if (groupStatus === 0) {
          isMatch = true;
          badgeLabel = 'Upcoming';
          timingLabel = group.auction_date ? formatDateToOrdinal(group.auction_date) : 'Soon';
        }
      } else if (type === 'history') {
        if (groupStatus === 2) {
          isMatch = true;
          badgeLabel = 'Completed';
          timingLabel = group.auction_date ? formatDateToOrdinal(group.auction_date) : 'Closed';
        }
      }

      if (isMatch) {
        // Count enrolled members in this group
        const membersCount = await Enrollment.count({
          where: { group_id: group.id, delete_status: 0 }
        });

        resolvedRows.push({
          group_id: group.id,
          group_name: group.group_name || 'Unknown Chit',
          chit_amount: parseFloat(group.chit_amount) || 0.00,
          members_count: membersCount,
          badge_label: badgeLabel,
          timing_label: timingLabel,
          auction_date: group.auction_date
        });
      }
    }

    const offset = parseInt(min, 10) || 0;
    const limit = parseInt(max, 10) || 10;
    const paginatedRows = resolvedRows.slice(offset, offset + limit);

    return successResponse(res, statusCodes.OK, 'Bids retrieved successfully', {
      count: resolvedRows.length,
      rows: paginatedRows
    });
  } catch (error) {
    console.error('Error in getBidsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getBidDetailsService = async (res, group_id) => {
  try {
    const group = await ChitsGroup.findByPk(group_id);
    if (!group) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Chit group not found');
    }

    // 1. Fetch the latest completed auction for this group
    const latestAuction = await Auction.findOne({
      where: { group_id },
      order: [['auction_number', 'DESC']],
      include: [
        {
          model: Member,
          as: 'bidder',
          attributes: ['id', 'name', 'member_id']
        }
      ]
    });

    // 2. Count active members/enrollments in this group
    const membersCount = await Enrollment.count({
      where: { group_id, delete_status: 0 }
    });

    // 3. Current month / installment fraction (e.g. "10/15")
    const totalAuctionsCount = await Auction.count({ where: { group_id } });
    const currentInstallmentNo = Math.max(1, totalAuctionsCount);
    const totalInstallments = group.no_of_installments || 1;
    const currentMonthFormatted = `${currentInstallmentNo}/${totalInstallments}`;

    const bidWinningAmount = latestAuction ? parseFloat(latestAuction.bid_amount) : 0.00;
    
    // Status label mapping
    const groupStatus = Number(group.chits_group_status);
    let badgeLabel = 'Upcoming';
    if (groupStatus === 1) badgeLabel = 'Live Now';
    else if (groupStatus === 2) badgeLabel = 'Completed';

    const responseData = {
      bid_winning_amount: bidWinningAmount,
      chit_group_details: {
        group_id: group.id,
        group_name: group.group_name || 'Unknown Chit',
        total_amount: parseFloat(group.chit_amount) || 0.00,
        total_installments: totalInstallments,
        members_count: membersCount,
        current_month: currentMonthFormatted,
        badge_label: badgeLabel
      },
      winner_details: latestAuction && latestAuction.bidder ? {
        winner_name: latestAuction.bidder.name || 'N/A',
        winner_member_id: latestAuction.bidder.member_id || `#${latestAuction.bidder.id}`
      } : null
    };

    return successResponse(res, statusCodes.OK, 'Bid details retrieved successfully', responseData);
  } catch (error) {
    console.error('Error in getBidDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

const getChitDetailsService = async (res, userPayload, group_id) => {
  try {
    if (!userPayload) {
      return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');
    }
    const subscriber_id = userPayload.id;

    // 1. Fetch Chit Group details
    const group = await ChitsGroup.findByPk(group_id);
    if (!group) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'Chit group not found');
    }

    // 2. Fetch the subscriber's enrollments in this group
    const userEnrollments = await Enrollment.findAll({
      where: {
        subscriber_id,
        group_id,
        delete_status: 0
      },
      include: [
        {
          model: Member,
          as: 'business_agent',
          attributes: ['id', 'name']
        }
      ],
      order: [['group_position_number', 'ASC']]
    });

    if (!userEnrollments || userEnrollments.length === 0) {
      return errorResponse(res, statusCodes.NOT_FOUND, 'No enrollment found for this subscriber in this group');
    }

    // Combine formatted ticket position numbers (e.g. "#08, #07")
    const positionNumbersFormatted = userEnrollments.map(e => {
      const pos = e.group_position_number;
      return "#" + String(pos).padStart(2, '0');
    }).join(', ');

    // 3. Resolve Business Agent Name
    // Pick first enrollment's agent, if not found fallback to Mr. Venkatesh Rao (mockup)
    let agentName = 'Mr. Venkatesh Rao';
    if (userEnrollments[0].business_agent && userEnrollments[0].business_agent.name) {
      agentName = userEnrollments[0].business_agent.name;
    }

    // 4. Count total members (active enrollments) in this group
    const totalMembersCount = await Enrollment.count({
      where: { group_id, delete_status: 0 }
    });

    // 5. Calculate Next Payment Due card details
    const enrollmentIds = userEnrollments.map(e => e.id);

    // Fetch the earliest unpaid installment across these enrollments
    const upcomingInstallment = await ChitsInstallment.findOne({
      where: {
        enrollment_id: { [Op.in]: enrollmentIds },
        id: {
          [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`)
        }
      },
      order: [['due_date', 'ASC']]
    });

    const formatDateToOrdinal = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const day = date.getDate();
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      
      let suffix = 'th';
      if (day === 1 || day === 21 || day === 31) suffix = 'st';
      else if (day === 2 || day === 22) suffix = 'nd';
      else if (day === 3 || day === 23) suffix = 'rd';
      
      return `${day}${suffix} ${month} ${year}`;
    };

    let nextPaymentDue = null;
    if (upcomingInstallment) {
      const grossAmount = parseFloat(group.installment_amount) || 0.00;
      const penaltyAmount = parseFloat(upcomingInstallment.penalty_amount) || 0.00;
      const payableAmount = parseFloat(upcomingInstallment.payable_amount) || 0.00;
      const finalDueAmount = payableAmount + penaltyAmount;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = new Date(upcomingInstallment.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const days_left = diffDays >= 0 ? diffDays : 0;

      nextPaymentDue = {
        installment_no: upcomingInstallment.installment_no,
        due_date: upcomingInstallment.due_date,
        due_date_formatted: formatDateToOrdinal(upcomingInstallment.due_date),
        due_amount: finalDueAmount,
        days_left: days_left,
        days_left_text: `${days_left} days left`
      };
    }

    // 6. Fetch all completed auctions for this group
    const auctions = await Auction.findAll({
      where: { group_id },
      order: [['auction_number', 'DESC']],
      include: [
        {
          model: Member,
          as: 'bidder',
          attributes: ['id', 'name', 'member_id']
        }
      ]
    });

    // 7. Get ALL active enrollments in the group to build member-wise breakdown list
    const allGroupEnrollments = await Enrollment.findAll({
      where: {
        group_id,
        delete_status: 0
      },
      include: [
        {
          model: Member,
          as: 'subscriber',
          attributes: ['id', 'name', 'member_id']
        }
      ],
      order: [['group_position_number', 'ASC']]
    });

    // Fetch subscriber's own installments in this group to extract exact monthly math
    const allUserInstallments = await ChitsInstallment.findAll({
      where: {
        enrollment_id: { [Op.in]: enrollmentIds }
      }
    });

    const monthlyActivity = [];
    const monthsList = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    for (const auction of auctions) {
      // Find month name from auction date
      let monthName = 'Unknown';
      if (auction.auction_date) {
        const ad = new Date(auction.auction_date);
        if (!isNaN(ad.getTime())) {
          monthName = monthsList[ad.getMonth()];
        }
      }

      // Format auction date (DD/MM/YYYY)
      let auctionDateFormatted = '';
      if (auction.auction_date) {
        const ad = new Date(auction.auction_date);
        if (!isNaN(ad.getTime())) {
          const d = String(ad.getDate()).padStart(2, '0');
          const m = String(ad.getMonth() + 1).padStart(2, '0');
          const y = ad.getFullYear();
          auctionDateFormatted = `${d}/${m}/${y}`;
        }
      }

      // Find the winner ticket number formatted (e.g. "#12")
      const winnerTicketFormatted = auction.ticket_number 
        ? "#" + String(auction.ticket_number).padStart(2, '0') 
        : (auction.bidder && auction.bidder.member_id ? `#${auction.bidder.member_id}` : 'N/A');

      // Math card stats
      const originalAmountVal = parseFloat(group.installment_amount) || 0.00;
      let profitAmountVal = 0.00;

      // Check if we have subscriber's installment record for this installment number
      const matchingInstallment = allUserInstallments.find(inst => inst.installment_no === auction.auction_number);
      if (matchingInstallment) {
        const payableVal = parseFloat(matchingInstallment.payable_amount) || 0.00;
        profitAmountVal = originalAmountVal - payableVal;
      } else {
        if (auction.dividend) {
          const divVal = parseFloat(auction.dividend);
          if (divVal < originalAmountVal) {
            profitAmountVal = divVal;
          } else {
            profitAmountVal = divVal / (totalMembersCount || 20);
          }
        }
      }
      
      const payableAmountVal = originalAmountVal - profitAmountVal;

      // 8. Build member-wise breakdown list for this specific auction/installment number
      // Query installments for all group enrollments for this installment no
      const groupEnrollmentIds = allGroupEnrollments.map(e => e.id);
      const allInstallmentsForAuction = await ChitsInstallment.findAll({
        where: {
          enrollment_id: { [Op.in]: groupEnrollmentIds },
          installment_no: auction.auction_number
        }
      });

      const memberBreakdown = [];
      let totalOriginal = 0.00;
      let totalProfit = 0.00;
      let totalPayable = 0.00;

      for (const ge of allGroupEnrollments) {
        const memberOriginal = originalAmountVal;
        let memberPayable = memberOriginal;
        let memberProfit = 0.00;

        const geInstallment = allInstallmentsForAuction.find(inst => inst.enrollment_id === ge.id);
        if (geInstallment) {
          memberPayable = parseFloat(geInstallment.payable_amount) || 0.00;
          memberProfit = memberOriginal - memberPayable;
        } else {
          memberProfit = profitAmountVal;
          memberPayable = memberOriginal - memberProfit;
        }

        totalOriginal += memberOriginal;
        totalProfit += memberProfit;
        totalPayable += memberPayable;

        memberBreakdown.push({
          position_label: `Member #${ge.group_position_number}`,
          name: ge.subscriber ? ge.subscriber.name : 'Unknown Subscriber',
          payable_amount: parseFloat(memberPayable.toFixed(2)),
          profit_amount: parseFloat(memberProfit.toFixed(2)),
          original_amount: parseFloat(memberOriginal.toFixed(2))
        });
      }

      monthlyActivity.push({
        id: auction.id,
        auction_number: auction.auction_number,
        month_name: monthName,
        auction_date_formatted: auctionDateFormatted,
        bid_winning_amount: parseFloat(auction.bid_amount) || 0.00,
        winner_name: auction.bidder ? auction.bidder.name : 'N/A',
        winner_member_id: winnerTicketFormatted,
        payable_amount: parseFloat(payableAmountVal.toFixed(2)),
        profit_amount: parseFloat(profitAmountVal.toFixed(2)),
        original_amount: parseFloat(originalAmountVal.toFixed(2)),
        member_breakdown: memberBreakdown,
        breakdown_summary: {
          total_payable: parseFloat(totalPayable.toFixed(2)),
          total_profit: parseFloat(totalProfit.toFixed(2)),
          total_original: parseFloat(totalOriginal.toFixed(2))
        }
      });
    }

    // Assemble final beautiful structured response matching Left and Right screens
    const responsePayload = {
      chit_group_details: {
        group_id: group.id,
        group_name: group.group_name || 'Unknown Chit',
        total_amount: parseFloat(group.chit_amount) || 0.00,
        running_status_label: group.chits_group_status === 1 ? 'Active chit' : (group.chits_group_status === 2 ? 'Completed' : 'Upcoming'),
        ticket_member_number: positionNumbersFormatted,
        agent_name: agentName,
        total_members: `${totalMembersCount} Members`
      },
      my_chit_overview: {
        monthly_bid_amount: parseFloat(group.installment_amount) || 0.00,
        next_payment_due: nextPaymentDue
      },
      monthly_activity: monthlyActivity
    };

    return successResponse(res, statusCodes.OK, 'Chit details retrieved successfully', responsePayload);
  } catch (error) {
    console.error('Error in getChitDetailsService:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};

module.exports = {
  getHomeRecordService,
  getAllHomeRecordsService,
  getUpcomingChitsService,
  submitChitInterestService,
  getPendingPaymentsService,
  getBidsService,
  getBidDetailsService,
  getChitDetailsService
};

