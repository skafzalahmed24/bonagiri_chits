const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const {
    Country, State, District, City, StaticDropdownsList, StaticDropdownSubcategoryList,
    Member, Route, Area, ChitsGroup, Company, ChitsInstallment, Enrollment,
    UpcomingChit, UpcomingChitInterest, CustomerPayment, GroupUnderStaticList,
    Auction, CollectionAgentAmount, FixedSchemeChitsConfiguration,
    NotificationHistory, MemberDocument,
    sequelize
} = require('../models');
const { Op } = require('sequelize');

const { getSimulatedNow } = require('../utils/timeSimulator');

const getHomeRecordService = async (res, userPayload) => {
    const subscriber_id = userPayload ? userPayload.id : null;
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

        // 5. Fetch the latest upcoming chit record (same logic as getUpcomingChitsService, limit 1)
        let latest_upcoming_chit = null;
        try {
            const member = await Member.findByPk(subscriber_id);
            const company_id = member ? member.company_id : null;

            const whereClause = { status: 0 };
            if (company_id) {
                whereClause.company_id = company_id;
            }

            const latestChit = await UpcomingChit.findOne({
                where: whereClause,
                include: [
                    {
                        model: UpcomingChitInterest,
                        as: 'interests',
                        where: { user_id: subscriber_id },
                        required: false // LEFT JOIN
                    }
                ],
                order: [['chit_date', 'ASC']]
            });

            if (latestChit) {
                const chitJson = latestChit.toJSON();
                const hasInterest = chitJson.interests && chitJson.interests.length > 0;
                const showingInterestVal = hasInterest ? chitJson.interests[0].showing_interest : 0;
                delete chitJson.interests;

                latest_upcoming_chit = {
                    ...chitJson,
                    showing_interest: showingInterestVal
                };
            }
        } catch (chitErr) {
            console.error('Error fetching latest_upcoming_chit in getHomeRecordService:', chitErr);
            // Non-blocking: keep latest_upcoming_chit as null
        }

        const responseData = {
            id: enrollment.id,
            group_id: enrollment.group_id,
            subscriber_id: enrollment.subscriber_id,
            group_name: group ? group.group_name : null,
            chit_amount: group ? (parseFloat(group.chit_amount) || 0) : null,
            upcoming_instalment_id: upcomingInstallment ? upcomingInstallment.id : null,
            enrollment_id: enrollment.id,
            next_due_date: upcomingInstallment ? upcomingInstallment.due_date : null,
            payable_amount: upcomingInstallment ? (parseFloat(upcomingInstallment.payable_amount) || 0) : 0,
            ...(upcomingInstallment && {
                createdAt: upcomingInstallment.createdAt,
                updatedAt: upcomingInstallment.updatedAt
            }),
            upcoming_auction,
            latest_upcoming_chit
        };

        return successResponse(res, statusCodes.OK, 'Latest home record and upcoming installment retrieved successfully', responseData);
    } catch (error) {
        console.error('Error in getHomeRecordService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getAllHomeRecordsService = async (res, userPayload, type = 0, min = 0, max = 10) => {
    const subscriber_id = userPayload ? userPayload.id : null;
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
                attributes: ['id', 'group_name', 'chit_amount', 'no_of_installments', 'scheme_configuration_id']
            });

            let schemeType = null;
            if (group && group.scheme_configuration_id) {
                const scheme = await FixedSchemeChitsConfiguration.findByPk(group.scheme_configuration_id, {
                    attributes: ['scheme_type']
                });
                if (scheme) schemeType = scheme.scheme_type;
            }

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

            const totalAuctionsCount = await Auction.count({
                where: { group_id: enrollment.group_id }
            });

            let completed_percentage = 0;
            if (group && group.no_of_installments) {
                completed_percentage = Math.round((totalAuctionsCount / group.no_of_installments) * 100);
            }

            return {
                id: enrollment.id,
                group_id: enrollment.group_id,
                subscriber_id: enrollment.subscriber_id,
                group_name: group ? group.group_name : null,
                chit_amount: group ? (parseFloat(group.chit_amount) || 0) : null,
                no_of_installments: group ? group.no_of_installments : null,
                scheme_type: schemeType,
                completed_installments_count: totalAuctionsCount,
                completed_percentage,
                positions_occupied_count: occupiedCount,
                upcoming_instalment_id: upcomingInstallment ? upcomingInstallment.id : null,
                enrollment_id: enrollment.id,
                next_due_date: upcomingInstallment ? upcomingInstallment.due_date : null,
                payable_amount: upcomingInstallment ? (parseFloat(upcomingInstallment.payable_amount) || 0) : 0,
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

        // Fetch all unpaid installments for these enrollments (no due_date filter yet)
        const allUnpaidInstallments = await ChitsInstallment.findAll({
            where: {
                enrollment_id: { [Op.in]: enrollmentIds },
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

        // Filter in-memory based on simulated time relative to each group
        const unpaidInstallments = allUnpaidInstallments.filter(inst => {
            const group = inst.enrollment?.group;
            const simulatedNow = getSimulatedNow(group);

            // Calculate the end of the simulated current month
            const endOfSimulatedMonthStr = new Date(simulatedNow.getFullYear(), simulatedNow.getMonth() + 1, 0, 23, 59, 59, 999).toISOString().split('T')[0];

            return inst.due_date <= endOfSimulatedMonthStr;
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

            // Calculate dynamic over_due_days_count based on simulated date
            const simulatedNow = getSimulatedNow(group);
            simulatedNow.setHours(0, 0, 0, 0);
            const dueDate = new Date(installment.due_date);
            dueDate.setHours(0, 0, 0, 0);

            let overDueDaysCount = 0;
            if (dueDate < simulatedNow) {
                const diffTime = simulatedNow.getTime() - dueDate.getTime();
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
                ? `${displayPercentage}% per day x ${overDueDaysCount} days`
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
            let badgeLabel = 0;
            let timingLabel = '';

            const groupStatus = Number(group.chits_group_status); // 0 - Not started, 1 - started, 2 - completed
            const typeInt = Number(type);

            // Define simulated today outside the inner block so it can be used for is_today property
            const simulatedNow = getSimulatedNow(group);
            const simulatedTodayStr = simulatedNow.toISOString().split('T')[0];

            if (typeInt === 1) {
                if (groupStatus === 1) {
                    isMatch = true;
                    const isAuctionToday = group.auction_date === simulatedTodayStr;
                    badgeLabel = 1;
                    timingLabel = isAuctionToday ? 'Today' : (group.auction_date ? formatDateToOrdinal(group.auction_date) : 'Today');
                }
            } else if (typeInt === 2) {
                if (groupStatus === 0) {
                    isMatch = true;
                    badgeLabel = 2;
                    timingLabel = group.auction_date ? formatDateToOrdinal(group.auction_date) : 'Soon';
                }
            } else if (typeInt === 3) {
                if (groupStatus === 2) {
                    isMatch = true;
                    badgeLabel = 3;
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
                    auction_date: group.auction_date,
                    is_today: group.auction_date === simulatedTodayStr
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

const { getSchemeWinningAmount, getSchemeOriginalAmount } = require('../utils/schemeHelpers');

const getBidDetailsService = async (res, group_id) => {
    try {
        const group = await ChitsGroup.findByPk(group_id);
        if (!group) {
            return errorResponse(res, statusCodes.NOT_FOUND, 'Chit group not found');
        }

        const schemeConfig = group.scheme_configuration_id
            ? await FixedSchemeChitsConfiguration.findByPk(group.scheme_configuration_id)
            : null;

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

        const rawBidAmount = latestAuction ? (parseFloat(latestAuction.bid_amount) || 0.00) : 0.00;
        const bidWinningAmount = latestAuction
            ? (getSchemeWinningAmount(schemeConfig, latestAuction.auction_number) ?? rawBidAmount)
            : 0.00;

        // Status label mapping: 0 = Upcoming, 1 = Live Now, 2 = Completed
        const groupStatus = Number(group.chits_group_status);

        const responseData = {
            bid_winning_amount: bidWinningAmount,
            chit_group_details: {
                group_id: group.id,
                group_name: group.group_name || 'Unknown Chit',
                total_amount: parseFloat(group.chit_amount) || 0.00,
                total_installments: totalInstallments,
                members_count: membersCount,
                current_month: currentMonthFormatted,
                badge_label: groupStatus
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

        const schemeConfig = group.scheme_configuration_id
            ? await FixedSchemeChitsConfiguration.findByPk(group.scheme_configuration_id)
            : null;

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
                },
                {
                    model: Member,
                    as: 'collection_agent',
                    attributes: ['id', 'name']
                },
                {
                    model: Member,
                    as: 'subscriber',
                    attributes: ['id', 'name', 'member_id']
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

        // 3. Resolve Business Agent and Collection Agent Names
        let agentName = 'N/A';
        if (userEnrollments[0].business_agent && userEnrollments[0].business_agent.name) {
            agentName = userEnrollments[0].business_agent.name;
        }

        let collectionAgentName = 'N/A';
        if (userEnrollments[0].collection_agent && userEnrollments[0].collection_agent.name) {
            collectionAgentName = userEnrollments[0].collection_agent.name;
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

        const paidInstallments = await ChitsInstallment.findAll({
            where: {
                enrollment_id: { [Op.in]: enrollmentIds },
                id: {
                    [Op.in]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`)
                }
            }
        });
        const totalPaidAmount = paidInstallments.reduce((sum, inst) => sum + (parseFloat(inst.payable_amount) || 0), 0);

        let nextPaymentDue = null;
        if (upcomingInstallment) {
            const dueAmount = parseFloat(upcomingInstallment.payable_amount) || 0.00;
            const grossAmount = parseFloat(group.installment_amount) || 0.00;

            // To do penalty logic, we need to know if the user is a winner in this group
            const wonAuctions = await Auction.findAll({
                where: {
                    group_id,
                    bidder_id: subscriber_id
                }
            });
            const isWinner = wonAuctions.length > 0;

            const penaltyRate = isWinner
                ? (parseFloat(group.penality_for_ps) || 0.00)
                : (parseFloat(group.penality_for_nps) || 0.00);

            const simulatedNow = getSimulatedNow(group);
            simulatedNow.setHours(0, 0, 0, 0);
            const dueDate = new Date(upcomingInstallment.due_date);
            dueDate.setHours(0, 0, 0, 0);

            let overDueDaysCount = 0;
            if (dueDate < simulatedNow) {
                const diffTime = simulatedNow.getTime() - dueDate.getTime();
                overDueDaysCount = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            }
            const isOverdue = overDueDaysCount > 0;

            let penaltyAmountPerDay = 0.00;
            let displayPercentage = 2.0;

            if (penaltyRate > 0) {
                if (penaltyRate <= 20) {
                    displayPercentage = penaltyRate;
                    penaltyAmountPerDay = (penaltyRate / 100) * dueAmount;
                } else {
                    penaltyAmountPerDay = penaltyRate;
                    displayPercentage = dueAmount > 0 ? parseFloat(((penaltyAmountPerDay / dueAmount) * 100).toFixed(1)) : 2.0;
                }
            } else {
                displayPercentage = 2.0;
                penaltyAmountPerDay = 0.02 * dueAmount;
            }

            const penaltyAmount = isOverdue
                ? parseFloat((overDueDaysCount * penaltyAmountPerDay).toFixed(2))
                : 0.00;

            const penaltyText = isOverdue
                ? `${displayPercentage}% per day x ${overDueDaysCount} days`
                : null;

            const finalPayableAmount = parseFloat((dueAmount + penaltyAmount).toFixed(2));
            const days_left = !isOverdue ? Math.ceil((dueDate.getTime() - simulatedNow.getTime()) / (1000 * 60 * 60 * 24)) : 0;

            nextPaymentDue = {
                installment_no: upcomingInstallment.installment_no,
                due_date: upcomingInstallment.due_date,
                due_date_formatted: formatDateToOrdinal(upcomingInstallment.due_date),
                due_amount: dueAmount,
                gross_installment_amount: grossAmount,
                penalty_amount: penaltyAmount,
                over_due_days_count: overDueDaysCount,
                penalty_text: penaltyText,
                final_payable_amount: finalPayableAmount,
                is_overdue: isOverdue,
                days_left: days_left,
                days_left_text: `${days_left} days left`,
                paid_amount: 0.00 // Adjust if partial payments logic is added
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

        const userInstallmentIds = allUserInstallments.map(i => i.id);
        const userPayments = await CustomerPayment.findAll({
            where: {
                chits_installment_id: { [Op.in]: userInstallmentIds },
                payment_status: 1
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
            const originalAmountVal = getSchemeOriginalAmount(schemeConfig, auction);
            let profitAmountVal = 0.00;

            // Calculate profit primarily from auction dividend if available
            if (auction.dividend && parseFloat(auction.dividend) > 0) {
                const divVal = parseFloat(auction.dividend);
                if (divVal < originalAmountVal) {
                    profitAmountVal = divVal;
                } else {
                    profitAmountVal = divVal / (totalMembersCount || 20);
                }
            } else {
                const matchingInstallment = allUserInstallments.find(inst => inst.installment_no === auction.auction_number);
                if (matchingInstallment) {
                    const payableVal = parseFloat(matchingInstallment.payable_amount) || 0.00;
                    profitAmountVal = originalAmountVal - payableVal;
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
            let totalPaidAmountForAuction = 0.00;

            for (const ge of userEnrollments) {
                const memberOriginal = originalAmountVal;
                let memberPayable = memberOriginal;
                let memberProfit = 0.00;
                let memberPaidAmount = 0.00;

                const geInstallment = allInstallmentsForAuction.find(inst => inst.enrollment_id === ge.id);
                if (geInstallment) {
                    const gePayment = userPayments.find(p => p.chits_installment_id === geInstallment.id);
                    if (gePayment) {
                        memberPaidAmount = parseFloat(gePayment.received_amount) || 0.00;
                    }
                }

                // Use calculated profitAmountVal to guarantee accuracy even if DB installments aren't fully updated yet
                memberProfit = profitAmountVal;
                memberPayable = memberOriginal - memberProfit;

                totalOriginal += memberOriginal;
                totalProfit += memberProfit;
                totalPayable += memberPayable;
                totalPaidAmountForAuction += memberPaidAmount;

                memberBreakdown.push({
                    position_label: `Member #${ge.group_position_number}`,
                    name: ge.subscriber ? ge.subscriber.name : 'Unknown Subscriber',
                    payable_amount: parseFloat(memberPayable.toFixed(2)),
                    profit_amount: parseFloat(memberProfit.toFixed(2)),
                    original_amount: parseFloat(memberOriginal.toFixed(2)),
                    paid_amount: parseFloat(memberPaidAmount.toFixed(2))
                });
            }

            const rawBidAmount = parseFloat(auction.bid_amount) || 0.00;
            const bidWinningAmount = getSchemeWinningAmount(schemeConfig, auction.auction_number) ?? rawBidAmount;
            const isWinnerStatus = auction.bidder_id === subscriber_id;

            monthlyActivity.push({
                id: auction.id,
                auction_number: auction.auction_number,
                month_name: monthName,
                auction_date_formatted: auctionDateFormatted,
                bid_winning_amount: parseFloat(bidWinningAmount.toFixed(2)),
                winner_name: auction.bidder ? auction.bidder.name : 'N/A',
                winner_member_id: winnerTicketFormatted,
                is_winner_status: isWinnerStatus,
                payable_amount: parseFloat(payableAmountVal.toFixed(2)),
                profit_amount: parseFloat(profitAmountVal.toFixed(2)),
                original_amount: parseFloat(originalAmountVal.toFixed(2)),
                paid_amount: parseFloat(totalPaidAmountForAuction.toFixed(2)),
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
                collection_agent_name: collectionAgentName,
                business_agent_name: agentName,
                total_members: `${totalMembersCount} Members`
            },
            my_chit_overview: {
                monthly_bid_amount: parseFloat(group.installment_amount) || (parseFloat(group.chit_amount) / parseFloat(group.no_of_installments)) || 0.00,
                total_paid_amount: parseFloat(totalPaidAmount.toFixed(2)),
                next_payment_due: nextPaymentDue
            },
            scheme: schemeConfig ? {
                ...schemeConfig.toJSON(),
                prices: typeof schemeConfig.prices === 'string' ? JSON.parse(schemeConfig.prices) : schemeConfig.prices
            } : null,
            monthly_activity: monthlyActivity
        };

        return successResponse(res, statusCodes.OK, 'Chit details retrieved successfully', responsePayload);
    } catch (error) {
        console.error('Error in getChitDetailsService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getCollectionAgentDashboardService = async (res, collection_agent_id, from_date, to_date) => {
    try {
        const enrollments = await Enrollment.findAll({
            where: {
                collection_agent_id,
                delete_status: 0
            }
        });

        if (!enrollments || enrollments.length === 0) {
            return successResponse(res, statusCodes.OK, 'Collection agent dashboard details retrieved successfully', {
                total_pending_collection: 0,
                from_members_count: 0,
                today_collection: 0,
                from_collection_group_count: 0,
                active_chit_groups: 0
            });
        }

        const enrollmentIds = enrollments.map(e => e.id);
        const uniqueMembers = new Set(enrollments.map(e => e.subscriber_id));
        const uniqueGroups = new Set(enrollments.map(e => e.group_id));

        const from_collection_group_count = uniqueGroups.size;

        const active_chit_groups = await ChitsGroup.count({
            where: {
                id: { [Op.in]: Array.from(uniqueGroups) },
                chits_group_status: 1,
                is_deleted_status: 0
            }
        });

        const pendingInstallments = await ChitsInstallment.findAll({
            where: {
                enrollment_id: { [Op.in]: enrollmentIds },
                id: {
                    [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`)
                }
            }
        });
        const pending_amount = pendingInstallments.reduce((sum, inst) => sum + (parseFloat(inst.payable_amount) || 0), 0);

        const pendingMembersSet = new Set();
        pendingInstallments.forEach(inst => {
            const e = enrollments.find(e => e.id === inst.enrollment_id);
            if (e) pendingMembersSet.add(e.subscriber_id);
        });

        const collectedInstallments = await CustomerPayment.findAll({
            where: { payment_status: 1 },
            include: [{
                model: ChitsInstallment,
                as: 'installment',
                where: { enrollment_id: { [Op.in]: enrollmentIds } }
            }]
        });

        const collectedMembersSet = new Set();
        collectedInstallments.forEach(payment => {
            const inst = payment.installment;
            if (inst) {
                const e = enrollments.find(e => e.id === inst.enrollment_id);
                if (e) collectedMembersSet.add(e.subscriber_id);
            }
        });

        let startOfPeriod, endOfPeriod;
        
        if (from_date && to_date) {
            startOfPeriod = new Date(from_date);
            startOfPeriod.setHours(0, 0, 0, 0);
            endOfPeriod = new Date(to_date);
            endOfPeriod.setHours(23, 59, 59, 999);
        } else {
            startOfPeriod = new Date();
            startOfPeriod.setHours(0, 0, 0, 0);
            endOfPeriod = new Date();
            endOfPeriod.setHours(23, 59, 59, 999);
        }

        const todayCollectionsList = collectedInstallments.filter(payment => {
            const d = new Date(payment.createdAt);
            return d >= startOfPeriod && d <= endOfPeriod;
        });
        const today_collection = todayCollectionsList.reduce((sum, payment) => sum + (parseFloat(payment.received_amount) || 0), 0);

        const activeGroupsLimit3 = await ChitsGroup.findAll({
            where: {
                id: { [Op.in]: Array.from(uniqueGroups) },
                chits_group_status: 1,
                is_deleted_status: 0
            },
            limit: 3,
            order: [['createdAt', 'DESC']]
        });

        const groupInstallments = await ChitsInstallment.findAll({
            where: { enrollment_id: { [Op.in]: enrollmentIds } }
        });

        const active_groups = activeGroupsLimit3.map(group => {
            const groupEnrollments = enrollments.filter(e => e.group_id === group.id);
            const groupEnrollmentIds = groupEnrollments.map(e => e.id);

            let pending_amount_group = 0;
            let pendingMembersSet_group = new Set();

            const installmentsForGroup = groupInstallments.filter(inst => groupEnrollmentIds.includes(inst.enrollment_id));
            let paidInstallmentCount = 0;

            installmentsForGroup.forEach(inst => {
                const payable = parseFloat(inst.payable_amount) || 0;
                const relatedPayments = collectedInstallments.filter(p => p.chits_installment_id === inst.id);
                const paidForInst = relatedPayments.reduce((s, p) => s + (parseFloat(p.received_amount) || 0), 0);
                const pending_inst = payable - paidForInst;

                if (pending_inst > 0) {
                    pending_amount_group += pending_inst;
                    const e = groupEnrollments.find(e => e.id === inst.enrollment_id);
                    if (e) pendingMembersSet_group.add(e.subscriber_id);
                }

                if (paidForInst >= payable && payable > 0) {
                    paidInstallmentCount++;
                }
            });

            const total_members = new Set(groupEnrollments.map(e => e.subscriber_id)).size;
            const pending_members = pendingMembersSet_group.size;

            const totalInstallments = installmentsForGroup.length;
            let completed_percentage = 0;
            if (totalInstallments > 0) {
                completed_percentage = ((paidInstallmentCount / totalInstallments) * 100).toFixed(0);
            }

            return {
                group_id: group.id,
                group_name: group.group_name,
                status: 'Active',
                chit_amount: parseFloat(group.chit_amount) || 0,
                pending_amount: pending_amount_group,
                pending_members,
                total_members,
                completed_percentage: parseInt(completed_percentage),
                date: (group.chit_end_date || group.maturity_date || group.term_date) ? new Date(group.chit_end_date || group.maturity_date || group.term_date).toISOString().split('T')[0] : null
            };
        });

        const dashboardData = {
            total_pending_collection: pending_amount,
            from_members_count: pendingMembersSet.size,
            today_collection,
            from_collection_group_count,
            active_chit_groups,
            active_groups
        };

        return successResponse(res, statusCodes.OK, 'Collection agent dashboard retrieved successfully', dashboardData);
    } catch (error) {
        console.error('Error in getCollectionAgentDashboardService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getCollectionAgentActiveGroupsService = async (res, collection_agent_id, min, max) => {
    try {
        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const enrollments = await Enrollment.findAll({
            where: { collection_agent_id, delete_status: 0 }
        });

        if (!enrollments || enrollments.length === 0) {
            return successResponse(res, statusCodes.OK, 'Active groups retrieved', { rows: [] });
        }

        const enrollmentIds = enrollments.map(e => e.id);
        const uniqueGroups = Array.from(new Set(enrollments.map(e => e.group_id)));

        const activeGroupsData = await ChitsGroup.findAndCountAll({
            where: {
                id: { [Op.in]: uniqueGroups },
                chits_group_status: 1, // Active
                is_deleted_status: 0
            },
            limit,
            offset,
            order: [['createdAt', 'DESC']]
        });

        const activeGroups = activeGroupsData.rows;
        const count = activeGroupsData.count;

        const activeGroupIds = activeGroups.map(g => g.id);

        const groupInstallments = await ChitsInstallment.findAll({
            where: { enrollment_id: { [Op.in]: enrollmentIds } }
        });

        const groupPayments = await CustomerPayment.findAll({
            where: { payment_status: 1 },
            include: [{
                model: ChitsInstallment,
                as: 'installment',
                where: { enrollment_id: { [Op.in]: enrollmentIds } }
            }]
        });

        const rows = activeGroups.map(group => {
            const groupEnrollments = enrollments.filter(e => e.group_id === group.id);
            const groupEnrollmentIds = groupEnrollments.map(e => e.id);

            let pending_amount = 0;
            let pendingMembersSet = new Set();

            const installmentsForGroup = groupInstallments.filter(inst => groupEnrollmentIds.includes(inst.enrollment_id));
            let paidInstallmentCount = 0;

            installmentsForGroup.forEach(inst => {
                const payable = parseFloat(inst.payable_amount) || 0;
                const relatedPayments = groupPayments.filter(p => p.chits_installment_id === inst.id);
                const paidForInst = relatedPayments.reduce((s, p) => s + (parseFloat(p.received_amount) || 0), 0);
                const pending = payable - paidForInst;

                if (pending > 0) {
                    pending_amount += pending;
                    const e = groupEnrollments.find(e => e.id === inst.enrollment_id);
                    if (e) pendingMembersSet.add(e.subscriber_id);
                }

                if (paidForInst >= payable && payable > 0) {
                    paidInstallmentCount++;
                }
            });

            const total_members = new Set(groupEnrollments.map(e => e.subscriber_id)).size;
            const pending_members = pendingMembersSet.size;

            const totalInstallments = installmentsForGroup.length;
            let completed_percentage = 0;
            if (totalInstallments > 0) {
                completed_percentage = ((paidInstallmentCount / totalInstallments) * 100).toFixed(0);
            }

            return {
                group_id: group.id,
                group_name: group.group_name,
                status: 'Active',
                chit_amount: parseFloat(group.chit_amount) || 0,
                pending_amount,
                pending_members,
                total_members,
                completed_percentage: parseInt(completed_percentage),
                date: (group.chit_end_date || group.maturity_date || group.term_date) ? new Date(group.chit_end_date || group.maturity_date || group.term_date).toISOString().split('T')[0] : null
            };
        });

        return successResponse(res, statusCodes.OK, 'Active groups retrieved', { count, rows });
    } catch (error) {
        console.error('Error in getCollectionAgentActiveGroupsService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getCollectionAgentGroupDashboardService = async (res, group_id) => {
    try {
        const group = await ChitsGroup.findByPk(group_id);
        if (!group) {
            return errorResponse(res, statusCodes.NOT_FOUND, 'Group not found');
        }

        const enrollments = await Enrollment.findAll({
            where: { group_id, delete_status: 0 },
            include: [{ model: Member, as: 'subscriber' }]
        });
        const enrollmentIds = enrollments.map(e => e.id);

        const allInstallments = await ChitsInstallment.findAll({
            where: { enrollment_id: { [Op.in]: enrollmentIds } }
        });

        const payments = await CustomerPayment.findAll({
            where: { payment_status: 1 },
            include: [{
                model: ChitsInstallment,
                as: 'installment',
                where: { enrollment_id: { [Op.in]: enrollmentIds } }
            }]
        });

        const total_collected = payments.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);

        let total_payable = 0;
        let total_pending = 0;
        let overdue_members_set = new Set();
        const memberMap = {};

        const simulatedNow = getSimulatedNow(group);
        allInstallments.forEach(inst => {
            let thresholdDate = new Date(simulatedNow);
            if (inst.type === 2) {
                thresholdDate.setDate(thresholdDate.getDate() + 7);
            } else if (inst.type === 3) {
                thresholdDate.setDate(thresholdDate.getDate() + 1);
            } else {
                thresholdDate.setMonth(thresholdDate.getMonth() + 1);
            }
            // Add a small 1 day buffer for timezone edge cases
            thresholdDate.setDate(thresholdDate.getDate() + 1);

            if (new Date(inst.due_date) > thresholdDate) return;

            const payable = parseFloat(inst.payable_amount) || 0;
            total_payable += payable;
            const relatedPayments = payments.filter(p => p.chits_installment_id === inst.id);
            const paidForInst = relatedPayments.reduce((s, p) => s + (parseFloat(p.received_amount) || 0), 0);
            const pending = payable - paidForInst;

            if (pending > 0) {
                total_pending += pending;
                const e = enrollments.find(e => e.id === inst.enrollment_id);

                if (e) {
                    const sub = e.subscriber;
                    if (sub) {
                        if (!memberMap[sub.id]) {
                            memberMap[sub.id] = {
                                id: sub.id,
                                member_name: sub.name,
                                member_id: sub.member_id,
                                profile_image: sub.upload_image,
                                gender: sub.gender,
                                pending_months: 0,
                                oldest_due_date: inst.due_date,
                                balance: 0,
                                penalty_amount: 0,
                                penalty_text: ""
                            };
                        }

                        memberMap[sub.id].pending_months += 1;
                        memberMap[sub.id].balance += pending;
                        memberMap[sub.id].penalty_amount += (parseFloat(inst.penalty_amount) || 0);
                        memberMap[sub.id].penalty_text = `Penalty - ₹ ${memberMap[sub.id].penalty_amount}`;

                        if (new Date(inst.due_date) < new Date(memberMap[sub.id].oldest_due_date)) {
                            memberMap[sub.id].oldest_due_date = inst.due_date;
                        }
                    }
                }

                if (new Date(inst.due_date) < simulatedNow) {
                    if (e) overdue_members_set.add(e.subscriber_id);
                }
            }
        });

        const percentage = total_payable > 0 ? ((total_collected / total_payable) * 100).toFixed(2) : 0;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let pending_members_list = Object.values(memberMap);
        pending_members_list.sort((a, b) => new Date(a.oldest_due_date) - new Date(b.oldest_due_date));
        pending_members_list = pending_members_list.slice(0, 3);
        pending_members_list = pending_members_list.map(row => {
            const d = new Date(row.oldest_due_date);
            row.oldest_due = `${months[d.getMonth()]} ${d.getFullYear()}`;
            delete row.oldest_due_date;
            return row;
        });

        return successResponse(res, statusCodes.OK, 'Group dashboard', {
            today_group_value_price: parseFloat(group.chit_amount) || 0,
            total_collected,
            pending_amount: total_pending,
            overdue_members: overdue_members_set.size,
            overall_collection_process_percentage: parseFloat(percentage),
            current_date: new Date().toISOString().split('T')[0],
            pending_members: pending_members_list
        });
    } catch (error) {
        console.error('Error:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getPendingMembersService = async (res, collection_agent_id, min, max) => {
    try {
        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const enrollments = await Enrollment.findAll({
            where: { collection_agent_id, delete_status: 0 },
            include: [
                { model: Member, as: 'subscriber' },
                { model: ChitsGroup, as: 'group' }
            ]
        });

        const enrollmentIds = enrollments.map(e => e.id);
        const unpaidInstallments = await ChitsInstallment.findAll({
            where: {
                enrollment_id: { [Op.in]: enrollmentIds },
                payable_amount: { [Op.gt]: 0 },
                id: {
                    [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`)
                }
            }
        });

        const memberMap = {};
        unpaidInstallments.forEach(inst => {
            const e = enrollments.find(e => e.id === inst.enrollment_id);
            if (!e) return;
            const sub = e.subscriber;
            if (!sub) return;

            if (!memberMap[sub.id]) {
                memberMap[sub.id] = {
                    id: sub.id,
                    member_name: sub.name,
                    member_id: sub.member_id,
                    profile_image: sub.upload_image,
                    gender: sub.gender,
                    pending_months: 0,
                    oldest_due_date: inst.due_date,
                    oldest_due_date: inst.due_date,
                    balance: 0,
                    penalty_amount: 0,
                    penalty_text: ""
                };
            }

            memberMap[sub.id].pending_months += 1;
            memberMap[sub.id].balance += (parseFloat(inst.payable_amount) || 0);

            // Use installment's penalty amount
            memberMap[sub.id].penalty_amount += (parseFloat(inst.penalty_amount) || 0);
            memberMap[sub.id].penalty_text = `Penalty - ₹ ${memberMap[sub.id].penalty_amount}`;

            if (new Date(inst.due_date) < new Date(memberMap[sub.id].oldest_due_date)) {
                memberMap[sub.id].oldest_due_date = inst.due_date;
            }
        });

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        let rows = Object.values(memberMap);

        // Sort rows (optional, but good for consistent pagination)
        rows.sort((a, b) => new Date(a.oldest_due_date) - new Date(b.oldest_due_date));

        const count = rows.length;
        rows = rows.slice(offset, offset + limit);

        // Format dates after sorting
        rows = rows.map(row => {
            const d = new Date(row.oldest_due_date);
            row.oldest_due = `${months[d.getMonth()]} ${d.getFullYear()}`;
            delete row.oldest_due_date;
            return row;
        });

        return successResponse(res, statusCodes.OK, 'Pending members', { count, rows });
    } catch (error) {
        console.error('Error:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getMemberDuesService = async (res, member_id, userPayload) => {
    try {
        if (userPayload) {
            if (userPayload.role === 'member') {
                if (String(userPayload.id) !== String(member_id)) {
                    // If accessing someone else's dues, verify they are a collection agent assigned to this member
                    const isAssigned = await Enrollment.findOne({
                        where: {
                            subscriber_id: member_id,
                            collection_agent_id: userPayload.id,
                            delete_status: 0
                        }
                    });
                    if (!isAssigned) {
                        return errorResponse(res, 403, 'You are not authorized to view this member\'s dues');
                    }
                }
            }
        }
        const member = await Member.findByPk(member_id);
        if (!member) return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');

        const enrollments = await Enrollment.findAll({
            where: { subscriber_id: member_id, delete_status: 0 },
            include: [{ model: ChitsGroup, as: 'group' }]
        });

        let total_due = 0;
        let total_paid = 0;
        let balance = 0;
        let penalty_amount = 0;
        let oldest_due = null;
        let penalty_text = 'No penalty';
        let group_names = enrollments.map(e => e.group ? e.group.group_name : '').join(', ');

        const wonAuctions = await Auction.findAll({
            where: { bidder_id: member_id },
            attributes: ['group_id']
        });
        const wonGroupIds = new Set(wonAuctions.map(a => a.group_id));

        const enrollmentIds = enrollments.map(e => e.id);
        const installments = await ChitsInstallment.findAll({
            where: { enrollment_id: { [Op.in]: enrollmentIds } }
        });

        const payments = await CustomerPayment.findAll({
            where: { payment_status: 1 },
            include: [{
                model: ChitsInstallment,
                as: 'installment',
                where: { enrollment_id: { [Op.in]: enrollmentIds } }
            }]
        });

        let oldest_installment = null;
        let oldest_due_date_obj = null;

        installments.forEach(inst => {
            const payable = parseFloat(inst.payable_amount) || 0;
            total_due += payable;
            const relatedPayments = payments.filter(p => p.chits_installment_id === inst.id);
            const paid = relatedPayments.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);
            total_paid += paid;

            const pending = payable - paid;
            if (pending > 0) {
                const instDate = new Date(inst.due_date);
                if (!oldest_due_date_obj || instDate < oldest_due_date_obj) {
                    oldest_due_date_obj = instDate;
                    oldest_due = inst.due_date;
                    oldest_installment = { inst, pending };
                }
            }
        });

        if (oldest_installment) {
            const { inst, pending } = oldest_installment;
            const e = enrollments.find(en => en.id === inst.enrollment_id);
            const group = e ? e.group : null;

            const simulatedNow = getSimulatedNow(group);
            simulatedNow.setHours(0, 0, 0, 0);
            const dueDate = new Date(inst.due_date);
            dueDate.setHours(0, 0, 0, 0);

            let overDueDaysCount = 0;
            if (dueDate < simulatedNow) {
                const diffTime = simulatedNow.getTime() - dueDate.getTime();
                overDueDaysCount = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            }

            if (overDueDaysCount > 0) {
                const isWinner = group ? wonGroupIds.has(group.id) : false;
                const penaltyRate = isWinner
                    ? (group ? parseFloat(group.penality_for_ps) || 0.00 : 0.00)
                    : (group ? parseFloat(group.penality_for_nps) || 0.00 : 0.00);

                let penaltyAmountPerDay = 0.00;
                let displayPercentage = 2.0;

                const dueAmount = pending; // calculate penalty on pending amount
                if (penaltyRate > 0) {
                    if (penaltyRate <= 20) {
                        displayPercentage = penaltyRate;
                        penaltyAmountPerDay = (penaltyRate / 100) * dueAmount;
                    } else {
                        penaltyAmountPerDay = penaltyRate;
                        displayPercentage = dueAmount > 0 ? parseFloat(((penaltyAmountPerDay / dueAmount) * 100).toFixed(1)) : 2.0;
                    }
                } else {
                    displayPercentage = 2.0;
                    penaltyAmountPerDay = 0.02 * dueAmount;
                }

                penalty_amount = parseFloat((overDueDaysCount * penaltyAmountPerDay).toFixed(2));
                penalty_text = `Penalty ${displayPercentage}% per day × ${overDueDaysCount} days ₹ ${penalty_amount}`;
            }
        }

        balance = total_due - total_paid;

        return successResponse(res, statusCodes.OK, 'Member dues', {
            id: member.id,
            name: member.name,
            member_id: member.member_id,
            gender: member.gender,
            group_name: group_names,
            total_due,
            total_paid,
            balance,
            penalty_amount,
            penalty_text,
            older_due_months: oldest_due
        });
    } catch (error) {
        console.error('Error:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getSubmissionsService = async (res, collection_agent_id, type, min, max) => {
    try {
        const whereClause = { collection_agent_id };
        // 1 - all, 2 - pending, 3 - verified, 4 - rejected
        if (type === 2) whereClause.status = { [Op.in]: [0, 1] }; // pending
        if (type === 3) whereClause.status = 2; // verified
        if (type === 4) whereClause.status = 3; // rejected

        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const submissionsData = await CollectionAgentAmount.findAndCountAll({
            where: whereClause,
            include: [
                { model: Member, as: 'member' },
                { model: Member, as: 'collection_agent' }
            ],
            limit,
            offset,
            order: [['createdAt', 'DESC']]
        });

        const submissions = submissionsData.rows;
        const count = submissionsData.count;

        // Get group names for each member
        const memberIds = submissions.map(s => s.member_id).filter(id => id);
        const enrollments = await Enrollment.findAll({
            where: { subscriber_id: { [Op.in]: memberIds }, delete_status: 0 },
            include: [{ model: ChitsGroup, as: 'group' }]
        });

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const formatDate = (date) => {
            if (!date) return '';
            const d = new Date(date);
            return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        };

        const getPaymentMethod = (type) => {
            switch (type) {
                case 1: return 'Cash';
                case 2: return 'UPI';
                case 3: return 'Cheque';
                case 4: return 'Bank';
                default: return 'Others';
            }
        };

        const getStatusStr = (status) => {
            switch (status) {
                case 0: return 'Pending';
                case 1: return 'Pending';
                case 2: return 'Verified';
                case 3: return 'Rejected';
                default: return 'Unknown';
            }
        };

        const formatted = submissions.map(sub => {
            let amount = 0;
            if (sub.cash && sub.cash.amount) {
                amount = sub.cash.amount;
            } else if (sub.bank_details && sub.bank_details.amount) {
                amount = sub.bank_details.amount;
            }

            const memberEnrollments = enrollments.filter(e => e.subscriber_id === sub.member_id);
            const groupNames = memberEnrollments.map(e => e.group ? e.group.group_name : '').join(', ');

            const statusStr = getStatusStr(sub.status);
            let status_note = `Submitted on ${formatDate(sub.createdAt)}`;
            if (sub.status === 2 && sub.confirm_date) {
                status_note = `Verified on ${formatDate(sub.confirm_date)}`;
            } else if (sub.status === 3 && sub.confirm_date) {
                status_note = `Rejected on ${formatDate(sub.confirm_date)}`;
            }

            let collection_id_value = 'Unknown';
            if (sub.collection_agent && sub.collection_agent.other_info_user_code) {
                collection_id_value = sub.collection_agent.other_info_user_code.toString();
            } else if (sub.collection_agent_id) {
                collection_id_value = sub.collection_agent_id.toString();
            }

            return {
                id: sub.id,
                member_name: sub.member ? sub.member.name : 'Unknown',
                profile_image: sub.member ? sub.member.upload_image : '',
                group_name: groupNames || 'No Group',
                amount,
                method: getPaymentMethod(sub.payment_type),
                date: formatDate(sub.createdAt),
                collection_id: collection_id_value,
                status: statusStr,
                status_note,
                denominations: sub.cash?.denominations || null,
                transaction_ref: sub.transaction_id || sub.cheque_number || null
            };
        });

        return successResponse(res, statusCodes.OK, 'Submissions retrieved successfully', { count, rows: formatted });
    } catch (error) {
        console.error('Error:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const submitCollectionPaymentService = async (res, payload, userPayload) => {
    const transaction = await sequelize.transaction();
    try {
        const { member_id, payment_type, amount, cash, transaction_id, cheque_number, bank_details, other_details } = payload;

        const collection_agent_id = userPayload ? userPayload.id : payload.collection_agent_id;

        // Create CollectionAgentAmount (status 0: Pending)
        const submission = await CollectionAgentAmount.create({
            collection_agent_id,
            member_id,
            payment_type,
            cash,
            transaction_id,
            cheque_number,
            bank_details,
            other_details,
            status: 0
        }, { transaction });

        // Clearance Logic
        // Find all unpaid installments for this member
        const enrollments = await Enrollment.findAll({
            where: { subscriber_id: member_id, delete_status: 0 },
            include: [{ model: ChitsGroup, as: 'group' }]
        });

        const enrollmentIds = enrollments.map(e => e.id);
        const installments = await ChitsInstallment.findAll({
            where: { enrollment_id: { [Op.in]: enrollmentIds } },
            order: [['due_date', 'ASC']] // Oldest first
        });

        const allPayments = await CustomerPayment.findAll({
            include: [{
                model: ChitsInstallment,
                as: 'installment',
                where: { enrollment_id: { [Op.in]: enrollmentIds } }
            }]
            // We only care about verified payments (status = 1) and maybe pending (status = 0) 
            // If there are pending payments, they should be considered "paid" for clearance logic?
            // Yes, otherwise we might double-charge.
        });

        let remaining_amount = parseFloat(amount);

        for (const inst of installments) {
            if (remaining_amount <= 0) break;

            const payable = parseFloat(inst.payable_amount) || 0;

            const relatedPayments = allPayments.filter(p => p.chits_installment_id === inst.id && p.payment_status !== 2); // excluding rejected/due date
            const paid = relatedPayments.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);
            const penaltyAlreadyPaid = relatedPayments.reduce((sum, p) => sum + (parseFloat(p.penalty_paid) || 0), 0);

            let pending_installment = payable - paid;

            let pending_penalty = 0;
            const group = enrollments.find(e => e.id === inst.enrollment_id)?.group;
            const simulatedNow = getSimulatedNow(group);
            if (pending_installment > 0 && new Date(inst.due_date) < simulatedNow) {
                const expected_penalty = parseFloat(inst.penalty_amount) || 0;
                pending_penalty = Math.max(0, expected_penalty - penaltyAlreadyPaid);
            }

            if (pending_installment > 0 || pending_penalty > 0) {
                let payment_for_this_inst = 0;
                let penalty_for_this_inst = 0;

                // Pay penalty first
                if (pending_penalty > 0 && remaining_amount > 0) {
                    penalty_for_this_inst = Math.min(pending_penalty, remaining_amount);
                    remaining_amount -= penalty_for_this_inst;
                }

                // Pay installment
                if (pending_installment > 0 && remaining_amount > 0) {
                    payment_for_this_inst = Math.min(pending_installment, remaining_amount);
                    remaining_amount -= payment_for_this_inst;
                }

                if (payment_for_this_inst > 0 || penalty_for_this_inst > 0) {
                    await CustomerPayment.create({
                        chits_installment_id: inst.id,
                        received_amount: payment_for_this_inst,
                        penalty_paid: penalty_for_this_inst,
                        payment_status: 0, // Pending Admin Approval
                        collection_agent_amount_id: submission.id,
                        payment_date: submission.paid_date || null,
                        payment_mode: submission.payment_type || null,
                        transaction_reference: submission.transaction_id || submission.cheque_number || null
                    }, { transaction });
                }
            }
        }

        await transaction.commit();
        return successResponse(res, statusCodes.OK, 'Payment submitted successfully', { submission_id: submission.id });
    } catch (error) {
        await transaction.rollback();
        console.error('Error in submitCollectionPaymentService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getAllGalleryService = async (res, reqBody) => {
    try {
        const { company_id, min = 0, max = 10 } = reqBody;
        const limit = parseInt(max, 10);
        const offset = parseInt(min, 10);

        const whereClause = { status: 0 }; // Only fetch active galleries for users
        if (company_id) whereClause.company_id = company_id;

        const galleries = await Gallery.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [['createdAt', 'DESC']]
        });

        return successResponse(res, statusCodes.OK, 'Galleries retrieved successfully', galleries);
    } catch (error) {
        console.error('Error in getAllGalleryService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};


const getPaymentHistoryService = async (res, userPayload, group_id, min = 0, max = 20) => {
    try {
        if (!userPayload) {
            return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');
        }
        const subscriber_id = userPayload.id;

        // Resolve member's enrollments
        const enrollmentWhere = { subscriber_id, delete_status: 0 };
        if (group_id) {
            enrollmentWhere.group_id = group_id;
        }

        const enrollments = await Enrollment.findAll({
            where: enrollmentWhere,
            attributes: ['id']
        });

        if (!enrollments || enrollments.length === 0) {
            return successResponse(res, statusCodes.OK, 'No payment history found', { count: 0, rows: [] });
        }
        const enrollmentIds = enrollments.map(e => e.id);

        const limit = parseInt(max, 10) || 20;
        const offset = parseInt(min, 10) || 0;

        const { count, rows } = await CustomerPayment.findAndCountAll({
            where: { payment_status: 1 },
            include: [
                {
                    model: ChitsInstallment,
                    as: 'installment',
                    required: true,
                    where: { enrollment_id: { [Op.in]: enrollmentIds } },
                    include: [
                        {
                            model: Enrollment,
                            as: 'enrollment',
                            required: true,
                            include: [
                                {
                                    model: ChitsGroup,
                                    as: 'group',
                                    attributes: ['id', 'group_name', 'chit_amount']
                                }
                            ]
                        }
                    ]
                }
            ],
            order: [
                ['payment_date', 'DESC'],
                ['createdAt', 'DESC']
            ],
            limit,
            offset
        });

        const formattedRows = rows.map(payment => {
            const inst = payment.installment;
            const group = inst.enrollment ? inst.enrollment.group : null;

            const received = parseFloat(payment.received_amount) || 0;
            const penalty = parseFloat(payment.penalty_paid) || 0;

            return {
                id: payment.id,
                receipt_number: payment.receipt_number,
                payment_date: payment.payment_date || null,
                group_id: group ? group.id : null,
                group_name: group ? group.group_name : 'Unknown',
                installment_no: inst ? inst.installment_no : null,
                received_amount: received.toFixed(2),
                penalty_paid: penalty.toFixed(2),
                total_paid: (received + penalty).toFixed(2),
                payment_mode: payment.payment_mode,
                transaction_reference: payment.transaction_reference
            };
        });

        return successResponse(res, statusCodes.OK, 'Payment history retrieved successfully', {
            count,
            rows: formattedRows
        });
    } catch (error) {
        console.error('Error in getPaymentHistoryService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getPaymentReceiptService = async (res, userPayload, payment_id) => {
    try {
        if (!userPayload) {
            return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');
        }
        const subscriber_id = userPayload.id;

        const payment = await CustomerPayment.findOne({
            where: { id: payment_id, payment_status: 1 },
            include: [
                {
                    model: ChitsInstallment,
                    as: 'installment',
                    required: true,
                    include: [
                        {
                            model: Enrollment,
                            as: 'enrollment',
                            required: true,
                            include: [
                                {
                                    model: Member,
                                    as: 'subscriber',
                                    attributes: ['id', 'name', 'member_id']
                                },
                                {
                                    model: ChitsGroup,
                                    as: 'group',
                                    include: [
                                        {
                                            model: Company,
                                            as: 'company',
                                            attributes: ['id', 'company_name', 'company_address']
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        if (!payment) {
            return errorResponse(res, statusCodes.NOT_FOUND, 'Receipt not found or not fully verified yet');
        }

        const inst = payment.installment;
        const enrollment = inst.enrollment;

        // Verify it belongs to this subscriber
        if (enrollment.subscriber_id !== subscriber_id) {
            return errorResponse(res, statusCodes.FORBIDDEN, 'You are not authorized to view this receipt');
        }

        const group = enrollment.group;
        const subscriber = enrollment.subscriber;
        const company = group ? group.company : null;

        const received = parseFloat(payment.received_amount) || 0;
        const penalty = parseFloat(payment.penalty_paid) || 0;

        const responseData = {
            id: payment.id,
            receipt_number: payment.receipt_number,
            payment_date: payment.payment_date || null,
            group_id: group ? group.id : null,
            group_name: group ? group.group_name : 'Unknown',
            chit_value: group ? group.chit_amount : null,
            subscriber_position: enrollment.group_position_number,
            installment_no: inst.installment_no,
            due_date: inst.due_date,
            received_amount: received.toFixed(2),
            penalty_paid: penalty.toFixed(2),
            total_paid: (received + penalty).toFixed(2),
            payment_mode: payment.payment_mode,
            transaction_reference: payment.transaction_reference,
            member_name: subscriber ? subscriber.name : 'Unknown',
            member_code: subscriber ? (subscriber.member_id || `#${subscriber.id}`) : null,
            company_name: company ? company.company_name : 'Bonagiri Chits',
            company_address: company ? company.company_address : ''
        };

        return successResponse(res, statusCodes.OK, 'Receipt retrieved successfully', responseData);
    } catch (error) {
        console.error('Error in getPaymentReceiptService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getMemberDocumentsService = async (res, userPayload, group_id, member_id) => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

        const docRecord = await MemberDocument.findOne({
            where: { group_id, member_id }
        });

        let documents = docRecord && docRecord.documents ? docRecord.documents : {};

        const types = ['aadhar', 'bank_id', 'upi_details', 'certificates'];
        const result = types.map(type => {
            const doc = documents[type] || { url: null, status: null };
            return {
                document_type: type,
                document_url: doc.url,
                status: doc.status
            };
        });

        return successResponse(res, statusCodes.OK, 'Member documents retrieved', { documents: result });
    } catch (error) {
        console.error('Error in getMemberDocumentsService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const uploadMemberDocumentService = async (res, req, userPayload) => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

        const { group_id, member_id, document_type } = req.body;

        if (!req.file) {
            return errorResponse(res, statusCodes.BAD_REQUEST, 'Document file is required');
        }

        const document_url = `/uploads/${req.file.filename}`;

        let docRecord = await MemberDocument.findOne({
            where: { group_id, member_id }
        });

        if (!docRecord) {
            docRecord = await MemberDocument.create({
                group_id,
                member_id,
                documents: {},
                uploaded_by: userPayload.id
            });
        }

        let documents = { ...docRecord.documents };
        documents[document_type] = { url: document_url, status: 0 };

        await docRecord.update({ documents, uploaded_by: userPayload.id });

        return successResponse(res, statusCodes.OK, 'Document uploaded successfully', {
            document_url,
            status: 0
        });
    } catch (error) {
        console.error('Error in uploadMemberDocumentService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const registerDeviceTokenService = async (res, userPayload, fcm_token) => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');
        await Member.update({ fcm_token }, { where: { id: userPayload.id } });
        return successResponse(res, statusCodes.OK, 'Device token registered successfully');
    } catch (error) {
        console.error('Error in registerDeviceTokenService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getNotificationHistoryService = async (res, userPayload, min = 0, max = 20) => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

        const limit = parseInt(max, 10) || 20;
        const offset = parseInt(min, 10) || 0;

        const { count, rows } = await NotificationHistory.findAndCountAll({
            where: { user_id: String(userPayload.id), user_type: 'MEMBER' },
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        return successResponse(res, statusCodes.OK, 'Notification history retrieved successfully', { count, rows });
    } catch (error) {
        console.error('Error in getNotificationHistoryService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const markNotificationReadService = async (res, userPayload, notification_id) => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

        const notification = await NotificationHistory.findOne({
            where: { id: notification_id, user_id: String(userPayload.id), user_type: 'MEMBER' }
        });

        if (!notification) {
            return errorResponse(res, statusCodes.NOT_FOUND, 'Notification not found');
        }

        await notification.update({ is_read: true });
        return successResponse(res, statusCodes.OK, 'Notification marked as read');
    } catch (error) {
        console.error('Error in markNotificationReadService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

module.exports = {
    getPaymentHistoryService,
    getPaymentReceiptService,
    getHomeRecordService,
    getAllHomeRecordsService,
    getUpcomingChitsService,
    submitChitInterestService,
    getPendingPaymentsService,
    getBidsService,
    getBidDetailsService,
    getChitDetailsService,
    getCollectionAgentDashboardService,
    getCollectionAgentActiveGroupsService,
    getCollectionAgentGroupDashboardService,
    getPendingMembersService,
    getMemberDuesService,
    getSubmissionsService,
    submitCollectionPaymentService,
    getAllGalleryService,
    registerDeviceTokenService,
    getNotificationHistoryService,
    markNotificationReadService,
    getMemberDocumentsService,
    uploadMemberDocumentService
};
