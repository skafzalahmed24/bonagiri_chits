const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { Enrollment, Company, ChitsGroup, Member, StaticDropdownsList, Area, City, ChitsInstallment, sequelize } = require('../models');
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

module.exports = {
  getHomeRecordService,
  getAllHomeRecordsService
};
