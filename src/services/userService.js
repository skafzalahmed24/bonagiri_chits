const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const {
    Country, State, District, City, StaticDropdownsList, StaticDropdownSubcategoryList,
    Member, Route, Area, ChitsGroup, Company, ChitsInstallment, Enrollment,
    UpcomingChit, UpcomingChitInterest, CustomerPayment, GroupUnderStaticList,
    Auction, CollectionAgentAmount, FixedSchemeChitsConfiguration,
    NotificationHistory, MemberDocument, CustomerVisit, Gallery, MemberReferral,
    ConfigureBusinessAgentCommission, HistoryBusinessAgent, ChitType, StaffUser,
    sequelize
} = require('../models');
const { Op } = require('sequelize');

const { getSimulatedNow } = require('../utils/timeSimulator');
const { isCollectionAgent, isBusinessAgent } = require('../utils/authHelpers');
const { calculateMemberRating } = require('../utils/ratingHelper');
const fcmService = require('./fcmService');

const getHomeRecordService = async (res, userPayload, reqSubscriberId = null) => {
    const subscriber_id = (userPayload && userPayload.id) ? userPayload.id : reqSubscriberId;
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

        // 4. Dynamic payload for upcoming auctions (matching logic from getBidsService type=2)
        const upcoming_auction = [];
        const allEnrollments = await Enrollment.findAll({
            where: {
                subscriber_id,
                delete_status: 0
            },
            include: [
                {
                    model: ChitsGroup,
                    as: 'group',
                    where: { is_deleted_status: 0, chits_group_status: 0 }
                }
            ]
        });

        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        for (const e of allEnrollments) {
            const g = e.group;
            if (g && g.auction_date) {
                const auctionDate = new Date(g.auction_date);
                if (!isNaN(auctionDate.getTime())) {
                    let timeStr = "10:00 AM";
                    if (g.auction_from) {
                        const [hours, minutes] = g.auction_from.split(':');
                        const h = parseInt(hours, 10);
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        const h12 = h % 12 || 12;
                        timeStr = `${h12.toString().padStart(2, '0')}:${minutes} ${ampm}`;
                    }

                    upcoming_auction.push({
                        date: auctionDate.getDate().toString(),
                        month_name: months[auctionDate.getMonth()],
                        time: timeStr,
                        current_bid_price: parseFloat(g.chit_amount || 0).toFixed(2)
                    });
                }
            }
        }

        // 5. Fetch the latest upcoming chit record (same logic as getUpcomingChitsService, limit 1)
        let latest_upcoming_chit = null;
        let member = null;
        try {
            member = await Member.findByPk(subscriber_id);
            const company_id = member ? member.company_id : null;

            const whereClause = { status: 1 };
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

        // 6. Calculate Member Star Rating (matching login response)
        let memberRating = null;
        try {
            if (subscriber_id) {
                memberRating = await calculateMemberRating(subscriber_id, member);
            }
        } catch (ratingErr) {
            console.error('Error calculating member rating in getHomeRecordService:', ratingErr);
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
            latest_upcoming_chit,
            rating: memberRating
        };

        return successResponse(res, statusCodes.OK, 'Latest home record and upcoming installment retrieved successfully', responseData);
    } catch (error) {
        console.error('Error in getHomeRecordService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const resolveChitGroupAuctionType = (group) => {
    if (!group) return 1;
    if (group.scheme_configuration_id) {
        return 2; // Fixed Chit
    }
    if (Number(group.auction_type) === 1 || Number(group.auction_type) === 2) {
        return Number(group.auction_type);
    }
    return 1; // Default to Open Auction (1) for legacy/unconfigured values like 35
};

const getAllHomeRecordsService = async (res, userPayload, type = 0, min = 0, max = 10, auction_type = null, reqSubscriberId = null) => {
    const subscriber_id = (userPayload && userPayload.id) ? userPayload.id : reqSubscriberId;
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
            return successResponse(res, statusCodes.OK, 'All home records retrieved successfully', {
                count: 0,
                rows: []
            });
        }

        const uniqueGroupIds = new Set();
        const uniqueEnrollments = enrollments.filter(e => {
            if (uniqueGroupIds.has(e.group_id)) return false;
            uniqueGroupIds.add(e.group_id);
            return true;
        });

        const resolvedData = await Promise.all(uniqueEnrollments.map(async (enrollment) => {
            const group = await ChitsGroup.findOne({
                where: { id: enrollment.group_id },
                attributes: ['id', 'group_name', 'chit_amount', 'no_of_installments', 'scheme_configuration_id', 'auction_type']
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

            const resolvedAuctionType = resolveChitGroupAuctionType(group);

            return {
                id: enrollment.id,
                group_id: enrollment.group_id,
                subscriber_id: enrollment.subscriber_id,
                group_name: group ? group.group_name : null,
                chit_amount: group ? (parseFloat(group.chit_amount) || 0) : null,
                no_of_installments: group ? group.no_of_installments : null,
                total_positions: group ? (group.no_of_installments || 0) : 0,
                auction_type: resolvedAuctionType,
                auction_type_label: resolvedAuctionType === 1 ? 'Open Auction' : (resolvedAuctionType === 2 ? 'Fixed Chit' : 'Standard'),
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

        // Apply Filter logic dynamically based on auction_type and group capacity
        let filteredData = resolvedData;

        if (auction_type !== undefined && auction_type !== null && auction_type !== '') {
            const auctionTypeNum = Number(auction_type);
            filteredData = filteredData.filter(item => Number(item.auction_type) === auctionTypeNum);
        }

        const typeInt = Number(type);
        if (typeInt === 1) { // Only fetch perfectly complete groups
            filteredData = filteredData.filter(item => item.positions_occupied_count >= item.total_positions);
        } else if (typeInt === 2) { // Fetch explicitly incomplete active groups
            filteredData = filteredData.filter(item => item.positions_occupied_count < item.total_positions);
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
            status: 1
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

            // Send notification to Admin ONLY (member does not get self-notification)
            const member = await Member.findByPk(user_id).catch(() => null);
            const companyId = chit.company_id || member?.company_id || userPayload?.company_id;
            const memberName = member?.name || member?.rep_by_first_name || 'Member';
            const memberPhone = member?.mobile_number || '';

            // Record in Admin Notification History
            if (companyId) {
                try {
                    await NotificationHistory.create({
                        user_id: String(companyId),
                        user_type: 'STAFF',
                        company_id: companyId,
                        title: 'Upcoming Chit Interest',
                        body: `Member ${memberName} registered interest in upcoming chit "${chit.group_name || 'Upcoming Chit'}".`,
                        data_payload: {
                            type: 'UPCOMING_CHIT_INTEREST',
                            upcoming_chit_id: String(upcoming_chit_id),
                            member_id: String(user_id),
                            member_name: memberName,
                            member_phone: memberPhone,
                            group_name: String(chit.group_name || '')
                        },
                        is_read: false
                    });
                    console.log(`[NOTIF] Created Admin Notification for upcoming chit interest (Company: ${companyId}, Member: ${memberName})`);
                } catch (adminNotifErr) {
                    console.error('[NOTIF] Failed to save Admin Notification for chit interest:', adminNotifErr.message);
                }
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
        const globalSimulatedNow = await getSimulatedNow();
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
        const groupIds = [...new Set(enrollments.map(e => e.group_id))];

        const allAuctions = await Auction.findAll({
            where: { group_id: { [Op.in]: groupIds } }
        });

        const schemeConfigIds = enrollments.map(e => e.group?.scheme_configuration_id).filter(Boolean);
        const schemeConfigs = schemeConfigIds.length > 0
            ? await FixedSchemeChitsConfiguration.findAll({ where: { id: { [Op.in]: schemeConfigIds } } })
            : [];

        const groupEnrollmentCounts = await Enrollment.findAll({
            where: { group_id: { [Op.in]: groupIds }, delete_status: 0 },
            attributes: ['group_id', [sequelize.fn('COUNT', sequelize.col('id')), 'total_count']],
            group: ['group_id']
        });
        const groupCountMap = {};
        groupEnrollmentCounts.forEach(ge => {
            groupCountMap[ge.group_id] = parseInt(ge.get('total_count'), 10) || 20;
        });

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
            const simulatedNow = new Date(globalSimulatedNow);

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
            const schemeConfig = group && group.scheme_configuration_id
                ? schemeConfigs.find(sc => sc.id === group.scheme_configuration_id)
                : null;
            const auction = allAuctions.find(a => a.group_id === group.id && a.auction_number === installment.installment_no);
            const totalMembersCount = (group && groupCountMap[group.id]) || parseInt(group?.no_of_installments, 10) || 20;

            const fallbackInstallment = parseFloat(group?.installment_amount) || (parseFloat(group?.chit_amount) / (parseInt(group?.no_of_installments, 10) || 12)) || parseFloat(installment.payable_amount) || 0.00;
            const originalAmount = (auction || schemeConfig ? getSchemeOriginalAmount(schemeConfig, auction) : fallbackInstallment) || fallbackInstallment;
            
            let profitAmount = 0.00;
            if (auction) {
                if (auction.dividend && parseFloat(auction.dividend) > 0) {
                    const divVal = parseFloat(auction.dividend);
                    profitAmount = divVal < originalAmount ? divVal : divVal / (totalMembersCount || 20);
                } else if (installment.payable_amount && parseFloat(installment.payable_amount) < originalAmount) {
                    const payableVal = parseFloat(installment.payable_amount) || 0.00;
                    profitAmount = Math.max(0, originalAmount - payableVal);
                }
            } else if (installment.payable_amount && parseFloat(installment.payable_amount) < originalAmount) {
                const payableVal = parseFloat(installment.payable_amount) || 0.00;
                profitAmount = Math.max(0, originalAmount - payableVal);
            }

            const netPayable = Math.max(0, originalAmount - profitAmount);
            const dueAmount = parseFloat((netPayable > 0 ? netPayable : (parseFloat(installment.payable_amount) || originalAmount)).toFixed(2));
            const grossAmount = parseFloat(originalAmount.toFixed(2));

            // Calculate dynamic over_due_days_count based on simulated date
            const simulatedNow = new Date(globalSimulatedNow);
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

            const dailyPenaltyAmount = parseFloat(penaltyAmountPerDay.toFixed(2));
            const penaltyText = isOverdue
                ? `${displayPercentage}% per day ${dailyPenaltyAmount} × ${overDueDaysCount} days`
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
        const globalSimulatedNow = await getSimulatedNow();
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
            return successResponse(res, statusCodes.OK, 'No bids found', { count: 0, rows: [] });
        }

        // Deduplicate enrollments by group_id
        const uniqueGroupIds = new Set();
        const uniqueEnrollments = enrollments.filter(e => {
            if (uniqueGroupIds.has(e.group_id)) return false;
            uniqueGroupIds.add(e.group_id);
            return true;
        });

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

        const simulatedNow = new Date(globalSimulatedNow);
        const simulatedTodayStr = simulatedNow.toISOString().split('T')[0];

        for (const e of uniqueEnrollments) {
            const group = e.group;
            if (!group) continue;

            let isMatch = false;
            let badgeLabel = 0;
            let timingLabel = '';

            const groupStatus = Number(group.chits_group_status); // 0 - Not started, 1 - started, 2 - completed
            const typeInt = Number(type);

            const isAuctionToday = group.auction_date === simulatedTodayStr;
            const isAuctionFuture = group.auction_date && group.auction_date > simulatedTodayStr;
            const isAuctionPast = group.auction_date && group.auction_date < simulatedTodayStr;

            if (typeInt === 1) {
                if (groupStatus === 1 && isAuctionToday) {
                    isMatch = true;
                    badgeLabel = 1;
                    timingLabel = 'Today';
                }
            } else if (typeInt === 2) {
                if (groupStatus === 0 || (groupStatus === 1 && isAuctionFuture)) {
                    isMatch = true;
                    badgeLabel = 2;
                    timingLabel = group.auction_date ? formatDateToOrdinal(group.auction_date) : 'Soon';
                }
            } else if (typeInt === 3) {
                const pastAuctionsCount = await Auction.count({ where: { group_id: group.id } });
                if (groupStatus === 2 || pastAuctionsCount > 0 || (groupStatus === 1 && isAuctionPast)) {
                    isMatch = true;
                    badgeLabel = 3;
                    timingLabel = groupStatus === 2 ? 'Closed' : 'Active (Has History)';
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
                    is_today: isAuctionToday
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

const getBidDetailsService = async (res, group_id, userPayload, bodySubscriberId = null) => {
    try {
        const group = await ChitsGroup.findByPk(group_id);
        if (!group) {
            return errorResponse(res, statusCodes.NOT_FOUND, 'Chit group not found');
        }

        const schemeConfig = group.scheme_configuration_id
            ? await FixedSchemeChitsConfiguration.findByPk(group.scheme_configuration_id)
            : null;

        // 1. Fetch all completed auctions for this group
        const pastAuctions = await Auction.findAll({
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
        const latestAuction = pastAuctions.length > 0 ? pastAuctions[0] : null;

        // 2. Fetch all active enrollments for this group (with subscriber details for wheel)
        const allEnrollments = await Enrollment.findAll({
            where: { group_id, delete_status: 0 },
            include: [{
                model: Member,
                as: 'subscriber',
                attributes: ['id', 'name', 'rep_by_first_name', 'upload_image', 'member_id']
            }],
            order: [['group_position_number', 'ASC']]
        });

        const membersCount = allEnrollments.length;

        // 3. User's enrolled member numbers in this group (e.g. ["#08", "#07"])
        const currentMemberId = (userPayload && userPayload.id) ? userPayload.id : bodySubscriberId;
        const userEnrollments = currentMemberId
            ? allEnrollments.filter(e => e.subscriber_id == currentMemberId)
            : [];

        const memberNumbersList = userEnrollments
            .map(e => e.group_position_number)
            .filter(n => n !== null && n !== undefined)
            .map(n => `#${String(n).padStart(2, '0')}`);

        // 4. Current month / installment fraction (e.g. "10/15")
        const totalAuctionsCount = pastAuctions.length;
        const currentInstallmentNo = Math.max(1, totalAuctionsCount);
        const totalInstallments = group.no_of_installments || 1;
        const currentMonthFormatted = `${currentInstallmentNo}/${totalInstallments}`;

        const rawBidAmount = latestAuction ? (parseFloat(latestAuction.bid_amount) || 0.00) : 0.00;
        const bidWinningAmount = latestAuction
            ? (getSchemeWinningAmount(schemeConfig, latestAuction.auction_number) ?? rawBidAmount)
            : (schemeConfig ? (getSchemeWinningAmount(schemeConfig, currentInstallmentNo) ?? 0.00) : 0.00);

        // Status label mapping: 0 = Upcoming, 1 = Live Now, 2 = Completed
        const groupStatus = Number(group.chits_group_status);
        let badgeText = 'Upcoming';
        if (groupStatus === 1) badgeText = 'Live Now';
        else if (groupStatus === 2) badgeText = 'Completed';

        // 5. Winner information & check if self is winner
        let winnerTicketNo = latestAuction ? (latestAuction.ticket_number || null) : null;
        if (!winnerTicketNo && latestAuction && latestAuction.bidder_id) {
            const winnerEnr = allEnrollments.find(e => e.subscriber_id === latestAuction.bidder_id);
            if (winnerEnr && winnerEnr.group_position_number) {
                winnerTicketNo = winnerEnr.group_position_number;
            }
        }

        const isWinnerStatus = (latestAuction && currentMemberId)
            ? (latestAuction.bidder_id == currentMemberId)
            : false;

        const winnerNumberFormatted = winnerTicketNo !== null && winnerTicketNo !== undefined
            ? `Winner #${String(winnerTicketNo).padStart(2, '0')}`
            : (latestAuction && latestAuction.bidder ? `Winner #${latestAuction.bidder.id}` : null);

        const winnerTicketFormatted = winnerTicketNo !== null && winnerTicketNo !== undefined
            ? `#${String(winnerTicketNo).padStart(2, '0')}`
            : null;

        // 6. Wheel members list
        const wheelMembers = allEnrollments.map(e => ({
            member_id: e.subscriber ? e.subscriber.id : null,
            name: e.subscriber ? (e.subscriber.rep_by_first_name || e.subscriber.name || 'Member') : 'Member',
            ticket_number: e.group_position_number ? `#${String(e.group_position_number).padStart(2, '0')}` : null,
            position: e.group_position_number,
            is_self: currentMemberId ? (e.subscriber_id == currentMemberId) : false
        }));

        const responseData = {
            // is_winner_status: isWinnerStatus,
            bid_winning_amount: bidWinningAmount,
            // winner_number: isWinnerStatus ? winnerNumberFormatted : null,
            // winner_ticket_number: isWinnerStatus ? winnerTicketFormatted : null,
            chit_group_details: {
                group_id: group.id,
                group_name: group.group_name || 'Unknown Chit',
                total_amount: parseFloat(group.chit_amount) || 0.00,
                total_installments: totalInstallments,
                members_count: membersCount,
                current_month: currentMonthFormatted,
                badge_label: groupStatus,
                badge_text: badgeText,
                member_numbers: memberNumbersList.join(', ')
            },
            wheel_members: wheelMembers,
            winner_details: (latestAuction && latestAuction.bidder) ? {
                winner_name: latestAuction.bidder.name || 'N/A',
                winner_member_id: latestAuction.bidder.member_id || `#${latestAuction.bidder.id}`,
                winner_ticket_number: winnerTicketFormatted,
                winner_number: isWinnerStatus ? winnerNumberFormatted : null,
                is_self_winner: isWinnerStatus
            } : null,
            past_auctions: pastAuctions.map(a => ({
                auction_number: a.auction_number,
                auction_date: a.auction_date,
                bid_amount: parseFloat(a.bid_amount) || 0,
                winner_name: a.bidder ? a.bidder.name : 'Unknown'
            }))
        };

        return successResponse(res, statusCodes.OK, 'Bid details retrieved successfully', responseData);
    } catch (error) {
        console.error('Error in getBidDetailsService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getChitDetailsService = async (res, userPayload, group_id, auction_type = null) => {
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

        const resolvedAuctionType = resolveChitGroupAuctionType(group);

        if (auction_type !== undefined && auction_type !== null && auction_type !== '') {
            if (resolvedAuctionType !== Number(auction_type)) {
                return errorResponse(res, statusCodes.NOT_FOUND, `Chit group does not match the requested auction type (${Number(auction_type) === 1 ? 'Open Auction' : 'Fixed Chit'})`);
            }
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

        // Helper date formatting functions
        const formatDateDMY = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return String(dateStr);
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const y = date.getFullYear();
            return `${d}/${m}/${y}`;
        };

        const formatDateShortDMY = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return String(dateStr);
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const shortYear = String(date.getFullYear()).slice(-2);
            return `${d}/${m}/${shortYear}`;
        };

        const formatDateToOrdinal = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return String(dateStr);
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

        const getPaymentModeLabel = (mode) => {
            switch (Number(mode)) {
                case 1: return 'Cash';
                case 2: return 'UPI';
                case 3: return 'Cheque';
                case 4: return 'Bank Transfer';
                case 5: return 'Others';
                default: return 'Online';
            }
        };

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

        // 5. Calculate Dates, Installments & Counts
        const totalMonthsCount = parseInt(group.no_of_installments, 10) || 12;

        let startDateVal = group.chit_start_date || group.commencement_date || (group.createdAt ? new Date(group.createdAt).toISOString().split('T')[0] : null);
        let endDateVal = group.chit_end_date || group.term_date || group.maturity_date;

        if (!endDateVal && startDateVal) {
            const sDate = new Date(startDateVal);
            if (!isNaN(sDate.getTime())) {
                const eDate = new Date(sDate);
                eDate.setMonth(eDate.getMonth() + totalMonthsCount);
                endDateVal = eDate.toISOString().split('T')[0];
            }
        }

        const startDateFormatted = formatDateDMY(startDateVal);
        const endDateFormatted = formatDateDMY(endDateVal);

        const enrollmentIds = userEnrollments.map(e => e.id);

        // Fetch subscriber's own installments in this group
        const allUserInstallments = await ChitsInstallment.findAll({
            where: {
                enrollment_id: { [Op.in]: enrollmentIds }
            }
        });
        const userInstallmentIds = allUserInstallments.map(i => i.id);

        // Fetch all customer payments made by this subscriber for this group's installments
        const userPayments = await CustomerPayment.findAll({
            where: {
                chits_installment_id: { [Op.in]: userInstallmentIds },
                payment_status: 1
            },
            order: [['payment_date', 'ASC'], ['createdAt', 'ASC']]
        });

        const totalPaidAmount = userPayments.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);
        const singleChitAmount = parseFloat(group.chit_amount) || 0.00;
        const totalChitAmountForUser = singleChitAmount * userEnrollments.length;
        const groupPendingAmount = Math.max(0, totalChitAmountForUser - totalPaidAmount);
        const groupAdvanceAmount = Math.max(0, totalPaidAmount - totalChitAmountForUser);

        // Calculate Next Payment Due card details
        const upcomingInstallment = await ChitsInstallment.findOne({
            where: {
                enrollment_id: { [Op.in]: enrollmentIds },
                id: {
                    [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`)
                }
            },
            order: [['due_date', 'ASC'], ['installment_no', 'ASC']]
        });

        let nextPaymentDue = null;
        if (upcomingInstallment) {
            const dueAmount = parseFloat(upcomingInstallment.payable_amount) || 0.00;
            const grossAmount = parseFloat(group.installment_amount) || (singleChitAmount / totalMonthsCount) || 0.00;

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

            const simulatedNow = await getSimulatedNow();
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

            const dailyPenaltyAmount = parseFloat(penaltyAmountPerDay.toFixed(2));
            const penaltyText = isOverdue
                ? `${displayPercentage}% per day ${dailyPenaltyAmount} × ${overDueDaysCount} days`
                : null;

            const finalPayableAmount = parseFloat((dueAmount + penaltyAmount).toFixed(2));

            let countdownStart = new Date(simulatedNow);
            if (group && group.auction_date) {
                const groupAuctionDate = new Date(group.auction_date);
                groupAuctionDate.setHours(0, 0, 0, 0);
                if (groupAuctionDate > countdownStart) {
                    countdownStart = groupAuctionDate;
                }
            }
            const days_left = !isOverdue ? Math.ceil((dueDate.getTime() - countdownStart.getTime()) / (1000 * 60 * 60 * 24)) : 0;

            nextPaymentDue = {
                installment_no: upcomingInstallment.installment_no,
                due_date: upcomingInstallment.due_date,
                due_date_formatted: formatDateToOrdinal(upcomingInstallment.due_date),
                due_amount: parseFloat(dueAmount.toFixed(2)),
                gross_installment_amount: parseFloat(grossAmount.toFixed(2)),
                penalty_amount: parseFloat(penaltyAmount.toFixed(2)),
                over_due_days_count: overDueDaysCount,
                penalty_text: penaltyText,
                final_payable_amount: parseFloat(finalPayableAmount.toFixed(2)),
                is_overdue: isOverdue,
                days_left: days_left,
                days_left_text: `${days_left} days left`,
                paid_amount: 0.00
            };
        }

        // 6. Fetch all completed auctions for this group in ascending order (oldest first, recent last)
        const auctions = await Auction.findAll({
            where: { group_id },
            order: [['auction_number', 'ASC']],
            include: [
                {
                    model: Member,
                    as: 'bidder',
                    attributes: ['id', 'name', 'member_id']
                }
            ]
        });

        // Determine current month count (latest auction number)
        let currentMonthCount = 1;
        if (auctions && auctions.length > 0) {
            currentMonthCount = auctions[auctions.length - 1].auction_number;
        } else if (group.chits_group_status === 1) {
            currentMonthCount = 1;
        } else {
            currentMonthCount = 0;
        }
        currentMonthCount = Math.min(totalMonthsCount, Math.max(1, currentMonthCount));

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
        const groupEnrollmentIds = allGroupEnrollments.map(e => e.id);

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

            const auctionDateFormatted = formatDateDMY(auction.auction_date);

            // Winner Ticket & Position formatting
            const winnerTicketFormatted = auction.ticket_number
                ? "#" + String(auction.ticket_number).padStart(2, '0')
                : (auction.bidder && auction.bidder.member_id ? `#${auction.bidder.member_id}` : 'N/A');

            let winnerPositionLabel = 'P1';
            if (auction.ticket_number) {
                winnerPositionLabel = `P${auction.ticket_number}`;
            } else if (auction.bidder && auction.bidder.member_id) {
                winnerPositionLabel = `P${auction.bidder.member_id}`;
            }

            const rawBidAmount = parseFloat(auction.bid_amount) || 0.00;
            const bidWinningAmount = getSchemeWinningAmount(schemeConfig, auction.auction_number) ?? rawBidAmount;
            const isWinnerStatus = auction.bidder_id === subscriber_id;

            const winnerInfo = auction.bidder ? {
                winner_name: auction.bidder.name || 'N/A',
                winner_member_id: winnerTicketFormatted,
                ticket_number: auction.ticket_number || null,
                position_label: winnerPositionLabel,
                is_self_winner: isWinnerStatus,
                bid_winning_amount: parseFloat(bidWinningAmount.toFixed(2))
            } : null;

            // Math card stats per ticket
            const originalAmountPerTicket = getSchemeOriginalAmount(schemeConfig, auction);
            let profitAmountPerTicket = 0.00;

            const matchingInstallment = allUserInstallments.find(inst => inst.installment_no === auction.auction_number);

            // Calculate profit primarily from auction dividend if available
            if (auction.dividend && parseFloat(auction.dividend) > 0) {
                const divVal = parseFloat(auction.dividend);
                if (divVal < originalAmountPerTicket) {
                    profitAmountPerTicket = divVal;
                } else {
                    profitAmountPerTicket = divVal / (totalMembersCount || 20);
                }
            } else {
                if (matchingInstallment) {
                    const payableVal = parseFloat(matchingInstallment.payable_amount) || 0.00;
                    profitAmountPerTicket = Math.max(0, originalAmountPerTicket - payableVal);
                }
            }

            const payableAmountPerTicket = Math.max(0, originalAmountPerTicket - profitAmountPerTicket);

            // 8. Build member-wise breakdown list for subscriber's enrolled tickets for this specific auction
            const allInstallmentsForAuction = await ChitsInstallment.findAll({
                where: {
                    enrollment_id: { [Op.in]: groupEnrollmentIds },
                    installment_no: auction.auction_number
                }
            });

            const memberBreakdown = [];
            let monthOriginalTotal = 0.00;
            let monthProfitTotal = 0.00;
            let monthPayableTotal = 0.00;
            let monthPaidTotal = 0.00;
            let monthPendingTotal = 0.00;
            let monthAdvanceTotal = 0.00;
            let monthPenaltyTotal = 0.00;
            let monthTotalAmountSum = 0.00;

            for (const ge of userEnrollments) {
                const ticketOriginal = originalAmountPerTicket;
                const ticketProfit = profitAmountPerTicket;
                const ticketPayable = payableAmountPerTicket;

                const geInstallment = allInstallmentsForAuction.find(inst => inst.enrollment_id === ge.id) ||
                    allUserInstallments.find(inst => inst.enrollment_id === ge.id && inst.installment_no === auction.auction_number);

                let ticketPaidAmount = 0.00;
                let ticketPenaltyPaid = 0.00;
                let ticketPaymentHistory = [];

                if (geInstallment) {
                    const paymentsForInst = userPayments.filter(p => p.chits_installment_id === geInstallment.id);

                    ticketPaymentHistory = paymentsForInst.map(p => {
                        const pReceived = parseFloat(p.received_amount) || 0.00;
                        const pPenalty = parseFloat(p.penalty_paid) || 0.00;
                        const pDate = p.payment_date || (p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : null);
                        const pDateFormatted = formatDateDMY(pDate);
                        const pDateShort = formatDateShortDMY(pDate);
                        const pMode = p.payment_mode || 1;
                        const pModeLabel = getPaymentModeLabel(pMode);

                        return {
                            id: p.id,
                            payment_id: p.id,
                            receipt_number: p.receipt_number || null,
                            transaction_reference: p.transaction_reference || null,
                            paid_date: pDate,
                            paid_date_formatted: pDateFormatted,
                            paid_date_short: pDateShort,
                            payment_text: pDateShort ? `Paid - ${pDateShort}` : 'Paid',
                            payment_mode: pMode,
                            payment_mode_label: pModeLabel,
                            received_amount: parseFloat(pReceived.toFixed(2)),
                            penalty_paid: parseFloat(pPenalty.toFixed(2))
                        };
                    });

                    ticketPaidAmount = ticketPaymentHistory.reduce((sum, p) => sum + p.received_amount, 0);
                    ticketPenaltyPaid = ticketPaymentHistory.reduce((sum, p) => sum + p.penalty_paid, 0);
                }

                let ticketPending = 0.00;
                let ticketAdvance = 0.00;
                if (ticketPaidAmount >= ticketPayable) {
                    ticketPending = 0.00;
                    ticketAdvance = parseFloat((ticketPaidAmount - ticketPayable).toFixed(2));
                } else {
                    ticketPending = parseFloat((ticketPayable - ticketPaidAmount).toFixed(2));
                    ticketAdvance = 0.00;
                }

                let ticketPenaltyAmount = 0.00;
                let ticketPenaltyText = null;

                if (geInstallment && ticketPending > 0) {
                    const dueDate = geInstallment.due_date ? new Date(geInstallment.due_date) : null;
                    if (dueDate) {
                        const simulatedNow = await getSimulatedNow();
                        simulatedNow.setHours(0, 0, 0, 0);
                        dueDate.setHours(0, 0, 0, 0);

                        if (dueDate < simulatedNow) {
                            const diffTime = simulatedNow.getTime() - dueDate.getTime();
                            const overDueDaysCount = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                            if (overDueDaysCount > 0) {
                                const isSubscriberWinner = auctions.some(a => a.bidder_id === subscriber_id);
                                const penaltyRate = isSubscriberWinner
                                    ? (parseFloat(group.penality_for_ps) || 0.00)
                                    : (parseFloat(group.penality_for_nps) || 0.00);

                                let penaltyAmountPerDay = 0.00;
                                let displayPercentage = 2.0;

                                if (penaltyRate > 0) {
                                    if (penaltyRate <= 20) {
                                        displayPercentage = penaltyRate;
                                        penaltyAmountPerDay = (penaltyRate / 100) * ticketPending;
                                    } else {
                                        penaltyAmountPerDay = penaltyRate;
                                        displayPercentage = ticketPending > 0 ? parseFloat(((penaltyAmountPerDay / ticketPending) * 100).toFixed(1)) : 2.0;
                                    }
                                } else {
                                    displayPercentage = 2.0;
                                    penaltyAmountPerDay = 0.02 * ticketPending;
                                }

                                const dailyPenaltyAmount = parseFloat(penaltyAmountPerDay.toFixed(2));
                                ticketPenaltyAmount = parseFloat((overDueDaysCount * penaltyAmountPerDay).toFixed(2));
                                ticketPenaltyText = `${displayPercentage}% per day ${dailyPenaltyAmount} × ${overDueDaysCount} days`;
                            }
                        }
                    }
                }

                const ticketTotalAmount = parseFloat((ticketPending + ticketPenaltyAmount).toFixed(2));

                monthOriginalTotal += ticketOriginal;
                monthProfitTotal += ticketProfit;
                monthPayableTotal += ticketPayable;
                monthPaidTotal += ticketPaidAmount;
                monthPendingTotal += ticketPending;
                monthAdvanceTotal += ticketAdvance;
                monthPenaltyTotal += ticketPenaltyAmount;
                monthTotalAmountSum += ticketTotalAmount;

                memberBreakdown.push({
                    enrollment_id: ge.id,
                    name: ge.subscriber ? ge.subscriber.name : 'Unknown Subscriber',
                    position_label: `Member #${ge.group_position_number}`,
                    group_position_number: ge.group_position_number,
                    ticket_number: `#${String(ge.group_position_number).padStart(2, '0')}`,
                    subscriber_id: ge.subscriber_id,
                    subscriber_name: ge.subscriber ? ge.subscriber.name : 'Unknown Subscriber',
                    original_amount: parseFloat(ticketOriginal.toFixed(2)),
                    profit_amount: parseFloat(ticketProfit.toFixed(2)),
                    payable: parseFloat(ticketPayable.toFixed(2)),
                    paid_amount: parseFloat(ticketPaidAmount.toFixed(2)),
                    pending_amount: parseFloat(ticketPending.toFixed(2)),
                    advance_payment: parseFloat(ticketAdvance.toFixed(2)),
                    advance_amount_status: ticketAdvance > 0,
                    penalty_amount: parseFloat(ticketPenaltyAmount.toFixed(2)),
                    penalty_text: ticketPenaltyText,
                    total_amount: parseFloat(ticketTotalAmount.toFixed(2)),
                    payment_history: ticketPaymentHistory
                });
            }

            let monthPenaltyText = null;
            const itemWithPenalty = memberBreakdown.find(m => m.penalty_text);
            if (itemWithPenalty) {
                monthPenaltyText = itemWithPenalty.penalty_text;
            }

            monthlyActivity.push({
                id: auction.id,
                auction_number: auction.auction_number,
                month_count: auction.auction_number,
                total_months_count: totalMonthsCount,
                month_badge: `${auction.auction_number}/${totalMonthsCount}`,
                month_name: monthName,
                auction_date: auction.auction_date,
                auction_date_formatted: auctionDateFormatted,
                bid_amount: parseFloat((parseFloat(auction.bid_amount) || 0.00).toFixed(2)),
                bid_winning_amount: parseFloat(bidWinningAmount.toFixed(2)),
                winner_name: auction.bidder ? auction.bidder.name : 'N/A',
                winner_member_id: winnerInfo ? winnerInfo.winner_member_id : 'N/A',
                winner_info: winnerInfo,
                is_winner_status: isWinnerStatus,

                // Amounts (supports all UI cards & screens)
                original_amount: parseFloat(monthOriginalTotal.toFixed(2)),
                profit_amount: parseFloat(monthProfitTotal.toFixed(2)),
                payable: parseFloat(monthPayableTotal.toFixed(2)),
                paid_amount: parseFloat(monthPaidTotal.toFixed(2)),
                pending_amount: parseFloat(monthPendingTotal.toFixed(2)),
                advance_payment: parseFloat(monthAdvanceTotal.toFixed(2)),
                advance_amount_status: monthAdvanceTotal > 0,
                penalty_amount: parseFloat(monthPenaltyTotal.toFixed(2)),
                penalty_text: monthPenaltyText,
                total_amount: parseFloat(monthTotalAmountSum.toFixed(2)),

                // Per-ticket breakdown and summary for Screen 5
                member_breakdown: memberBreakdown,
                breakdown_summary: {
                    total_original: parseFloat(monthOriginalTotal.toFixed(2)),
                    total_profit: parseFloat(monthProfitTotal.toFixed(2)),
                    total_payable: parseFloat(monthPayableTotal.toFixed(2)),
                    total_paid: parseFloat(monthPaidTotal.toFixed(2)),
                    total_paid_amount: parseFloat(monthPaidTotal.toFixed(2)),
                    total_pending: parseFloat(monthPendingTotal.toFixed(2)),
                    total_advance: parseFloat(monthAdvanceTotal.toFixed(2)),
                    advance_amount_status: monthAdvanceTotal > 0,
                    total_amount: parseFloat(monthTotalAmountSum.toFixed(2)),
                    total_penalty: parseFloat(monthPenaltyTotal.toFixed(2))
                }
            });
        }

        // Assemble final beautiful structured response matching all 5 screens
        const responsePayload = {
            chit_group_details: {
                group_id: group.id,
                group_name: group.group_name || 'Unknown Chit',
                start_date: startDateFormatted,
                end_date: endDateFormatted,
                total_amount: parseInt(singleChitAmount, 10) || 0,
                pending_amount: parseFloat(groupPendingAmount.toFixed(2)),
                advance_payment: parseFloat(groupAdvanceAmount.toFixed(2)),
                advance_amount_status: groupAdvanceAmount > 0,
                total_months: totalMonthsCount,
                current_month: currentMonthCount,
                total_installments: totalMonthsCount,
                members_count: totalMembersCount,
                total_members: `${totalMembersCount} Members`,
                auction_type: resolvedAuctionType,
                auction_type_label: resolvedAuctionType === 1 ? 'Open Auction' : (resolvedAuctionType === 2 ? 'Fixed Chit' : 'Standard'),
                running_status_label: group.chits_group_status === 1 ? 'Active chit' : (group.chits_group_status === 2 ? 'Completed' : 'Upcoming'),
                badge_label: group.chits_group_status,
                ticket_member_number: positionNumbersFormatted,
                collection_agent_name: collectionAgentName,
                business_agent_name: agentName
            },
            auction_type: resolvedAuctionType,
            auction_type_label: resolvedAuctionType === 1 ? 'Open Auction' : (resolvedAuctionType === 2 ? 'Fixed Chit' : 'Standard'),
            my_chit_overview: {
                monthly_bid_amount: parseFloat((parseFloat(group.installment_amount) || (singleChitAmount / totalMonthsCount) || 0.00).toFixed(2)),
                total_paid_amount: parseFloat(totalPaidAmount.toFixed(2)),
                total_pending_amount: parseFloat(groupPendingAmount.toFixed(2)),
                total_advance_payment: parseFloat(groupAdvanceAmount.toFixed(2)),
                advance_amount_status: groupAdvanceAmount > 0,
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

const getTotalPendingCollectionService = async (res, collection_agent_id, min, max, from_date, to_date) => {
    try {
        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const enrollments = await Enrollment.findAll({
            where: {
                collection_agent_id,
                delete_status: 0
            },
            include: [
                {
                    model: Member,
                    as: 'subscriber',
                    attributes: ['id', 'name', 'member_id', 'upload_image', 'mobile_number', 'gender']
                },
                {
                    model: ChitsGroup,
                    as: 'group',
                    where: { is_deleted_status: 0 },
                    required: true
                }
            ]
        });

        if (!enrollments || enrollments.length === 0) {
            return successResponse(res, statusCodes.OK, 'Total pending collection retrieved successfully', {
                total_pending_amount: 0,
                total_pending_members: 0,
                from_groups_count: 0,
                count: 0,
                rows: []
            });
        }

        const enrollmentIds = enrollments.map(e => e.id);

        const installmentWhere = {
            enrollment_id: { [Op.in]: enrollmentIds },
            payable_amount: { [Op.gt]: 0 }
        };

        if (from_date && to_date) {
            const startDate = new Date(from_date).toISOString().split('T')[0];
            const endDate = new Date(to_date).toISOString().split('T')[0];
            installmentWhere.due_date = {
                [Op.between]: [startDate, endDate]
            };
        } else if (from_date) {
            const startDate = new Date(from_date).toISOString().split('T')[0];
            installmentWhere.due_date = { [Op.gte]: startDate };
        } else if (to_date) {
            const endDate = new Date(to_date).toISOString().split('T')[0];
            installmentWhere.due_date = { [Op.lte]: endDate };
        }

        const installments = await ChitsInstallment.findAll({
            where: installmentWhere,
            order: [['due_date', 'ASC']]
        });

        const installmentIds = installments.map(i => i.id);

        const payments = await CustomerPayment.findAll({
            where: {
                chits_installment_id: { [Op.in]: installmentIds },
                payment_status: 1
            }
        });

        // Group by group_id and member
        const groupMap = {};
        const overallPendingMembersSet = new Set();
        let overallPendingAmount = 0;

        installments.forEach(inst => {
            const payable = parseFloat(inst.payable_amount) || 0;
            const relatedPayments = payments.filter(p => p.chits_installment_id === inst.id);
            const paid = relatedPayments.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);
            const pending = Math.max(0, payable - paid);

            if (pending <= 0) return;

            const e = enrollments.find(en => en.id === inst.enrollment_id);
            if (!e || !e.group || !e.subscriber) return;

            const group = e.group;
            const subscriber = e.subscriber;

            if (!groupMap[group.id]) {
                groupMap[group.id] = {
                    group_id: group.id,
                    group_name: group.group_name || 'Unknown Chit',
                    chit_amount: parseFloat((parseFloat(group.chit_amount) || 0).toFixed(2)),
                    pending_amount: 0.00,
                    collected_amount: 0.00,
                    penalty_amount: 0.00,
                    total_amount: 0.00,
                    pending_members_count: 0,
                    membersMap: {}
                };
            }

            if (!groupMap[group.id].membersMap[subscriber.id]) {
                groupMap[group.id].membersMap[subscriber.id] = {
                    id: subscriber.id,
                    name: subscriber.name || 'Unknown',
                    member_id: subscriber.member_id || `#${subscriber.id}`,
                    profile_image: subscriber.upload_image || null,
                    mobile_number: subscriber.mobile_number || null,
                    gender: subscriber.gender || null,
                    pending_amount: 0.00,
                    collected_amount: 0.00,
                    penalty_amount: 0.00,
                    total_amount: 0.00
                };
            }

            const memberPending = parseFloat(((groupMap[group.id].membersMap[subscriber.id].pending_amount || 0) + pending).toFixed(2));
            groupMap[group.id].membersMap[subscriber.id].pending_amount = memberPending;
            groupMap[group.id].membersMap[subscriber.id].total_amount = memberPending;

            groupMap[group.id].pending_amount = parseFloat(((groupMap[group.id].pending_amount || 0) + pending).toFixed(2));
            groupMap[group.id].total_amount = groupMap[group.id].pending_amount;
            overallPendingAmount = parseFloat((overallPendingAmount + pending).toFixed(2));
            overallPendingMembersSet.add(subscriber.id);
        });

        const allGroupRows = Object.values(groupMap).map(g => {
            const members = Object.values(g.membersMap);
            return {
                group_id: g.group_id,
                group_name: g.group_name,
                chit_amount: parseFloat((parseFloat(g.chit_amount) || 0).toFixed(2)),
                pending_amount: parseFloat((parseFloat(g.pending_amount) || 0).toFixed(2)),
                collected_amount: 0.00,
                penalty_amount: 0.00,
                total_amount: parseFloat((parseFloat(g.pending_amount) || 0).toFixed(2)),
                pending_members_count: members.length,
                members
            };
        });

        const totalGroupsCount = allGroupRows.length;
        const paginatedRows = allGroupRows.slice(offset, offset + limit);

        return successResponse(res, statusCodes.OK, 'Total pending collection retrieved successfully', {
            total_pending_amount: parseFloat(overallPendingAmount.toFixed(2)),
            pending_amount: parseFloat(overallPendingAmount.toFixed(2)),
            total_pending_members: overallPendingMembersSet.size,
            from_groups_count: totalGroupsCount,
            count: totalGroupsCount,
            rows: paginatedRows
        });
    } catch (error) {
        console.error('Error in getTotalPendingCollectionService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getTodayCollectionService = async (res, collection_agent_id, min, max, from_date, to_date) => {
    try {
        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const enrollments = await Enrollment.findAll({
            where: {
                collection_agent_id,
                delete_status: 0
            },
            include: [
                {
                    model: Member,
                    as: 'subscriber',
                    attributes: ['id', 'name', 'member_id', 'upload_image', 'mobile_number', 'gender']
                },
                {
                    model: ChitsGroup,
                    as: 'group',
                    where: { is_deleted_status: 0 },
                    required: true
                }
            ]
        });

        if (!enrollments || enrollments.length === 0) {
            return successResponse(res, statusCodes.OK, 'Today collection retrieved successfully', {
                today_collection: 0,
                total_today_collection: 0,
                from_collection_group_count: 0,
                from_members_count: 0,
                count: 0,
                rows: []
            });
        }

        const enrollmentIds = enrollments.map(e => e.id);

        let startOfPeriod, endOfPeriod, dateStrFrom, dateStrTo;

        if (from_date && to_date) {
            startOfPeriod = new Date(from_date);
            startOfPeriod.setHours(0, 0, 0, 0);
            endOfPeriod = new Date(to_date);
            endOfPeriod.setHours(23, 59, 59, 999);
            dateStrFrom = new Date(from_date).toISOString().split('T')[0];
            dateStrTo = new Date(to_date).toISOString().split('T')[0];
        } else if (from_date) {
            startOfPeriod = new Date(from_date);
            startOfPeriod.setHours(0, 0, 0, 0);
            endOfPeriod = new Date(from_date);
            endOfPeriod.setHours(23, 59, 59, 999);
            dateStrFrom = new Date(from_date).toISOString().split('T')[0];
            dateStrTo = dateStrFrom;
        } else {
            const simulatedNow = await getSimulatedNow();
            startOfPeriod = new Date(simulatedNow);
            startOfPeriod.setHours(0, 0, 0, 0);
            endOfPeriod = new Date(simulatedNow);
            endOfPeriod.setHours(23, 59, 59, 999);
            dateStrFrom = startOfPeriod.toISOString().split('T')[0];
            dateStrTo = endOfPeriod.toISOString().split('T')[0];
        }

        const payments = await CustomerPayment.findAll({
            where: {
                payment_status: 1,
                [Op.or]: [
                    {
                        payment_date: {
                            [Op.between]: [dateStrFrom, dateStrTo]
                        }
                    },
                    {
                        createdAt: {
                            [Op.between]: [startOfPeriod, endOfPeriod]
                        }
                    }
                ]
            },
            include: [
                {
                    model: ChitsInstallment,
                    as: 'installment',
                    required: true,
                    where: {
                        enrollment_id: { [Op.in]: enrollmentIds }
                    }
                }
            ],
            order: [
                ['payment_date', 'DESC'],
                ['createdAt', 'DESC']
            ]
        });

        const getPaymentModeLabel = (mode) => {
            switch (Number(mode)) {
                case 1: return 'Cash';
                case 2: return 'UPI';
                case 3: return 'Cheque';
                case 4: return 'Bank';
                case 5: return 'Others';
                default: return 'Cash';
            }
        };

        const formatDateDMY = (dateInput) => {
            if (!dateInput) return '';
            const d = new Date(dateInput);
            if (isNaN(d.getTime())) return String(dateInput);
            const day = d.getDate();
            const month = d.getMonth() + 1;
            const year = String(d.getFullYear()).slice(-2);
            return `${day}/${month}/${year}`;
        };

        const groupMap = {};
        const overallCollectedMembersSet = new Set();
        let overallCollectedAmount = 0;

        payments.forEach(payment => {
            const inst = payment.installment;
            if (!inst) return;

            const e = enrollments.find(en => en.id === inst.enrollment_id);
            if (!e || !e.group || !e.subscriber) return;

            const group = e.group;
            const subscriber = e.subscriber;

            const received = parseFloat(payment.received_amount) || 0;
            const penalty = parseFloat(payment.penalty_paid) || 0;
            const totalPaid = received + penalty;

            if (totalPaid <= 0) return;

            if (!groupMap[group.id]) {
                groupMap[group.id] = {
                    group_id: group.id,
                    group_name: group.group_name || 'Unknown Chit',
                    chit_amount: parseFloat((parseFloat(group.chit_amount) || 0).toFixed(2)),
                    collected_amount: 0.00,
                    pending_amount: 0.00,
                    penalty_amount: 0.00,
                    total_amount: 0.00,
                    collected_members_count: 0,
                    membersMap: {}
                };
            }

            const rawDate = payment.payment_date || (payment.createdAt ? new Date(payment.createdAt).toISOString().split('T')[0] : '');
            const mode = payment.payment_mode || 1;

            if (!groupMap[group.id].membersMap[subscriber.id]) {
                groupMap[group.id].membersMap[subscriber.id] = {
                    id: subscriber.id,
                    name: subscriber.name || 'Unknown',
                    member_id: subscriber.member_id || `#${subscriber.id}`,
                    profile_image: subscriber.upload_image || null,
                    amount: 0.00,
                    collected_amount: 0.00,
                    pending_amount: 0.00,
                    penalty_amount: 0.00,
                    total_amount: 0.00,
                    payment_date: rawDate,
                    formatted_date: formatDateDMY(rawDate),
                    payment_mode: mode,
                    payment_mode_label: getPaymentModeLabel(mode)
                };
            }

            groupMap[group.id].membersMap[subscriber.id].amount = parseFloat(((groupMap[group.id].membersMap[subscriber.id].amount || 0) + received).toFixed(2));
            groupMap[group.id].membersMap[subscriber.id].penalty_amount = parseFloat(((groupMap[group.id].membersMap[subscriber.id].penalty_amount || 0) + penalty).toFixed(2));
            groupMap[group.id].membersMap[subscriber.id].total_amount = parseFloat(((groupMap[group.id].membersMap[subscriber.id].total_amount || 0) + totalPaid).toFixed(2));
            groupMap[group.id].membersMap[subscriber.id].collected_amount = groupMap[group.id].membersMap[subscriber.id].total_amount;

            groupMap[group.id].collected_amount = parseFloat(((groupMap[group.id].collected_amount || 0) + totalPaid).toFixed(2));
            groupMap[group.id].total_amount = groupMap[group.id].collected_amount;
            groupMap[group.id].penalty_amount = parseFloat(((groupMap[group.id].penalty_amount || 0) + penalty).toFixed(2));
            overallCollectedAmount = parseFloat((overallCollectedAmount + totalPaid).toFixed(2));
            overallCollectedMembersSet.add(subscriber.id);
        });

        const allGroupRows = Object.values(groupMap).map(g => {
            const members = Object.values(g.membersMap);
            return {
                group_id: g.group_id,
                group_name: g.group_name,
                chit_amount: parseFloat((parseFloat(g.chit_amount) || 0).toFixed(2)),
                collected_amount: parseFloat((parseFloat(g.collected_amount) || 0).toFixed(2)),
                pending_amount: 0.00,
                penalty_amount: parseFloat((parseFloat(g.penalty_amount) || 0).toFixed(2)),
                total_amount: parseFloat((parseFloat(g.collected_amount) || 0).toFixed(2)),
                collected_members_count: members.length,
                members
            };
        });

        const totalGroupsCount = allGroupRows.length;
        const paginatedRows = allGroupRows.slice(offset, offset + limit);

        return successResponse(res, statusCodes.OK, 'Today collection retrieved successfully', {
            today_collection: parseFloat(overallCollectedAmount.toFixed(2)),
            total_today_collection: parseFloat(overallCollectedAmount.toFixed(2)),
            collected_amount: parseFloat(overallCollectedAmount.toFixed(2)),
            total_collected_amount: parseFloat(overallCollectedAmount.toFixed(2)),
            from_collection_group_count: totalGroupsCount,
            from_members_count: overallCollectedMembersSet.size,
            count: totalGroupsCount,
            rows: paginatedRows
        });
    } catch (error) {
        console.error('Error in getTodayCollectionService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getCollectionAgentGroupDashboardService = async (res, group_id, collection_agent_id, min, max) => {
    try {
        const group = await ChitsGroup.findByPk(group_id);
        if (!group) {
            return errorResponse(res, statusCodes.NOT_FOUND, 'Group not found');
        }

        const whereClause = { group_id, delete_status: 0 };
        if (collection_agent_id) {
            whereClause.collection_agent_id = collection_agent_id;
        }

        const enrollments = await Enrollment.findAll({
            where: whereClause,
            include: [{ model: Member, as: 'subscriber' }]
        });
        const enrollmentIds = enrollments.map(e => e.id);

        if (!enrollments || enrollments.length === 0) {
            return successResponse(res, statusCodes.OK, 'Group dashboard', {
                today_group_value_price: parseFloat(group.chit_amount) || 0,
                total_collected: 0,
                pending_amount: 0,
                overdue_members: 0,
                overall_collection_process_percentage: 0,
                current_date: new Date().toISOString().split('T')[0],
                pending_members: []
            });
        }

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

        const simulatedNow = await getSimulatedNow();
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
                        memberMap[sub.id].penalty_text = `Penalty - ₹ ${parseFloat(memberMap[sub.id].penalty_amount.toFixed(2))}`;

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

        if (max !== undefined && max !== null) {
            const offset = parseInt(min, 10) || 0;
            const limit = parseInt(max, 10);
            pending_members_list = pending_members_list.slice(offset, offset + limit);
        }

        pending_members_list = pending_members_list.map(row => {
            const d = new Date(row.oldest_due_date);
            row.oldest_due = `${months[d.getMonth()]} ${d.getFullYear()}`;
            row.balance = parseFloat(row.balance.toFixed(2));
            row.penalty_amount = parseFloat(row.penalty_amount.toFixed(2));
            delete row.oldest_due_date;
            return row;
        });

        return successResponse(res, statusCodes.OK, 'Group dashboard', {
            today_group_value_price: parseFloat(group.chit_amount) || 0,
            total_collected: parseFloat(total_collected.toFixed(2)),
            pending_amount: parseFloat(total_pending.toFixed(2)),
            overdue_members: overdue_members_set.size,
            overall_collection_process_percentage: parseFloat(percentage),
            current_date: new Date().toISOString().split('T')[0],
            pending_members: pending_members_list
        });
    } catch (error) {
        console.error('Error in getCollectionAgentGroupDashboardService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getPendingMembersService = async (res, collection_agent_id, group_id, min, max) => {
    try {
        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const whereClause = { collection_agent_id, delete_status: 0 };
        if (group_id) {
            whereClause.group_id = group_id;
        }

        const enrollments = await Enrollment.findAll({
            where: whereClause,
            include: [
                { model: Member, as: 'subscriber' },
                { model: ChitsGroup, as: 'group' }
            ]
        });

        const enrollmentIds = enrollments.map(e => e.id);
        const installments = await ChitsInstallment.findAll({
            where: {
                enrollment_id: { [Op.in]: enrollmentIds },
                payable_amount: { [Op.gt]: 0 }
            },
            include: [{
                model: CustomerPayment,
                as: 'payments',
                where: { payment_status: 1 },
                required: false
            }]
        });

        const pendingSubmissions = await CollectionAgentAmount.findAll({
            where: {
                collection_agent_id,
                status: 0
            },
            attributes: ['member_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
            group: ['member_id']
        });

        const pendingSubMap = {};
        pendingSubmissions.forEach(sub => {
            pendingSubMap[sub.member_id] = parseInt(sub.getDataValue('count'), 10) || 0;
        });

        const memberMap = {};
        installments.forEach(inst => {
            const e = enrollments.find(e => e.id === inst.enrollment_id);
            if (!e) return;
            const sub = e.subscriber;
            if (!sub) return;

            const payable = parseFloat(inst.payable_amount) || 0;
            const paidSoFar = inst.payments ? inst.payments.reduce((sum, p) => sum + parseFloat(p.received_amount || 0), 0) : 0;
            const dueAmount = Math.max(0, payable - paidSoFar);

            if (dueAmount <= 0) return;

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
                    penalty_text: "",
                    pending_submissions: pendingSubMap[sub.id] || 0
                };
            }

            memberMap[sub.id].pending_months += 1;
            memberMap[sub.id].balance += dueAmount;

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

            const simulatedNow = await getSimulatedNow();
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

                const dailyPenaltyAmount = parseFloat(penaltyAmountPerDay.toFixed(2));
                penalty_amount = parseFloat((overDueDaysCount * penaltyAmountPerDay).toFixed(2));
                penalty_text = `Penalty ${displayPercentage}% per day ${dailyPenaltyAmount} × ${overDueDaysCount} days`;
            }
        }

        balance = total_due - total_paid;

        return successResponse(res, statusCodes.OK, 'Member dues', {
            id: member.id,
            name: member.name,
            member_id: member.member_id,
            profile_image: member.upload_image,
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
                status_int: sub.status,
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
            received_amount: amount,
            cash,
            transaction_id,
            cheque_number,
            bank_details,
            other_details,
            status: 0
        }, { transaction });

        // Clearance Logic
        // Only the chits this agent services: money an agent collects must never pay
        // an installment on a chit assigned to another agent, or the collection is
        // credited to that agent in every report. Anything left over becomes a member advance.
        const enrollments = await Enrollment.findAll({
            where: { subscriber_id: member_id, delete_status: 0, collection_agent_id },
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
            const simulatedNow = await getSimulatedNow();
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

        // Dispatch notifications to Member & Admin (non-blocking)
        try {
            const member = await Member.findByPk(member_id);
            let agentName = 'Collection Agent';
            if (collection_agent_id) {
                const agentUser = await StaffUser.findByPk(collection_agent_id) || await Member.findByPk(collection_agent_id);
                if (agentUser) agentName = agentUser.name || agentUser.first_name || 'Collection Agent';
            }
            if (member) {
                // 1. Member Notification
                await fcmService.sendPushToMember(
                    member,
                    'Payment Received',
                    `Payment of ₹${amount} collected by ${agentName}. Status: Pending Verification.`,
                    {
                        type: 'PAYMENT_COLLECTED',
                        submission_id: String(submission.id),
                        amount: String(amount),
                        agent_name: agentName
                    }
                );
                // 2. Admin / Staff Notification
                if (member.company_id) {
                    await NotificationHistory.create({
                        user_id: String(member.company_id),
                        user_type: 'STAFF',
                        company_id: member.company_id,
                        title: 'Payment Collected by Agent',
                        body: `Agent ${agentName} collected ₹${amount} from member ${member.name || member.rep_by_first_name || 'Member'}.`,
                        data_payload: {
                            type: 'AGENT_PAYMENT_COLLECTED',
                            submission_id: String(submission.id),
                            member_id: String(member.id),
                            amount: String(amount),
                            agent_name: agentName
                        },
                        is_read: false
                    });
                }
            }
        } catch (notifErr) {
            console.error('[NOTIF] Failed to send payment collection notification:', notifErr.message);
        }

        return successResponse(res, statusCodes.OK, 'Payment submitted successfully', { submission_id: submission.id });
    } catch (error) {
        await transaction.rollback();
        console.error('Error in submitCollectionPaymentService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getAllGalleryService = async (res, reqBody, userPayload) => {
    try {
        const { min = 0, max = 10 } = reqBody || {};
        let company_id = reqBody ? reqBody.company_id : null;

        // If company_id not explicitly passed in body, resolve it from authenticated user
        if (!company_id && userPayload) {
            if (userPayload.company_id) {
                company_id = userPayload.company_id;
            } else if (userPayload.role === 'company') {
                company_id = userPayload.id;
            } else if (userPayload.role === 'staff' && userPayload.company_id) {
                company_id = userPayload.company_id;
            } else if (userPayload.id) {
                // Find company_id from user's active enrollment
                const userEnrollment = await Enrollment.findOne({
                    where: {
                        [Op.or]: [
                            { subscriber_id: userPayload.id },
                            { collection_agent_id: userPayload.id },
                            { business_agent_id: userPayload.id }
                        ],
                        delete_status: 0
                    },
                    attributes: ['company_id'],
                    order: [['createdAt', 'DESC']]
                });
                if (userEnrollment && userEnrollment.company_id) {
                    company_id = userEnrollment.company_id;
                }
            }
        }

        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const whereClause = { status: 0 }; // Only fetch active galleries (status: 0)
        if (company_id) {
            whereClause.company_id = company_id;
        }

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
            where: {
                [Op.or]: [
                    { id: payment_id },
                    { collection_agent_amount_id: payment_id }
                ]
            },
            include: [
                {
                    model: CollectionAgentAmount,
                    as: 'collection_submission',
                    required: false
                },
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
            return errorResponse(res, statusCodes.NOT_FOUND, 'Receipt not found');
        }

        const inst = payment.installment;
        const enrollment = inst.enrollment;
        const submission = payment.collection_submission;

        const isSubscriber = enrollment.subscriber_id === subscriber_id;
        const isAgentForPayment = submission && submission.collection_agent_id === subscriber_id;

        // Verify it belongs to this subscriber or was collected by this agent
        if (!isSubscriber && !isAgentForPayment) {
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
            payment_status: payment.payment_status,
            member_name: subscriber ? subscriber.name : 'Unknown',
            member_code: subscriber ? (subscriber.member_id || `#${subscriber.id}`) : null,
            company_name: company ? company.company_name : 'Bonagiri Chits',
            company_address: company ? company.company_address : '',
            subscription_amount: inst.payable_amount || (group ? (group.chit_amount / group.total_months) : 0),
            collection_agent_amounts: submission || null
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

        const documentDefinitions = [
            { key: 'aadhar', title: 'Aadhaar Card _ (Both sides)', aliases: ['aadhaar', 'aadhaar_card'] },
            { key: 'pan_card', title: 'PAN Card', aliases: ['pan'] },
            { key: 'bank_statement', title: 'Bank Statement', aliases: ['bank_id'] },
            { key: 'photos', title: "Photo's", aliases: ['photo'] },
            { key: 'bond_paper_100', title: '100 ruppees Bond Paper', aliases: ['bond_paper'] },
            { key: 'pay_slips', title: 'Pay Slips', aliases: ['pay_slip', 'salary_slips'] },
            { key: 'id_cards', title: 'ID Cards (Employee Card)', aliases: ['id_card', 'employee_card'] },
            { key: 'property_documents', title: 'Property Dcoments Zerox', aliases: ['property_documents_xerox'] },
            { key: 'cheques', title: "Cheque's", aliases: ['cheque'] }
        ];

        const result = documentDefinitions.map(def => {
            let doc = documents[def.key];
            if (!doc && def.aliases) {
                for (const alias of def.aliases) {
                    if (documents[alias]) {
                        doc = documents[alias];
                        break;
                    }
                }
            }
            doc = doc || { url: null, status: 0 };
            return {
                document_type: def.key,
                document_title: def.title,
                document_url: doc.url || null,
                status: doc.status !== undefined && doc.status !== null ? doc.status : 0
            };
        });

        return successResponse(res, statusCodes.OK, 'Member documents retrieved', { documents: result });
    } catch (error) {
        console.error('Error in getMemberDocumentsService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const uploadMemberDocumentService = async (res, body, userPayload) => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

        const { group_id, member_id, document_type, status = 1, document_url: body_doc_url } = body;

        let document_url = body_doc_url || null;

        let uploaded_by = null;
        if (userPayload && userPayload.id) {
            const memberExists = await Member.findByPk(userPayload.id);
            if (memberExists) {
                uploaded_by = userPayload.id;
            }
        }

        let docRecord = await MemberDocument.findOne({
            where: { group_id, member_id }
        });

        if (!docRecord) {
            docRecord = await MemberDocument.create({
                group_id,
                member_id,
                documents: {},
                uploaded_by,
                status: 1
            });
        }

        let documents = docRecord.documents ? { ...docRecord.documents } : {};
        let existingDoc = documents[document_type] || { url: null, status: 1 };

        if (document_url !== null) {
            existingDoc.url = document_url;
        }

        if (status !== undefined && status !== null && status !== '') {
            existingDoc.status = parseInt(status, 10);
        }
        existingDoc.uploaded_at = new Date().toISOString();

        documents[document_type] = existingDoc;

        await docRecord.update({
            documents,
            uploaded_by: uploaded_by || docRecord.uploaded_by,
            status: 1
        });

        // Notify Admin (non-blocking)
        try {
            const member = await Member.findByPk(member_id);
            if (member && member.company_id) {
                await NotificationHistory.create({
                    user_id: String(member.company_id),
                    user_type: 'STAFF',
                    company_id: member.company_id,
                    title: 'Member Document Uploaded',
                    body: `Document (${document_type}) uploaded for member ${member.first_name || 'Member'}.`,
                    data_payload: {
                        type: 'DOCUMENT_UPLOADED',
                        member_id: String(member_id),
                        group_id: String(group_id),
                        document_type
                    },
                    is_read: false
                });
            }
        } catch (notifErr) {
            console.error('[NOTIF] Failed to send document upload notification:', notifErr.message);
        }

        return successResponse(res, statusCodes.OK, 'Document uploaded successfully', {
            member_id,
            group_id,
            document_type,
            document_url: existingDoc.url,
            status: existingDoc.status,
            documents: docRecord.documents
        });
    } catch (error) {
        console.error('Error in uploadMemberDocumentService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const registerDeviceTokenService = async (res, userPayload, bodyData = {}) => {
    try {
        const fcm_token = typeof bodyData === 'string'
            ? bodyData
            : (bodyData.fcm_token || bodyData.device_token || bodyData.fcmToken || bodyData.deviceToken || bodyData.push_token || bodyData.pushToken || bodyData.token || null);
        const { platform_type, device_id, device_details } = (typeof bodyData === 'object' ? bodyData : {});
        const { normalizePlatformType } = require('../utils/platformHelper');

        const updateData = {};
        if (fcm_token) updateData.fcm_token = fcm_token;
        if (platform_type !== undefined && platform_type !== null) {
            updateData.platform_type = normalizePlatformType(platform_type);
        }
        if (device_id) updateData.device_id = device_id;
        if (device_details) {
            updateData.device_details = typeof device_details === 'object' ? JSON.stringify(device_details) : String(device_details);
        }

        await Member.update(updateData, { where: { id: userPayload.id } });
        console.log(`[DEVICE REGISTER] Member ID ${userPayload.id} registered device token (${fcm_token ? 'FCM Token Present' : 'No token'}).`);
        return successResponse(res, statusCodes.OK, 'Device token and platform registered successfully');
    } catch (error) {
        console.error('Error in registerDeviceTokenService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getNotificationHistoryService = async (res, userPayload, min = 0, max = 20, filter = 'all') => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

        const limit = parseInt(max, 10) || 20;
        const offset = parseInt(min, 10) || 0;

        const whereClause = {
            user_id: String(userPayload.id),
            user_type: 'MEMBER'
        };
        if (userPayload.company_id) {
            whereClause.company_id = userPayload.company_id;
        }

        if (filter === 'unread') {
            whereClause.is_read = false;
        } else if (filter === 'read') {
            whereClause.is_read = true;
        }

        const unreadWhere = { user_id: String(userPayload.id), user_type: 'MEMBER', is_read: false };
        if (userPayload.company_id) {
            unreadWhere.company_id = userPayload.company_id;
        }

        const unread_count = await NotificationHistory.count({
            where: unreadWhere
        });

        const { count, rows } = await NotificationHistory.findAndCountAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        return successResponse(res, statusCodes.OK, 'Notification history retrieved successfully', {
            unread_count,
            count,
            rows
        });
    } catch (error) {
        console.error('Error in getNotificationHistoryService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getNotificationBadgeCountService = async (res, userPayload) => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

        const unreadWhere = { user_id: String(userPayload.id), user_type: 'MEMBER', is_read: false };
        if (userPayload.company_id) {
            unreadWhere.company_id = userPayload.company_id;
        }

        const unread_count = await NotificationHistory.count({
            where: unreadWhere
        });

        return successResponse(res, statusCodes.OK, 'Notification badge count retrieved successfully', {
            unread_count
        });
    } catch (error) {
        console.error('Error in getNotificationBadgeCountService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const markNotificationReadService = async (res, userPayload, notification_id) => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

        const whereClause = { id: notification_id, user_id: String(userPayload.id), user_type: 'MEMBER' };
        if (userPayload.company_id) {
            whereClause.company_id = userPayload.company_id;
        }

        const notification = await NotificationHistory.findOne({
            where: whereClause
        });

        if (!notification) {
            return errorResponse(res, statusCodes.NOT_FOUND, 'Notification not found');
        }

        await notification.update({ is_read: true });

        const unreadWhere = { user_id: String(userPayload.id), user_type: 'MEMBER', is_read: false };
        if (userPayload.company_id) {
            unreadWhere.company_id = userPayload.company_id;
        }

        const unread_count = await NotificationHistory.count({
            where: unreadWhere
        });

        return successResponse(res, statusCodes.OK, 'Notification marked as read', { unread_count });
    } catch (error) {
        console.error('Error in markNotificationReadService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const markAllNotificationsReadService = async (res, userPayload) => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

        const whereClause = { user_id: String(userPayload.id), user_type: 'MEMBER', is_read: false };
        if (userPayload.company_id) {
            whereClause.company_id = userPayload.company_id;
        }

        await NotificationHistory.update(
            { is_read: true },
            { where: whereClause }
        );

        return successResponse(res, statusCodes.OK, 'All notifications marked as read', { unread_count: 0 });
    } catch (error) {
        console.error('Error in markAllNotificationsReadService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const deleteNotificationService = async (res, userPayload, notification_id, delete_all = false) => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

        const baseWhere = { user_id: String(userPayload.id), user_type: 'MEMBER' };
        if (userPayload.company_id) {
            baseWhere.company_id = userPayload.company_id;
        }

        if (delete_all) {
            await NotificationHistory.destroy({
                where: baseWhere
            });
            return successResponse(res, statusCodes.OK, 'All notifications deleted successfully', { unread_count: 0 });
        }

        if (!notification_id) {
            return errorResponse(res, statusCodes.BAD_REQUEST, 'Notification ID is required');
        }

        const deletedCount = await NotificationHistory.destroy({
            where: { ...baseWhere, id: notification_id }
        });

        if (deletedCount === 0) {
            return errorResponse(res, statusCodes.NOT_FOUND, 'Notification not found');
        }

        const unread_count = await NotificationHistory.count({
            where: { user_id: String(userPayload.id), user_type: 'MEMBER', is_read: false }
        });

        return successResponse(res, statusCodes.OK, 'Notification deleted successfully', { unread_count });
    } catch (error) {
        console.error('Error in deleteNotificationService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getGroupsByCollectionAgentIdService = async (res, reqUser, requested_agent_id) => {
    try {
        let collection_agent_id = requested_agent_id;

        if (isCollectionAgent(reqUser)) {
            collection_agent_id = reqUser.id; // Force their own ID
        } else if (reqUser.role === 'staff') {
            const agent = await Member.findOne({ where: { id: requested_agent_id, company_id: reqUser.company_id } });
            if (!agent) return errorResponse(res, statusCodes.FORBIDDEN, 'Access denied');
        } else if (reqUser.role === 'company') {
            const agent = await Member.findOne({ where: { id: requested_agent_id, company_id: reqUser.id } });
            if (!agent) return errorResponse(res, statusCodes.FORBIDDEN, 'Access denied');
        } else {
            return errorResponse(res, statusCodes.FORBIDDEN, 'Unauthorized role');
        }

        const enrollments = await Enrollment.findAll({
            where: { collection_agent_id, delete_status: 0 },
            attributes: ['group_id']
        });
        const groupIds = Array.from(new Set(enrollments.map(e => e.group_id)));

        const groups = await ChitsGroup.findAll({
            where: { id: { [Op.in]: groupIds }, is_deleted_status: 0 },
            attributes: ['id', 'group_name', 'chit_amount', 'no_of_installments']
        });

        return successResponse(res, statusCodes.OK, 'Groups retrieved successfully', groups);
    } catch (error) {
        console.error('Error in getGroupsByCollectionAgentIdService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getMembersByGroupIdService = async (res, reqUser, group_id, search, min, max) => {
    try {
        const group = await ChitsGroup.findByPk(group_id);
        if (!group) return errorResponse(res, statusCodes.NOT_FOUND, 'Group not found');

        if (reqUser.role === 'company' && group.company_id !== reqUser.id) {
            return errorResponse(res, statusCodes.FORBIDDEN, 'Access denied to this group');
        }
        if (reqUser.role === 'staff' && group.company_id !== reqUser.company_id) {
            return errorResponse(res, statusCodes.FORBIDDEN, 'Access denied to this group');
        }
        if (isCollectionAgent(reqUser)) {
            const count = await Enrollment.count({ where: { group_id, collection_agent_id: reqUser.id, delete_status: 0 } });
            if (count === 0) return errorResponse(res, statusCodes.FORBIDDEN, 'Not assigned to this group');
        }

        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        let memberWhere = {};
        if (search) {
            memberWhere = {
                [Op.or]: [
                    { name: { [Op.iLike]: `%${search}%` } },
                    { member_id: { [Op.iLike]: `%${search}%` } }
                ]
            };
        }

        const enrollments = await Enrollment.findAndCountAll({
            where: { group_id, delete_status: 0 },
            limit,
            offset,
            include: [
                {
                    model: Member,
                    as: 'subscriber',
                    where: Object.keys(memberWhere).length ? memberWhere : undefined,
                    attributes: ['id', 'name', 'member_id', ['mobile_number', 'phone_number'], ['upload_image', 'profile_image'], 'gender']
                }
            ]
        });

        const memberIds = enrollments.rows.map(e => e.subscriber ? e.subscriber.id : null).filter(Boolean);

        const activeChitsCount = await Enrollment.findAll({
            where: {
                subscriber_id: { [Op.in]: memberIds },
                delete_status: 0
            },
            attributes: ['subscriber_id', [sequelize.fn('COUNT', sequelize.col('Enrollment.id')), 'active_chits']],
            include: [
                {
                    model: ChitsGroup,
                    as: 'group',
                    attributes: [],
                    where: { chits_group_status: 1, is_deleted_status: 0 }
                }
            ],
            group: ['subscriber_id', 'group.id']
        });

        // Sum up the counts per subscriber because group by might return multiple rows per subscriber depending on postgres strictness, actually let's group by subscriber_id only. 
        // Wait, postgres might complain if group.id is in group but not in select, let's remove group from group by if possible, but sequelize might automatically add it.
        // It's safer to just aggregate in JS if needed, but since we are doing a simple count, let's just use raw query or loop.

        // Let's refine the activeChitsCount logic to avoid postgres GROUP BY errors:
        const activeChitsMap = {};
        for (const item of activeChitsCount) {
            const sid = item.subscriber_id;
            const count = parseInt(item.dataValues.active_chits, 10);
            activeChitsMap[sid] = (activeChitsMap[sid] || 0) + count;
        }

        const members = enrollments.rows.map(e => {
            if (!e.subscriber) return null;
            const memberData = e.subscriber.toJSON();
            memberData.active_chits = activeChitsMap[memberData.id] || 0;
            return memberData;
        }).filter(Boolean);

        return successResponse(res, statusCodes.OK, 'Members retrieved successfully', { count: enrollments.count, rows: members });
    } catch (error) {
        console.error('Error in getMembersByGroupIdService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getMembersByCollectionAgentIdService = async (res, collection_agent_id, search, min, max) => {
    try {
        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        let memberWhere = {};
        if (search) {
            memberWhere = {
                [Op.or]: [
                    { name: { [Op.iLike]: `%${search}%` } },
                    { member_id: { [Op.iLike]: `%${search}%` } }
                ]
            };
        }

        // To get distinct members for this collection agent
        const enrollments = await Enrollment.findAll({
            where: { collection_agent_id, delete_status: 0 },
            attributes: [[sequelize.fn('DISTINCT', sequelize.col('subscriber_id')), 'subscriber_id']],
            raw: true
        });

        const distinctSubscriberIds = enrollments.map(e => e.subscriber_id).filter(Boolean);

        const { count, rows: members } = await Member.findAndCountAll({
            where: {
                id: { [Op.in]: distinctSubscriberIds },
                ...memberWhere
            },
            limit,
            offset,
            attributes: ['id', 'name', 'member_id', 'gender', ['mobile_number', 'phone_number'], ['upload_image', 'profile_image']]
        });

        const memberIds = members.map(m => m.id);

        const activeChitsCount = await Enrollment.findAll({
            where: {
                subscriber_id: { [Op.in]: memberIds },
                delete_status: 0
            },
            attributes: ['subscriber_id', [sequelize.fn('COUNT', sequelize.col('Enrollment.id')), 'active_chits']],
            include: [
                {
                    model: ChitsGroup,
                    as: 'group',
                    attributes: [],
                    where: { chits_group_status: 1, is_deleted_status: 0 }
                }
            ],
            group: ['subscriber_id', 'group.id']
        });

        const activeChitsMap = {};
        for (const item of activeChitsCount) {
            const sid = item.subscriber_id;
            const cnt = parseInt(item.dataValues.active_chits, 10);
            activeChitsMap[sid] = (activeChitsMap[sid] || 0) + cnt;
        }

        const formattedMembers = members.map(m => {
            const memberData = m.toJSON();
            memberData.active_chits = activeChitsMap[m.id] || 0;
            return memberData;
        });

        return successResponse(res, statusCodes.OK, 'Members retrieved successfully', { count, rows: formattedMembers });
    } catch (error) {
        console.error('Error in getMembersByCollectionAgentIdService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getCustomerDetailsByIdService = async (res, payload) => {
    try {
        const { member_id } = payload;

        const member = await Member.findByPk(member_id, {
            attributes: ['id', 'name', 'member_id', 'mobile_number', 'upload_image', 'gender']
        });

        if (!member) {
            return errorResponse(res, statusCodes.BAD_REQUEST, 'Member not found');
        }

        // Get active chits
        const activeChits = await Enrollment.findAll({
            where: {
                subscriber_id: member.id
            },
            include: [{
                model: ChitsGroup,
                as: 'group',
                where: { chits_group_status: 1 },
                attributes: ['id', 'group_name']
            }],
            attributes: ['group_position_number']
        });

        const groupedChits = {};
        activeChits.forEach(chit => {
            const name = chit.group ? chit.group.group_name : 'Unknown';
            const slot = chit.group_position_number ? `#${chit.group_position_number}` : '#NA';
            if (!groupedChits[name]) {
                groupedChits[name] = [];
            }
            groupedChits[name].push(slot);
        });

        const active_chit_groups = Object.keys(groupedChits).map(name => ({
            chit_name: name,
            slot_id: groupedChits[name].join(', ')
        }));

        // Get last visit
        let visitDetails = null;
        try {
            const lastVisit = await CustomerVisit.findOne({
                where: { member_id: member.id },
                order: [['createdAt', 'DESC']],
                include: [{
                    model: Member,
                    as: 'collection_agent',
                    attributes: ['name']
                }]
            });

            if (lastVisit) {
                const formatDateTime = (dateStr) => {
                    if (!dateStr) return null;
                    const date = new Date(dateStr);
                    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const d = date.getDate().toString().padStart(2, '0');
                    const m = months[date.getMonth()];
                    const y = date.getFullYear();
                    let hours = date.getHours();
                    const minutes = date.getMinutes().toString().padStart(2, '0');
                    const ampm = hours >= 12 ? 'PM' : 'AM';
                    hours = hours % 12;
                    hours = hours ? hours : 12;
                    return `${d} ${m} ${y}, ${hours}:${minutes} ${ampm}`;
                };

                visitDetails = {
                    date_time: formatDateTime(lastVisit.createdAt),
                    visited_by: lastVisit.collection_agent ? lastVisit.collection_agent.name : null,
                    customer_vistor_status: lastVisit.customer_vistor_status,
                    customer_visitor_type: lastVisit.visitor_type
                };
            }
        } catch (dbError) {
            console.error('Error fetching CustomerVisit (table might not exist):', dbError.message);
        }

        const responseData = {
            member_name: member.name,
            member_id: member.member_id,
            member_phone_number: member.mobile_number,
            gender: member.gender,
            profile_image: member.upload_image,
            active_chit_groups_count: active_chit_groups.length,
            active_chit_groups: active_chit_groups,
            last_visit: visitDetails
        };

        return successResponse(res, statusCodes.OK, 'Customer details retrieved successfully', responseData);
    } catch (error) {
        console.error('Error in getCustomerDetailsByIdService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getVisitHistoryService = async (res, payload) => {
    try {
        const { member_id, min, max } = payload;
        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const member = await Member.findByPk(member_id, {
            attributes: ['id', 'name', 'member_id', 'mobile_number', 'upload_image', 'gender']
        });

        if (!member) {
            return errorResponse(res, statusCodes.BAD_REQUEST, 'Member not found');
        }

        let visits = { count: 0, rows: [] };
        try {
            visits = await CustomerVisit.findAndCountAll({
                where: { member_id: member.id },
                limit,
                offset,
                order: [['createdAt', 'DESC']],
                include: [{
                    model: Member,
                    as: 'collection_agent',
                    attributes: ['name']
                }]
            });
        } catch (dbError) {
            console.error('Error fetching CustomerVisit history (table might not exist):', dbError.message);
        }

        const formatDateTime = (dateStr) => {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const d = date.getDate().toString().padStart(2, '0');
            const m = months[date.getMonth()];
            const y = date.getFullYear();
            let hours = date.getHours();
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
            return `${d} ${m} ${y}, ${hours}:${minutes} ${ampm}`;
        };

        const formattedVisits = visits.rows.map(visit => ({
            id: visit.id,
            date_time: formatDateTime(visit.createdAt),
            visited_by: visit.collection_agent ? visit.collection_agent.name : null,
            customer_vistor_status: visit.customer_vistor_status,
            customer_visitor_type: visit.visitor_type
        }));

        const responseData = {
            member_name: member.name,
            member_id: member.member_id,
            member_phone_number: member.mobile_number,
            gender: member.gender,
            upload_image: member.upload_image,
            visits_count: visits.count,
            visits: formattedVisits
        };

        return successResponse(res, statusCodes.OK, 'Visit history retrieved successfully', responseData);
    } catch (error) {
        console.error('Error in getVisitHistoryService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getVisitDetailsByIdService = async (res, payload) => {
    try {
        const { visit_id } = payload;

        const visit = await CustomerVisit.findByPk(visit_id, {
            include: [{
                model: Member,
                as: 'collection_agent',
                attributes: ['name', 'member_id']
            }]
        });

        if (!visit) {
            return errorResponse(res, statusCodes.NOT_FOUND, 'Visit not found');
        }

        const formatDateTime = (dateStr) => {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const d = date.getDate().toString().padStart(2, '0');
            const m = months[date.getMonth()];
            const y = date.getFullYear();
            let hours = date.getHours();
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
            return `${d} ${m} ${y}, ${hours}:${minutes} ${ampm}`;
        };

        const responseData = {
            id: visit.id,
            date_time: formatDateTime(visit.createdAt),
            visited_by: visit.collection_agent ? `${visit.collection_agent.name} (Agent)` : null,
            agent_id: visit.collection_agent ? visit.collection_agent.member_id : null,
            visit_type: visit.visitor_type,
            proof_photo: visit.upload_proof,
            remarks: visit.remarks,
            customer_vistor_status: visit.customer_vistor_status
        };

        return successResponse(res, statusCodes.OK, 'Visit details retrieved successfully', responseData);
    } catch (error) {
        console.error('Error in getVisitDetailsByIdService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const storeCustomerVisitService = async (res, payload) => {
    try {
        const { member_id, collection_agent_id, visitor_type, upload_proof, remarks, customer_vistor_status } = payload;

        // Verify member and collection agent exist
        const member = await Member.findByPk(member_id);
        if (!member) {
            return errorResponse(res, statusCodes.BAD_REQUEST, 'Member not found');
        }

        const agent = await Member.findByPk(collection_agent_id);
        if (!agent) {
            return errorResponse(res, statusCodes.BAD_REQUEST, 'Collection Agent not found');
        }

        const newVisit = await CustomerVisit.create({
            member_id,
            collection_agent_id,
            visitor_type,
            upload_proof,
            remarks,
            customer_vistor_status: customer_vistor_status || 0
        });

        // Notify Admin (non-blocking)
        try {
            if (member.company_id) {
                await NotificationHistory.create({
                    user_id: String(member.company_id),
                    user_type: 'STAFF',
                    company_id: member.company_id,
                    title: 'Customer Visit Logged',
                    body: `Agent ${agent.first_name || agent.name || 'Collection Agent'} logged a visit for member ${member.first_name || 'Member'}.`,
                    data_payload: {
                        type: 'CUSTOMER_VISIT',
                        visit_id: String(newVisit.id),
                        member_id: String(member_id),
                        collection_agent_id: String(collection_agent_id)
                    },
                    is_read: false
                });
            }
        } catch (notifErr) {
            console.error('[NOTIF] Failed to send customer visit notification:', notifErr.message);
        }

        return successResponse(res, statusCodes.OK, 'Customer visit stored successfully', newVisit);
    } catch (error) {
        console.error('Error in storeCustomerVisitService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getMemberLedgerService = async (res, reqUser, payload) => {
    try {
        const { member_id, from_date, to_date } = payload;

        let isAllowed = false;
        if (reqUser.id === member_id) {
            isAllowed = true;
        } else if (reqUser.role === 'staff' || reqUser.role === 'company') {
            const member = await Member.findByPk(member_id);
            if (!member) return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
            const compId = reqUser.role === 'staff' ? reqUser.company_id : reqUser.id;
            if (member.company_id === compId) {
                isAllowed = true;
            }
        } else if (isCollectionAgent(reqUser)) {
            const count = await Enrollment.count({
                where: { subscriber_id: member_id, collection_agent_id: reqUser.id, delete_status: 0 }
            });
            if (count > 0) isAllowed = true;
        }

        if (!isAllowed) {
            return errorResponse(res, statusCodes.FORBIDDEN, 'Access denied to this ledger');
        }

        let whereClause = { payment_status: 1 }; // Only confirmed payments usually appear in ledger, or remove if they want pending too. Let's fetch all (0 or 1). Actually, we'll fetch all and show status.
        whereClause = {};

        if (from_date && to_date) {
            const start = new Date(from_date);
            start.setUTCHours(0, 0, 0, 0);
            const end = new Date(to_date);
            end.setUTCHours(23, 59, 59, 999);
            whereClause.createdAt = {
                [Op.between]: [start, end]
            };
        } else if (from_date) {
            const start = new Date(from_date);
            start.setUTCHours(0, 0, 0, 0);
            whereClause.createdAt = { [Op.gte]: start };
        } else if (to_date) {
            const end = new Date(to_date);
            end.setUTCHours(23, 59, 59, 999);
            whereClause.createdAt = { [Op.lte]: end };
        }

        const payments = await CustomerPayment.findAll({
            where: whereClause,
            include: [
                {
                    model: CollectionAgentAmount,
                    as: 'collection_submission',
                    required: false,
                    include: [
                        {
                            model: Member,
                            as: 'collection_agent',
                            attributes: ['id', 'name', 'rep_by_first_name', 'sur_name', 'other_info_user_code', 'member_id'],
                            required: false
                        }
                    ]
                },
                {
                    model: ChitsInstallment,
                    as: 'installment',
                    required: true,
                    include: [
                        {
                            model: Enrollment,
                            as: 'enrollment',
                            required: true,
                            where: { subscriber_id: member_id, delete_status: 0 },
                            include: [
                                {
                                    model: ChitsGroup,
                                    as: 'group',
                                    required: true
                                },
                                {
                                    model: Member,
                                    as: 'collection_agent',
                                    attributes: ['id', 'name', 'rep_by_first_name', 'sur_name', 'other_info_user_code', 'member_id'],
                                    required: false
                                }
                            ]
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        const groupedData = {};

        payments.forEach(payment => {
            const dateObj = new Date(payment.createdAt || payment.payment_date);
            const dateKey = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); // e.g. "23 Jun 2026"
            const timeKey = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); // e.g. "10:42 AM"

            if (!groupedData[dateKey]) {
                groupedData[dateKey] = {
                    date: dateKey,
                    is_today: new Date().toDateString() === dateObj.toDateString(),
                    total_paid: 0,
                    transactions: []
                };
            }

            const received = parseFloat(payment.received_amount) || 0;
            const penalty = parseFloat(payment.penalty_paid) || 0;
            const amount = received + penalty;
            groupedData[dateKey].total_paid += amount;

            const group = payment.installment?.enrollment?.group;

            let collectionAgentName = null;
            if (payment.collection_submission && payment.collection_submission.collection_agent) {
                const ca = payment.collection_submission.collection_agent;
                collectionAgentName = ca.name || `${ca.rep_by_first_name || ''} ${ca.sur_name || ''}`.trim() || null;
            } else if (payment.recorded_by_name) {
                collectionAgentName = payment.recorded_by_name;
            } else if (payment.installment?.enrollment?.collection_agent) {
                const ca = payment.installment.enrollment.collection_agent;
                collectionAgentName = ca.name || `${ca.rep_by_first_name || ''} ${ca.sur_name || ''}`.trim() || null;
            }

            let paymentModeStr = 'Unknown';
            if (payment.payment_mode === 1) paymentModeStr = 'Cash';
            else if (payment.payment_mode === 2) paymentModeStr = 'UPI';
            else if (payment.payment_mode === 3) paymentModeStr = 'Cheque';
            else if (payment.payment_mode === 4) paymentModeStr = 'Bank Transfer';
            else if (payment.payment_mode === 5) paymentModeStr = 'Others';

            groupedData[dateKey].transactions.push({
                payment_id: payment.id,
                receipt_id: payment.receipt_number || null,
                group_name: group ? group.group_name : 'No Group',
                chit_id: group ? group.chit_id : null,
                group_number: group && group.group_name ? group.group_name.split('-').pop() : '00', // Mocking group number if not exact field
                time: timeKey,
                amount: amount,
                payment_mode: paymentModeStr,
                status: payment.payment_status,
                collection_agent_name: collectionAgentName
            });
        });

        // Convert object to array
        const resultData = Object.values(groupedData).map(item => {
            item.total_paid = parseFloat(item.total_paid.toFixed(2));
            return item;
        });

        // Ensure "Today" label for is_today
        resultData.forEach(item => {
            if (item.is_today) {
                item.date = `${item.date} (Today)`;
            }
        });

        return successResponse(res, statusCodes.OK, 'Ledger retrieved successfully', resultData);

    } catch (error) {
        console.error('Error in getMemberLedgerService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const referMemberService = async (res, userPayload, payload) => {
    try {
        const { name, mobile_number } = payload;

        // userPayload.id is the ID of the logged in user/member
        const refer_by_user_id = userPayload.id;

        const newReferral = await MemberReferral.create({
            refer_by_user_id,
            name,
            mobile_number,
            status: 0
        });

        // Dispatch notification to Admin ONLY (referrer does not get self-notification)
        try {
            const referrer = await Member.findByPk(refer_by_user_id) || await StaffUser.findByPk(refer_by_user_id);
            const referrerName = referrer?.name || referrer?.rep_by_first_name || 'A user';
            const companyId = referrer?.company_id;

            if (companyId) {
                await NotificationHistory.create({
                    user_id: String(companyId),
                    user_type: 'STAFF',
                    company_id: companyId,
                    title: 'New Customer Referral',
                    body: `${referrerName} referred new customer: ${name} (${mobile_number}).`,
                    data_payload: {
                        type: 'NEW_REFERRAL',
                        referral_id: String(newReferral.id),
                        refer_by_user_id: String(refer_by_user_id),
                        name,
                        mobile_number
                    },
                    is_read: false
                });
            }
        } catch (notifErr) {
            console.error('[NOTIF] Failed to send referral notification:', notifErr.message);
        }

        return successResponse(res, statusCodes.CREATED, 'Referral submitted successfully', newReferral);
    } catch (error) {
        console.error('Error in referMemberService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getMyReferralsService = async (res, userPayload, min = 0, max = 10, search = '') => {
    try {
        const limit = parseInt(max, 10);
        const offset = parseInt(min, 10);

        const refer_by_user_id = userPayload.id;

        const whereClause = { refer_by_user_id };

        if (search) {
            whereClause.name = { [Op.iLike]: `%${search}%` };
        }

        const { count, rows } = await MemberReferral.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [['createdAt', 'DESC']]
        });

        return successResponse(res, statusCodes.OK, 'Referrals retrieved successfully', { count, rows });
    } catch (error) {
        console.error('Error in getMyReferralsService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getBusinessAgentTotalCommissionService = async (res, business_agent_id, min, max, search) => {
    try {
        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const configRecords = await ConfigureBusinessAgentCommission.findAll({
            where: { business_agent_id, is_deleted_status: 0 },
            include: [
                {
                    model: ChitsGroup,
                    as: 'group',
                    where: { is_deleted_status: 0 },
                    required: true
                },
                {
                    model: Member,
                    as: 'member',
                    where: { is_deleted_status: 0 },
                    attributes: ['id', 'name', 'member_id', 'upload_image', 'mobile_number', 'gender', 'other_info_user_code'],
                    required: true
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        let filteredConfigs = configRecords;
        if (search && search.trim() !== '') {
            const term = search.trim().toLowerCase();
            filteredConfigs = configRecords.filter(c => {
                const gName = (c.group && c.group.group_name) ? c.group.group_name.toLowerCase() : '';
                const mName = (c.member && c.member.name) ? c.member.name.toLowerCase() : '';
                const mCode = (c.member && c.member.member_id) ? c.member.member_id.toLowerCase() : '';
                const mPhone = (c.member && c.member.mobile_number) ? c.member.mobile_number.toLowerCase() : '';
                return gName.includes(term) || mName.includes(term) || mCode.includes(term) || mPhone.includes(term);
            });
        }

        const groupMap = {};
        let overallTotalCommission = 0;
        const overallMembersSet = new Set();

        filteredConfigs.forEach(c => {
            const group = c.group;
            const member = c.member;
            const commissionAmt = parseFloat(c.commission_amount) || 0;

            if (!groupMap[group.id]) {
                groupMap[group.id] = {
                    group_id: group.id,
                    group_name: group.group_name || 'Unknown Chit',
                    chit_amount: parseFloat(group.chit_amount) || 0,
                    total_commission_amount: 0,
                    members_count: 0,
                    membersMap: {}
                };
            }

            if (!groupMap[group.id].membersMap[member.id]) {
                groupMap[group.id].membersMap[member.id] = {
                    id: member.id,
                    name: member.name || 'Unknown',
                    member_id: member.member_id || (member.other_info_user_code ? `MEM-${member.other_info_user_code}` : `#${member.id}`),
                    profile_image: member.upload_image || null,
                    mobile_number: member.mobile_number || null,
                    gender: member.gender || null,
                    commission_amount: 0
                };
            }

            groupMap[group.id].membersMap[member.id].commission_amount = parseFloat(((groupMap[group.id].membersMap[member.id].commission_amount || 0) + commissionAmt).toFixed(2));
            groupMap[group.id].total_commission_amount = parseFloat(((groupMap[group.id].total_commission_amount || 0) + commissionAmt).toFixed(2));
            overallTotalCommission = parseFloat((overallTotalCommission + commissionAmt).toFixed(2));
            overallMembersSet.add(member.id);
        });

        const allGroupRows = Object.values(groupMap).map(g => {
            const members = Object.values(g.membersMap);
            return {
                group_id: g.group_id,
                group_name: g.group_name,
                chit_amount: parseFloat(g.chit_amount) || 0,
                total_commission_amount: parseFloat(g.total_commission_amount) || 0,
                members_count: members.length,
                members
            };
        });

        const totalGroupsCount = allGroupRows.length;
        const paginatedRows = allGroupRows.slice(offset, offset + limit);

        return successResponse(res, statusCodes.OK, 'Total commission retrieved successfully', {
            total_commission_amount: overallTotalCommission,
            from_groups_count: totalGroupsCount,
            from_members_count: overallMembersSet.size,
            count: totalGroupsCount,
            rows: paginatedRows
        });
    } catch (error) {
        console.error('Error in getBusinessAgentTotalCommissionService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getBusinessAgentPaidCommissionService = async (res, business_agent_id, min, max, search, from_date, to_date) => {
    try {
        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const configRecords = await ConfigureBusinessAgentCommission.findAll({
            where: { business_agent_id, is_deleted_status: 0 },
            include: [
                { model: ChitsGroup, as: 'group', where: { is_deleted_status: 0 }, required: true },
                { model: Member, as: 'member', where: { is_deleted_status: 0 }, attributes: ['id', 'name', 'member_id', 'upload_image', 'mobile_number', 'gender', 'other_info_user_code'], required: true }
            ]
        });

        const configIds = configRecords.map(c => c.id);

        if (configIds.length === 0) {
            return successResponse(res, statusCodes.OK, 'Paid commission retrieved successfully', {
                total_paid_commission: 0,
                from_groups_count: 0,
                from_members_count: 0,
                count: 0,
                rows: []
            });
        }

        const historyWhere = {
            configure_business_agent_id: { [Op.in]: configIds },
            is_deleted_status: 0,
            paid_amount: { [Op.gt]: 0 }
        };

        if (from_date && to_date) {
            const start = new Date(from_date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(to_date);
            end.setHours(23, 59, 59, 999);
            historyWhere.createdAt = { [Op.between]: [start, end] };
        } else if (from_date) {
            const start = new Date(from_date);
            start.setHours(0, 0, 0, 0);
            historyWhere.createdAt = { [Op.gte]: start };
        } else if (to_date) {
            const end = new Date(to_date);
            end.setHours(23, 59, 59, 999);
            historyWhere.createdAt = { [Op.lte]: end };
        }

        const histories = await HistoryBusinessAgent.findAll({
            where: historyWhere,
            order: [['createdAt', 'DESC']]
        });

        const formatDateDMY = (dateInput) => {
            if (!dateInput) return '';
            const d = new Date(dateInput);
            if (isNaN(d.getTime())) return String(dateInput);
            const day = d.getDate();
            const month = d.getMonth() + 1;
            const year = String(d.getFullYear()).slice(-2);
            return `${day}/${month}/${year}`;
        };

        const groupMap = {};
        let overallTotalPaid = 0;
        const overallMembersSet = new Set();

        histories.forEach(h => {
            const config = configRecords.find(c => c.id === h.configure_business_agent_id);
            if (!config || !config.group || !config.member) return;

            const group = config.group;
            const member = config.member;
            const paid = parseFloat(h.paid_amount) || 0;
            if (paid <= 0) return;

            if (search && search.trim() !== '') {
                const term = search.trim().toLowerCase();
                const gName = (group.group_name || '').toLowerCase();
                const mName = (member.name || '').toLowerCase();
                const mCode = (member.member_id || '').toLowerCase();
                const mPhone = (member.mobile_number || '').toLowerCase();
                if (!gName.includes(term) && !mName.includes(term) && !mCode.includes(term) && !mPhone.includes(term)) {
                    return;
                }
            }

            if (!groupMap[group.id]) {
                groupMap[group.id] = {
                    group_id: group.id,
                    group_name: group.group_name || 'Unknown Chit',
                    chit_amount: parseFloat(group.chit_amount) || 0,
                    paid_commission_amount: 0,
                    members_count: 0,
                    membersMap: {}
                };
            }

            const rawDate = h.createdAt ? new Date(h.createdAt).toISOString().split('T')[0] : '';

            if (!groupMap[group.id].membersMap[member.id]) {
                groupMap[group.id].membersMap[member.id] = {
                    id: member.id,
                    name: member.name || 'Unknown',
                    member_id: member.member_id || (member.other_info_user_code ? `MEM-${member.other_info_user_code}` : `#${member.id}`),
                    profile_image: member.upload_image || null,
                    mobile_number: member.mobile_number || null,
                    paid_amount: 0,
                    payment_date: rawDate,
                    formatted_date: formatDateDMY(rawDate),
                    payment_mode_label: 'Cash',
                    upload_document: h.upload_document || null
                };
            }

            groupMap[group.id].membersMap[member.id].paid_amount = parseFloat(((groupMap[group.id].membersMap[member.id].paid_amount || 0) + paid).toFixed(2));
            groupMap[group.id].paid_commission_amount = parseFloat(((groupMap[group.id].paid_commission_amount || 0) + paid).toFixed(2));
            overallTotalPaid = parseFloat((overallTotalPaid + paid).toFixed(2));
            overallMembersSet.add(member.id);
        });

        const allGroupRows = Object.values(groupMap).map(g => {
            const members = Object.values(g.membersMap);
            return {
                group_id: g.group_id,
                group_name: g.group_name,
                chit_amount: parseFloat(g.chit_amount) || 0,
                paid_commission_amount: parseFloat(g.paid_commission_amount) || 0,
                members_count: members.length,
                members
            };
        });

        const totalGroupsCount = allGroupRows.length;
        const paginatedRows = allGroupRows.slice(offset, offset + limit);

        return successResponse(res, statusCodes.OK, 'Paid commission retrieved successfully', {
            total_paid_commission: overallTotalPaid,
            from_groups_count: totalGroupsCount,
            from_members_count: overallMembersSet.size,
            count: totalGroupsCount,
            rows: paginatedRows
        });
    } catch (error) {
        console.error('Error in getBusinessAgentPaidCommissionService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getBusinessAgentPendingCommissionService = async (res, business_agent_id, min, max, search, from_date, to_date) => {
    try {
        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const configWhere = {
            business_agent_id,
            is_deleted_status: 0
        };

        if (from_date && to_date) {
            const start = new Date(from_date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(to_date);
            end.setHours(23, 59, 59, 999);
            configWhere.createdAt = { [Op.between]: [start, end] };
        } else if (from_date) {
            const start = new Date(from_date);
            start.setHours(0, 0, 0, 0);
            configWhere.createdAt = { [Op.gte]: start };
        } else if (to_date) {
            const end = new Date(to_date);
            end.setHours(23, 59, 59, 999);
            configWhere.createdAt = { [Op.lte]: end };
        }

        const configRecords = await ConfigureBusinessAgentCommission.findAll({
            where: configWhere,
            include: [
                { model: ChitsGroup, as: 'group', where: { is_deleted_status: 0 }, required: true },
                { model: Member, as: 'member', where: { is_deleted_status: 0 }, attributes: ['id', 'name', 'member_id', 'upload_image', 'mobile_number', 'gender', 'other_info_user_code'], required: true }
            ]
        });

        const configIds = configRecords.map(c => c.id);

        let allHistories = [];
        if (configIds.length > 0) {
            allHistories = await HistoryBusinessAgent.findAll({
                where: { configure_business_agent_id: { [Op.in]: configIds }, is_deleted_status: 0 },
                raw: true
            });
        }

        const groupMap = {};
        let overallTotalPending = 0;
        const overallMembersSet = new Set();

        configRecords.forEach(c => {
            const group = c.group;
            const member = c.member;
            const commission = parseFloat(c.commission_amount) || 0;

            const paid = allHistories
                .filter(h => h.configure_business_agent_id === c.id)
                .reduce((sum, h) => sum + (parseFloat(h.paid_amount) || 0), 0);

            const pending = Math.max(0, commission - paid);
            if (pending <= 0) return;

            if (search && search.trim() !== '') {
                const term = search.trim().toLowerCase();
                const gName = (group.group_name || '').toLowerCase();
                const mName = (member.name || '').toLowerCase();
                const mCode = (member.member_id || '').toLowerCase();
                const mPhone = (member.mobile_number || '').toLowerCase();
                if (!gName.includes(term) && !mName.includes(term) && !mCode.includes(term) && !mPhone.includes(term)) {
                    return;
                }
            }

            if (!groupMap[group.id]) {
                groupMap[group.id] = {
                    group_id: group.id,
                    group_name: group.group_name || 'Unknown Chit',
                    chit_amount: parseFloat(group.chit_amount) || 0,
                    pending_commission_amount: 0,
                    pending_members_count: 0,
                    membersMap: {}
                };
            }

            if (!groupMap[group.id].membersMap[member.id]) {
                groupMap[group.id].membersMap[member.id] = {
                    id: member.id,
                    name: member.name || 'Unknown',
                    member_id: member.member_id || (member.other_info_user_code ? `MEM-${member.other_info_user_code}` : `#${member.id}`),
                    profile_image: member.upload_image || null,
                    mobile_number: member.mobile_number || null,
                    gender: member.gender || null,
                    pending_commission_amount: 0
                };
            }

            groupMap[group.id].membersMap[member.id].pending_commission_amount = parseFloat(((groupMap[group.id].membersMap[member.id].pending_commission_amount || 0) + pending).toFixed(2));
            groupMap[group.id].pending_commission_amount = parseFloat(((groupMap[group.id].pending_commission_amount || 0) + pending).toFixed(2));
            overallTotalPending = parseFloat((overallTotalPending + pending).toFixed(2));
            overallMembersSet.add(member.id);
        });

        const allGroupRows = Object.values(groupMap).map(g => {
            const members = Object.values(g.membersMap);
            return {
                group_id: g.group_id,
                group_name: g.group_name,
                chit_amount: parseFloat(g.chit_amount) || 0,
                pending_commission_amount: parseFloat(g.pending_commission_amount) || 0,
                pending_members_count: members.length,
                members
            };
        });

        const totalGroupsCount = allGroupRows.length;
        const paginatedRows = allGroupRows.slice(offset, offset + limit);

        return successResponse(res, statusCodes.OK, 'Pending commission retrieved successfully', {
            total_pending_commission: overallTotalPending,
            from_groups_count: totalGroupsCount,
            from_members_count: overallMembersSet.size,
            count: totalGroupsCount,
            rows: paginatedRows
        });
    } catch (error) {
        console.error('Error in getBusinessAgentPendingCommissionService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getBusinessAgentMemberJoinedService = async (res, business_agent_id, min, max, search) => {
    try {
        const limit = parseInt(max, 10) || 10;
        const offset = parseInt(min, 10) || 0;

        const enrollments = await Enrollment.findAll({
            where: {
                business_agent_id,
                delete_status: 0
            },
            include: [
                {
                    model: Member,
                    as: 'subscriber',
                    where: { is_deleted_status: 0 },
                    attributes: ['id', 'name', 'member_id', 'upload_image', 'mobile_number', 'gender', 'other_info_user_code', 'registration_date', 'createdAt'],
                    required: true
                },
                {
                    model: ChitsGroup,
                    as: 'group',
                    where: { is_deleted_status: 0 },
                    required: true
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        const formatDateDMY = (dateInput) => {
            if (!dateInput) return '';
            const d = new Date(dateInput);
            if (isNaN(d.getTime())) return String(dateInput);
            const day = d.getDate();
            const month = d.getMonth() + 1;
            const year = String(d.getFullYear()).slice(-2);
            return `${day}/${month}/${year}`;
        };

        const groupMap = {};
        let overallTotalMembers = 0;
        const overallMembersSet = new Set();

        enrollments.forEach(e => {
            const group = e.group;
            const subscriber = e.subscriber;
            if (!group || !subscriber) return;

            if (search && search.trim() !== '') {
                const term = search.trim().toLowerCase();
                const gName = (group.group_name || '').toLowerCase();
                const mName = (subscriber.name || '').toLowerCase();
                const mCode = (subscriber.member_id || '').toLowerCase();
                const mPhone = (subscriber.mobile_number || '').toLowerCase();
                if (!gName.includes(term) && !mName.includes(term) && !mCode.includes(term) && !mPhone.includes(term)) {
                    return;
                }
            }

            if (!groupMap[group.id]) {
                groupMap[group.id] = {
                    group_id: group.id,
                    group_name: group.group_name || 'Unknown Chit',
                    chit_amount: parseFloat(group.chit_amount) || 0,
                    members_count: 0,
                    members: []
                };
            }

            const rawJoinedDate = e.enrollment_date || (e.createdAt ? new Date(e.createdAt).toISOString().split('T')[0] : '');

            groupMap[group.id].members.push({
                id: subscriber.id,
                name: subscriber.name || 'Unknown',
                member_id: subscriber.member_id || (subscriber.other_info_user_code ? `MEM-${subscriber.other_info_user_code}` : `#${subscriber.id}`),
                profile_image: subscriber.upload_image || null,
                mobile_number: subscriber.mobile_number || null,
                gender: subscriber.gender || null,
                joined_date: rawJoinedDate,
                formatted_joined_date: formatDateDMY(rawJoinedDate)
            });

            groupMap[group.id].members_count += 1;
            overallTotalMembers += 1;
            overallMembersSet.add(subscriber.id);
        });

        const allGroupRows = Object.values(groupMap);
        const totalGroupsCount = allGroupRows.length;
        const paginatedRows = allGroupRows.slice(offset, offset + limit);

        return successResponse(res, statusCodes.OK, 'Members joined retrieved successfully', {
            total_members_joined: overallTotalMembers,
            total_unique_members: overallMembersSet.size,
            from_groups_count: totalGroupsCount,
            count: totalGroupsCount,
            rows: paginatedRows
        });
    } catch (error) {
        console.error('Error in getBusinessAgentMemberJoinedService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getChitTypesService = async (res, reqBody) => {
    try {
        const { min, max } = reqBody || {};

        const whereClause = { is_deleted_status: 0, status: 1 };

        const queryOptions = {
            where: whereClause,
            attributes: ['id', 'name', 'description', 'bg_color', 'image', 'auction_type', 'status', 'display_order'],
            order: [['display_order', 'ASC'], ['id', 'ASC']]
        };

        if (max) {
            queryOptions.limit = parseInt(max, 10);
            queryOptions.offset = parseInt(min, 10) || 0;
        }

        const chitTypes = await ChitType.findAndCountAll(queryOptions);

        return successResponse(res, statusCodes.OK, 'Chit types retrieved successfully', chitTypes);
    } catch (error) {
        console.error('Error in getChitTypesService:', error);
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
    getChitTypesService,
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
    getNotificationBadgeCountService,
    markNotificationReadService,
    markAllNotificationsReadService,
    deleteNotificationService,
    getMemberDocumentsService,
    uploadMemberDocumentService,
    getGroupsByCollectionAgentIdService,
    getMembersByGroupIdService,
    getMembersByCollectionAgentIdService,
    getCustomerDetailsByIdService,
    getVisitHistoryService,
    getVisitDetailsByIdService,
    storeCustomerVisitService,
    getMemberLedgerService,
    referMemberService,
    getMyReferralsService,
    getTotalPendingCollectionService,
    getTodayCollectionService,
    getBusinessAgentTotalCommissionService,
    getBusinessAgentPaidCommissionService,
    getBusinessAgentPendingCommissionService,
    getBusinessAgentMemberJoinedService
};
