const statusCodes = require('../utils/statusCodes');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const {
    Country, State, District, City, StaticDropdownsList, StaticDropdownSubcategoryList,
    Member, Route, Area, ChitsGroup, Company, ChitsInstallment, Enrollment,
    UpcomingChit, UpcomingChitInterest, CustomerPayment, GroupUnderStaticList,
    Auction, CollectionAgentAmount, FixedSchemeChitsConfiguration,
    NotificationHistory, MemberDocument, CustomerVisit, Gallery, MemberReferral,
    ConfigureBusinessAgentCommission, HistoryBusinessAgent, ChitType, StaffUser,
    Banner, EnrollmentJointHolder, sequelize
} = require('../models');
const { Op } = require('sequelize');
const { memberTicketsInGroup, ticketWin, holderNamesByEnrollment } = require('../utils/jointHolders');
const { generateReceiptNumber } = require('../utils/receiptGenerator');
const { getSchemeWinningAmount, getSchemeOriginalAmount, dividendMonthOf, lastInstalmentDate } = require('../utils/schemeHelpers');

// ---- Joint enrollment: a member's tickets are the ones they hold as main holder
// (Enrollment.subscriber_id) or as an active joint holder.
const jointEnrollmentIds = async (memberId) => {
    const rows = await EnrollmentJointHolder.findAll({
        where: { member_id: memberId, removed_on: null },
        attributes: ['enrollment_id']
    });
    return rows.map((r) => r.enrollment_id);
};

/** Enrollment `where` fragment matching every ticket the member holds. */
const ticketHolderWhere = async (memberId) => {
    const ids = await jointEnrollmentIds(memberId);
    return ids.length
        ? { [Op.or]: [{ subscriber_id: memberId }, { id: { [Op.in]: ids } }] }
        : { subscriber_id: memberId };
};

/** Ids of the auctions won by these tickets (each ticket wins at most once). */
const auctionIdsWonBy = async (tickets) => {
    const ids = new Set();
    for (const t of tickets) {
        const win = await ticketWin(t);
        if (win) ids.add(win.id);
    }
    return ids;
};

/** Does the member hold this ticket (as main or joint holder)? */
const isTicketHolder = async (enrollment, memberId) => {
    if (!enrollment) return false;
    if (Number(enrollment.subscriber_id) === Number(memberId)) return true;
    const row = await EnrollmentJointHolder.findOne({ where: { enrollment_id: enrollment.id, member_id: memberId, removed_on: null } });
    return !!row;
};

/**
 * Format penalty display text showing breakdown: Penalty ₹[dailyRate] * [days] = ₹[totalPenalty]
 */
const formatPenaltyCalculationText = (penaltyAmount, days = 0) => {
    const pen = parseFloat(penaltyAmount) || 0;
    if (pen <= 0) return null;
    const d = parseInt(days, 10) || 0;
    if (d > 1) {
        const dailyRate = parseFloat((pen / d).toFixed(2));
        return `₹${dailyRate} * ${d} days = ₹${parseFloat(pen.toFixed(2))}`;
    } else if (d === 1) {
        return `₹${parseFloat(pen.toFixed(2))} * 1 day = ₹${parseFloat(pen.toFixed(2))}`;
    }
    return `₹${parseFloat(pen.toFixed(2))}`;
};

/**
 * For each ticket, the names of the member's co-holders ("Joint with …").
 * Returns { [enrollmentId]: ['Name', …] }; tickets with no co-holders are absent.
 */
const coHolderNames = async (enrollmentIds, memberId) => {
    if (!enrollmentIds.length) return {};
    const enrollments = await Enrollment.findAll({
        where: { id: { [Op.in]: enrollmentIds } },
        attributes: ['id', 'subscriber_id'],
        include: [
            { model: Member, as: 'subscriber', attributes: ['id', 'name'] },
            { model: EnrollmentJointHolder, as: 'joint_holders', required: false, where: { removed_on: null }, attributes: ['member_id'], include: [{ model: Member, as: 'member', attributes: ['id', 'name'] }] }
        ]
    });
    const out = {};
    enrollments.forEach((e) => {
        const holders = [
            e.subscriber ? { id: e.subscriber.id, name: e.subscriber.name } : null,
            ...(e.joint_holders || []).map((j) => (j.member ? { id: j.member.id, name: j.member.name } : null))
        ].filter(Boolean);
        if (holders.length < 2) return;
        const others = holders.filter((h) => Number(h.id) !== Number(memberId)).map((h) => h.name);
        if (others.length) out[e.id] = others;
    });
    return out;
};

/**
 * Extract all holders for an enrollment with their share details.
 */
const getEnrollmentHolders = (enr) => {
    const holders = [];
    const mainSub = enr.subscriber;
    const jointList = (enr.joint_holders || []).filter(j => !j.removed_on);
    const jointTotalShare = jointList.reduce((sum, j) => sum + (parseFloat(j.share_percentage || j.share_percent) || 0), 0);
    const mainShare = parseFloat(enr.main_holder_share) || (jointList.length > 0 ? Math.max(0, 100 - jointTotalShare) : 100);
    if (mainSub) {
        holders.push({
            member: mainSub,
            member_id: mainSub.id,
            name: mainSub.name || `${mainSub.rep_by_first_name || ''} ${mainSub.sur_name || ''}`.trim() || 'Unknown',
            sharePercent: mainShare,
            shareRatio: mainShare / 100
        });
    }
    jointList.forEach(j => {
        if (j.member) {
            const share = parseFloat(j.share_percentage || j.share_percent) || 0;
            holders.push({
                member: j.member,
                member_id: j.member.id,
                name: j.member.name || `${j.member.rep_by_first_name || ''} ${j.member.sur_name || ''}`.trim() || 'Unknown',
                sharePercent: share,
                shareRatio: share / 100
            });
        }
    });
    return holders;
};

/**
 * Calculate dues, payments, pending balances, and penalties per holder on an installment.
 */
const getHolderInstallmentDues = (inst, enrollment, holders, relatedPayments, simulatedNow = null, overridePayable = null) => {
    let totalPayable = 0;
    if (overridePayable != null) {
        totalPayable = parseFloat(overridePayable) || 0;
    } else if (inst && parseFloat(inst.payable_amount) > 0) {
        totalPayable = parseFloat(inst.payable_amount);
    } else if (enrollment && enrollment.group) {
        const grp = enrollment.group;
        totalPayable = parseFloat(grp.installment_amount) || ((parseFloat(grp.chit_amount) || 0) / (parseInt(grp.no_of_installments, 10) || 12)) || 0;
    }
    if (isNaN(totalPayable) || totalPayable < 0) totalPayable = 0;
    const totalInstPenalty = parseFloat(inst ? inst.penalty_amount : 0) || 0;
    const isOverdue = simulatedNow && inst && inst.due_date && new Date(inst.due_date) < simulatedNow;
    const instDueDateStr = inst && inst.due_date ? String(inst.due_date).slice(0, 10) : null;

    // 1. Calculate each holder's payable, received, on-time received, and pending amount
    const holderDues = holders.map(h => {
        const holderPayable = totalPayable * h.shareRatio;
        let holderReceived = 0;
        let holderOnTimeReceived = 0;
        let holderPenaltyPaid = 0;

        relatedPayments.forEach(p => {
            const payerId = p.collection_submission ? Number(p.collection_submission.member_id) : (p.payer_member_id ? Number(p.payer_member_id) : null);
            const pRecv = parseFloat(p.received_amount) || 0;
            const pPen = parseFloat(p.penalty_paid) || 0;
            const pDateStr = p.payment_date ? String(p.payment_date).slice(0, 10) : (p.createdAt ? String(new Date(p.createdAt).toISOString()).slice(0, 10) : null);
            const isOnTime = instDueDateStr && pDateStr ? pDateStr <= instDueDateStr : true;

            if (payerId != null) {
                if (payerId === Number(h.member_id)) {
                    holderReceived += pRecv;
                    holderPenaltyPaid += pPen;
                    if (isOnTime) {
                        holderOnTimeReceived += pRecv;
                    }
                }
            } else {
                if (holders.length === 1) {
                    holderReceived += pRecv;
                    holderPenaltyPaid += pPen;
                    if (isOnTime) {
                        holderOnTimeReceived += pRecv;
                    }
                } else {
                    holderReceived += pRecv * h.shareRatio;
                    holderPenaltyPaid += pPen * h.shareRatio;
                    if (isOnTime) {
                        holderOnTimeReceived += pRecv * h.shareRatio;
                    }
                }
            }
        });

        const holderPending = Math.max(0, holderPayable - holderReceived);
        const holderLatePaid = Math.max(0, holderReceived - holderOnTimeReceived);
        const holderUnpaidOrLate = holderPending + holderLatePaid;

        return {
            holder: h,
            payable: holderPayable,
            received: holderReceived,
            pending: holderPending,
            penaltyPaid: holderPenaltyPaid,
            holderUnpaidOrLate
        };
    });

    // 2. Distribute penalty proportionally to the holder(s) who actually caused overdue dues (unpaid or late)
    const totalUnpaidOrLate = holderDues.reduce((sum, hd) => sum + hd.holderUnpaidOrLate, 0);

    return holderDues.map(hd => {
        let holderExpectedPenalty = 0;
        if (isOverdue && totalInstPenalty > 0) {
            if (totalUnpaidOrLate > 0) {
                holderExpectedPenalty = totalInstPenalty * (hd.holderUnpaidOrLate / totalUnpaidOrLate);
            } else {
                holderExpectedPenalty = totalInstPenalty * hd.holder.shareRatio;
            }
        }
        const holderPenalty = Math.max(0, holderExpectedPenalty - hd.penaltyPaid);

        return {
            holder: hd.holder,
            payable: hd.payable,
            received: hd.received,
            pending: hd.pending,
            expectedPenalty: holderExpectedPenalty,
            penaltyPaid: hd.penaltyPaid,
            penalty: holderPenalty,
            isOverdue: isOverdue && (hd.pending > 0 || holderPenalty > 0)
        };
    });
};

/**
 * Calculate effective installment payable dynamically considering auction dividends.
 */
const calculateEffectiveInstallmentPayable = (inst, enrollment, group = null, auctions = []) => {
    const grp = (enrollment && enrollment.group) || group;
    const fallbackInstAmt = grp
        ? (parseFloat(grp.installment_amount) || ((parseFloat(grp.chit_amount) || 0) / (parseInt(grp.no_of_installments, 10) || 12)))
        : 0.00;
    let effectivePayable = parseFloat(inst ? inst.payable_amount : 0) || 0.00;

    if (auctions && auctions.length > 0 && inst) {
        const divAuction = auctions.find(a => (enrollment && a.group_id ? a.group_id === enrollment.group_id : true) && dividendMonthOf(a) === inst.installment_no);
        if (divAuction) {
            if (divAuction.net_payable && parseFloat(divAuction.net_payable) > 0) {
                effectivePayable = parseFloat(divAuction.net_payable);
            } else if (divAuction.dividend && parseFloat(divAuction.dividend) > 0) {
                const divVal = parseFloat(divAuction.dividend);
                const count = parseInt(grp ? grp.no_of_installments : 6, 10) || 6;
                const bonus = divVal < fallbackInstAmt ? divVal : (divVal / count);
                effectivePayable = Math.max(0, fallbackInstAmt - bonus);
            }
        }
    }

    if (effectivePayable <= 0) {
        effectivePayable = fallbackInstAmt;
    }
    return effectivePayable;
};

const SystemSettingsService = require('./systemSettingsService');
const { isCollectionAgent, isBusinessAgent } = require('../utils/authHelpers');
const { calculateMemberRating } = require('../utils/ratingHelper');
const fcmService = require('./fcmService');
const { getGroupStartDate } = require('./adminService');
const { getBannersForSubscriberHelper } = require('./bannerService');

const getHomeRecordService = async (res, userPayload, reqSubscriberId = null) => {
    const subscriber_id = (userPayload && userPayload.id) ? userPayload.id : reqSubscriberId;
    try {
        // 1. Fetch only essential Enrollment fields for non-deleted groups
        const enrollment = await Enrollment.findOne({
            where: {
                ...(await ticketHolderWhere(subscriber_id)),
                delete_status: 0
            },
            include: [{
                model: ChitsGroup,
                as: 'group',
                where: { is_deleted_status: 0 },
                required: true,
                attributes: ['id', 'group_name', 'chit_amount', 'no_of_installments', 'installment_amount', 'chits_group_status']
            }],
            order: [['createdAt', 'DESC']]
        });

        if (!enrollment) {
            return errorResponse(res, statusCodes.NOT_FOUND, 'No enrollment record found for this subscriber');
        }

        // 2. Extract ChitsGroup info
        const group = enrollment.group;

        // 3. Fetch the exact NEXT UPCOMING installment (Not Paid yet)
        const upcomingInstallment = await ChitsInstallment.findOne({
            where: {
                enrollment_id: enrollment.id,
                id: {
                    [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" IN (0, 1) AND "chits_installment_id" IS NOT NULL)`)
                }
            },
            order: [['installment_no', 'ASC']]
        });

        // 4. Dynamic payload for upcoming auctions (matching logic from getBidsService type=2)
        const upcoming_auction = [];
        const allEnrollments = await Enrollment.findAll({
            where: {
                ...(await ticketHolderWhere(subscriber_id)),
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

        // 7. Fetch active banners (Regular type 1 + Targeted type 2 assigned to this subscriber)
        let banners = [];
        try {
            const company_id = member ? member.company_id : (userPayload ? userPayload.company_id : null);
            banners = await getBannersForSubscriberHelper(subscriber_id, company_id);
        } catch (bannerErr) {
            console.error('Error fetching banners in getHomeRecordService:', bannerErr);
        }

        const singleChitAmount = group ? (parseFloat(group.chit_amount) || 0) : 0;
        const totalMonths = group ? (parseInt(group.no_of_installments, 10) || 0) : 0;
        const monthlyInstAmt = group ? (parseFloat(group.installment_amount) || (totalMonths > 0 ? singleChitAmount / totalMonths : 0)) : 0;

        const responseData = {
            id: enrollment.id,
            group_id: enrollment.group_id,
            subscriber_id: enrollment.subscriber_id,
            group_name: group ? group.group_name : null,
            chit_amount: singleChitAmount,
            upcoming_instalment_id: upcomingInstallment ? upcomingInstallment.id : null,
            enrollment_id: enrollment.id,
            next_due_date: upcomingInstallment ? upcomingInstallment.due_date : null,
            payable_amount: upcomingInstallment ? (parseFloat(upcomingInstallment.payable_amount) || 0) : 0,
            monthly_installment_amount: parseFloat(monthlyInstAmt.toFixed(2)),
            installment_amount: parseFloat(monthlyInstAmt.toFixed(2)),
            ...(upcomingInstallment && {
                createdAt: upcomingInstallment.createdAt,
                updatedAt: upcomingInstallment.updatedAt
            }),
            upcoming_auction,
            latest_upcoming_chit,
            rating: memberRating,
            banners
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
                ...(await ticketHolderWhere(subscriber_id)),
                delete_status: 0
            },
            include: [{
                model: ChitsGroup,
                as: 'group',
                where: { is_deleted_status: 0 },
                required: true,
                attributes: ['id', 'group_name', 'chit_amount', 'no_of_installments', 'scheme_configuration_id', 'auction_type', 'chits_group_status', 'installment_amount']
            }],
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

        const coHolders = await coHolderNames(uniqueEnrollments.map((e) => e.id), subscriber_id);
        const resolvedData = await Promise.all(uniqueEnrollments.map(async (enrollment) => {
            const group = enrollment.group;

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
                        [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" IN (0, 1) AND "chits_installment_id" IS NOT NULL)`)
                    }
                },
                order: [['installment_no', 'ASC']]
            });

            const occupiedCount = await Enrollment.count({
                where: { group_id: enrollment.group_id, delete_status: 0 }
            });

            const singleChitAmount = group ? (parseFloat(group.chit_amount) || 0) : 0;
            const totalMonths = group ? (parseInt(group.no_of_installments, 10) || 0) : 0;
            const monthlyInstAmt = group ? (parseFloat(group.installment_amount) || (totalMonths > 0 ? singleChitAmount / totalMonths : 0)) : 0;

            let completedInstallmentsCount = 0;
            if (group && Number(group.chits_group_status) === 2) {
                completedInstallmentsCount = totalMonths;
            } else {
                const latestAuction = await Auction.findOne({
                    where: { group_id: enrollment.group_id },
                    order: [['auction_number', 'DESC']],
                    attributes: ['auction_number']
                });
                if (latestAuction && latestAuction.auction_number) {
                    completedInstallmentsCount = Math.min(totalMonths, latestAuction.auction_number);
                } else if (group && Number(group.chits_group_status) === 1) {
                    completedInstallmentsCount = 1;
                }
            }

            let completed_percentage = 0;
            if (totalMonths > 0) {
                completed_percentage = Math.min(100, Math.round((completedInstallmentsCount / totalMonths) * 100));
            }

            const resolvedAuctionType = resolveChitGroupAuctionType(group);

            return {
                id: enrollment.id,
                group_id: enrollment.group_id,
                subscriber_id: enrollment.subscriber_id,
                is_joint: !!coHolders[enrollment.id],
                joint_with: coHolders[enrollment.id] || [],
                group_name: group ? group.group_name : null,
                chit_amount: singleChitAmount,
                no_of_installments: totalMonths,
                total_positions: totalMonths,
                auction_type: resolvedAuctionType,
                auction_type_label: resolvedAuctionType === 1 ? 'Open Auction' : (resolvedAuctionType === 2 ? 'Fixed Chit' : 'Standard'),
                scheme_type: schemeType,
                completed_installments_count: completedInstallmentsCount,
                completed_percentage,
                positions_occupied_count: occupiedCount,
                upcoming_instalment_id: upcomingInstallment ? upcomingInstallment.id : null,
                enrollment_id: enrollment.id,
                next_due_date: upcomingInstallment ? upcomingInstallment.due_date : null,
                payable_amount: upcomingInstallment ? (parseFloat(upcomingInstallment.payable_amount) || 0) : 0,
                monthly_installment_amount: parseFloat(monthlyInstAmt.toFixed(2)),
                installment_amount: parseFloat(monthlyInstAmt.toFixed(2)),
                payment_state: upcomingInstallment ? 'unpaid' : 'paid',
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
        const globalSimulatedNow = new Date(await SystemSettingsService.getBusinessDate());
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
                ...(await ticketHolderWhere(subscriber_id)),
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
                    [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" IN (0, 1) AND "chits_installment_id" IS NOT NULL)`)
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
        const payments = await CustomerPayment.findAll({
            where: { chits_installment_id: { [Op.in]: allUnpaidInstallments.map((i) => i.id) }, payment_status: { [Op.in]: [0, 1] } },
            attributes: ['chits_installment_id', 'penalty_paid']
        });
        const penaltyPaidByInstallment = {};
        payments.forEach((p) => {
            const k = p.chits_installment_id;
            penaltyPaidByInstallment[k] = (penaltyPaidByInstallment[k] || 0) + (parseFloat(p.penalty_paid) || 0);
        });

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
            // The auction whose dividend reduced this instalment (an open auction's dividend lands on the next non-company month)
            const auction = allAuctions.find(a => a.group_id === group.id && dividendMonthOf(a) === installment.installment_no);
            const totalMembersCount = (group && groupCountMap[group.id]) || parseInt(group?.no_of_installments, 10) || 20;

            const fallbackInstallment = parseFloat(group?.installment_amount) || (parseFloat(group?.chit_amount) / (parseInt(group?.no_of_installments, 10) || 12)) || parseFloat(installment.payable_amount) || 0.00;
            const originalAmount = (auction || schemeConfig ? getSchemeOriginalAmount(schemeConfig, auction) : fallbackInstallment) || fallbackInstallment;

            let profitAmount = 0.00;
            if (auction) {
                if (auction.net_payable && parseFloat(auction.net_payable) > 0) {
                    profitAmount = Math.max(0, originalAmount - parseFloat(auction.net_payable));
                } else if (auction.dividend && parseFloat(auction.dividend) > 0) {
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

            const overDueDaysCount = installment.over_due_days_count || 0;
            const isOverdue = overDueDaysCount > 0;
            if (isOverdue) {
                overduePaymentsCount++;
            }

            const penaltyAmount = Math.max(0, (parseFloat(installment.penalty_amount) || 0) - (penaltyPaidByInstallment[installment.id] || 0));
            const penaltyText = penaltyAmount > 0
                ? formatPenaltyCalculationText(penaltyAmount, overDueDaysCount)
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
                is_overdue: isOverdue,
                payment_state: 'unpaid'
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
        const globalSimulatedNow = new Date(await SystemSettingsService.getBusinessDate());
        if (!userPayload) {
            return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');
        }
        const subscriber_id = userPayload.id;

        // 1. Fetch active enrollments for this subscriber
        const enrollments = await Enrollment.findAll({
            where: {
                ...(await ticketHolderWhere(subscriber_id)),
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
        const myTicketIds = currentMemberId
            ? new Set((await memberTicketsInGroup(group_id, currentMemberId)).map((e) => e.id))
            : new Set();
        const userEnrollments = allEnrollments.filter(e => myTicketIds.has(e.id));

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

        const isWinnerStatus = latestAuction
            ? (await auctionIdsWonBy(userEnrollments)).has(latestAuction.id)
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
        const group = await ChitsGroup.findOne({
            where: {
                id: group_id,
                is_deleted_status: 0
            }
        });
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
                ...(await ticketHolderWhere(subscriber_id)),
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
                },
                {
                    model: EnrollmentJointHolder,
                    as: 'joint_holders',
                    required: false,
                    where: { removed_on: null },
                    attributes: ['id', 'member_id', 'share_percent'],
                    include: [{ model: Member, as: 'member', attributes: ['id', 'name', 'rep_by_first_name', 'sur_name', 'member_id'] }]
                }
            ],
            order: [['group_position_number', 'ASC']]
        });
        const detailCoHolders = await coHolderNames(userEnrollments.map((e) => e.id), subscriber_id);

        if (!userEnrollments || userEnrollments.length === 0) {
            return errorResponse(res, statusCodes.NOT_FOUND, 'No enrollment found for this subscriber in this group');
        }

        const ALPHABETS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

        const getEnrollmentHoldersInfo = (enr, currentMemberId) => {
            const isMain = Number(enr.subscriber_id) === Number(currentMemberId);
            const mainHolderName = enr.subscriber ? (enr.subscriber.name || `${enr.subscriber.rep_by_first_name || ''} ${enr.subscriber.sur_name || ''}`.trim() || 'Unknown') : 'Unknown';
            const mainHolder = {
                letter: 'A',
                member_id: enr.subscriber_id,
                name: mainHolderName,
                is_main_holder: true,
                share_percent: parseFloat(enr.main_holder_share) || ((enr.joint_holders && enr.joint_holders.length > 0) ? 50 : 100)
            };

            const jointList = (enr.joint_holders || []).filter(j => !j.removed_on).map((j, idx) => ({
                letter: ALPHABETS[idx + 1] || String.fromCharCode(66 + idx),
                member_id: j.member_id,
                name: j.member ? (j.member.name || `${j.member.rep_by_first_name || ''} ${j.member.sur_name || ''}`.trim() || 'Joint Member') : 'Joint Member',
                is_main_holder: false,
                share_percent: parseFloat(j.share_percent) || 0
            }));

            const allHolders = [mainHolder, ...jointList];
            const isJoint = allHolders.length > 1;

            let currentHolder = allHolders.find(h => Number(h.member_id) === Number(currentMemberId));
            if (!currentHolder) {
                currentHolder = isMain ? mainHolder : (allHolders[0] || mainHolder);
            }

            const posNumber = enr.group_position_number;
            const formattedTicketNo = "#" + String(posNumber).padStart(2, '0');
            const ticketCode = isJoint ? `${formattedTicketNo}-${currentHolder.letter}` : formattedTicketNo;

            return {
                allHolders,
                isJoint,
                currentHolder,
                myLetter: isJoint ? currentHolder.letter : null,
                ticketNumber: formattedTicketNo,
                ticketCode,
                holderName: currentHolder.name,
                mySharePercent: currentHolder.share_percent
            };
        };

        const getUserEnrollmentSharePercent = (enr, currentMemberId) => {
            const info = getEnrollmentHoldersInfo(enr, currentMemberId);
            return info.mySharePercent;
        };

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

        // Combine formatted ticket position numbers with alphabet suffixes for joint tickets (e.g. "#02-A" or "#08, #07-A")
        const positionNumbersFormatted = userEnrollments.map((e) => {
            const holderInfo = getEnrollmentHoldersInfo(e, subscriber_id);
            return holderInfo.ticketCode;
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

        let startDateVal = getGroupStartDate(group) || (group.createdAt ? new Date(group.createdAt).toISOString().split('T')[0] : null);
        let endDateVal = group.chit_end_date || group.term_date || group.maturity_date;

        if (!endDateVal && startDateVal) {
            // Instalment 1 falls on the start date, so the last one is (instalments - 1) months later.
            endDateVal = lastInstalmentDate(startDateVal, totalMonthsCount, group.due_date_number_count);
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

        // Fetch all customer payments made for this group's installments
        const userPayments = await CustomerPayment.findAll({
            where: {
                chits_installment_id: { [Op.in]: userInstallmentIds },
                payment_status: { [Op.in]: [0, 1] }
            },
            include: [
                {
                    model: CollectionAgentAmount,
                    as: 'collection_submission'
                }
            ],
            order: [['payment_date', 'ASC'], ['createdAt', 'ASC']]
        });

        const businessDateObj = await SystemSettingsService.getBusinessDate();
        let currentDateStr;
        if (businessDateObj instanceof Date) {
            const year = businessDateObj.getFullYear();
            const month = String(businessDateObj.getMonth() + 1).padStart(2, '0');
            const day = String(businessDateObj.getDate()).padStart(2, '0');
            currentDateStr = `${year}-${month}-${day}`;
        } else {
            currentDateStr = String(businessDateObj).split('T')[0];
        }
        const simulatedNow = new Date(currentDateStr);

        // Collections an agent has taken but the office hasn't verified yet: paid for the
        // member, receipt number still to come. Listed per instalment for the app to show.
        const instById = allUserInstallments.reduce((acc, i) => { acc[i.id] = i; return acc; }, {});
        const awaitingByInst = {};
        userPayments.filter((p) => Number(p.payment_status) === 0).forEach((p) => {
            const payerId = p.collection_submission ? Number(p.collection_submission.member_id) : (p.payer_member_id ? Number(p.payer_member_id) : null);
            if (payerId != null && payerId !== Number(subscriber_id)) return;

            const inst = instById[p.chits_installment_id];
            if (!inst) return;
            const enr = userEnrollments.find(e => e.id === inst.enrollment_id);
            const shareRatio = enr ? ((getUserEnrollmentSharePercent(enr, subscriber_id) || 100) / 100) : 1;
            const mult = (payerId != null) ? 1 : shareRatio;

            const pAmt = ((parseFloat(p.received_amount) || 0) + (parseFloat(p.penalty_paid) || 0)) * mult;
            if (pAmt <= 0) return;

            const row = awaitingByInst[inst.id] || {
                installment_no: inst.installment_no,
                due_date: inst.due_date,
                amount: 0,
                collected_on: p.payment_date || null,
                id: p.id,
                payment_id: p.id,
                receipt_id: p.receipt_number || null,
                receipt_number: p.receipt_number || null
            };
            row.amount = parseFloat((row.amount + pAmt).toFixed(2));
            awaitingByInst[inst.id] = row;
        });
        const awaitingConfirmation = Object.values(awaitingByInst).sort((a, b) => a.installment_no - b.installment_no);
        const singleChitAmount = parseFloat(group.chit_amount) || 0.00;

        // Calculate member's share-weighted chit amount and monthly bid amount
        let totalUserShareChitAmount = 0;
        let totalUserShareMonthlyBid = 0;

        userEnrollments.forEach((enr) => {
            const sharePercent = getUserEnrollmentSharePercent(enr, subscriber_id);
            const chitAmt = singleChitAmount;
            const monthlyAmt = parseFloat(group.installment_amount) || (chitAmt / totalMonthsCount) || 0;

            totalUserShareChitAmount += (chitAmt * (sharePercent / 100));
            totalUserShareMonthlyBid += (monthlyAmt * (sharePercent / 100));
        });

        const totalChitAmountForUser = totalUserShareChitAmount;

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

        // Auctions won by any of this member's tickets (joint tickets included).
        const myWonAuctionIds = await auctionIdsWonBy(userEnrollments);

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

        // Calculate Next Payment Due card details based on member's pending dues
        let nextPaymentDue = null;
        const sortedUserInstallments = [...allUserInstallments].sort((a, b) => {
            if (a.due_date && b.due_date && a.due_date !== b.due_date) {
                return new Date(a.due_date) - new Date(b.due_date);
            }
            return a.installment_no - b.installment_no;
        });

        for (const inst of sortedUserInstallments) {
            const dueTicket = userEnrollments.find((e) => e.id === inst.enrollment_id);
            if (!dueTicket) continue;

            const divAuction = auctions.find(a => dividendMonthOf(a) === inst.installment_no);
            let effectiveInstPayable = parseFloat(inst.payable_amount) || 0.00;
            const fallbackInstAmt = parseFloat(group.installment_amount) || (singleChitAmount / totalMonthsCount) || 0.00;
            if (divAuction) {
                if (divAuction.net_payable && parseFloat(divAuction.net_payable) > 0) {
                    effectiveInstPayable = parseFloat(divAuction.net_payable);
                } else if (divAuction.dividend && parseFloat(divAuction.dividend) > 0) {
                    const divVal = parseFloat(divAuction.dividend);
                    const count = totalMembersCount || (group ? group.no_of_installments : 6) || 6;
                    const bonus = divVal < fallbackInstAmt ? divVal : (divVal / count);
                    effectiveInstPayable = Math.max(0, fallbackInstAmt - bonus);
                }
            } else if (effectiveInstPayable <= 0) {
                effectiveInstPayable = fallbackInstAmt;
            }

            const holders = getEnrollmentHolders(dueTicket);
            const relatedPayments = userPayments.filter(p => p.chits_installment_id === inst.id);
            const dues = getHolderInstallmentDues(inst, dueTicket, holders, relatedPayments, simulatedNow, effectiveInstPayable);
            const myDue = dues.find(d => Number(d.holder.member_id) === Number(subscriber_id)) || dues[0];

            if (myDue && (myDue.pending > 0 || myDue.penalty > 0)) {
                const upcomingSharePercent = getUserEnrollmentSharePercent(dueTicket, subscriber_id) || 100;
                const rawDueAmount = effectiveInstPayable;
                const rawGrossAmount = parseFloat(group.installment_amount) || (singleChitAmount / totalMonthsCount) || 0.00;
                const grossAmount = parseFloat((rawGrossAmount * (upcomingSharePercent / 100)).toFixed(2));

                const dueDate = new Date(inst.due_date);
                dueDate.setHours(0, 0, 0, 0);
                const overDueDaysCount = myDue.isOverdue
                    ? Math.max(0, Math.floor((simulatedNow.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
                    : 0;

                const penaltyText = myDue.penalty > 0
                    ? formatPenaltyCalculationText(myDue.penalty, overDueDaysCount)
                    : null;

                const days_left = !myDue.isOverdue ? Math.max(0, Math.ceil((dueDate.getTime() - simulatedNow.getTime()) / (1000 * 60 * 60 * 24))) : 0;

                const ticketTotalPaid = relatedPayments.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);
                const ticketPending = Math.max(0, rawDueAmount - ticketTotalPaid);

                nextPaymentDue = {
                    installment_no: inst.installment_no,
                    due_date: inst.due_date,
                    due_date_formatted: formatDateToOrdinal(inst.due_date),
                    due_amount: parseFloat(myDue.pending.toFixed(2)),
                    gross_installment_amount: grossAmount,
                    penalty_amount: parseFloat(myDue.penalty.toFixed(2)),
                    over_due_days_count: overDueDaysCount,
                    penalty_text: penaltyText,
                    final_payable_amount: parseFloat((myDue.pending + myDue.penalty).toFixed(2)),
                    is_overdue: myDue.isOverdue,
                    days_left: days_left,
                    days_left_text: `${days_left} ${days_left === 1 ? 'day' : 'days'} left`,
                    paid_amount: parseFloat((myDue.received + myDue.penaltyPaid).toFixed(2)),
                    ...(upcomingSharePercent < 100 && {
                        my_share_percent: upcomingSharePercent,
                        ticket_due_amount: parseFloat(ticketPending.toFixed(2)),
                        ticket_gross_installment_amount: parseFloat(rawGrossAmount.toFixed(2))
                    })
                };
                break;
            }
        }

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
                },
                {
                    model: EnrollmentJointHolder,
                    as: 'joint_holders',
                    required: false,
                    where: { removed_on: null },
                    attributes: ['id', 'member_id', 'share_percent'],
                    include: [{ model: Member, as: 'member', attributes: ['id', 'name', 'rep_by_first_name', 'sur_name', 'member_id'] }]
                }
            ],
            order: [['group_position_number', 'ASC']]
        });
        const groupEnrollmentIds = allGroupEnrollments.map(e => e.id);

        const allGroupInstallments = await ChitsInstallment.findAll({
            where: {
                enrollment_id: { [Op.in]: groupEnrollmentIds }
            }
        });

        const monthlyActivity = [];
        const monthsList = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const defaultInstAmt = parseFloat(group.installment_amount) || (singleChitAmount / totalMonthsCount) || 0.00;

        for (let m = 1; m <= totalMonthsCount; m++) {
            const auction = auctions.find((a) => a.auction_number === m);

            // Month Date & Name: Derive sequentially from installment schedule
            let scheduledDateStr = null;
            const matchingInst = allUserInstallments.find((i) => i.installment_no === m) || allGroupInstallments.find((i) => i.installment_no === m);
            if (matchingInst && matchingInst.due_date) {
                scheduledDateStr = matchingInst.due_date;
            } else if (startDateVal) {
                const parts = String(startDateVal).slice(0, 10).split('-').map(Number);
                const [y, mm, d] = parts;
                const dueDay = parseInt(group.due_date_number_count, 10) || d || 5;
                const idx = (mm - 1) + (m - 1);
                const yy = y + Math.floor(idx / 12);
                const mIdx = idx % 12;
                const dd = Math.min(dueDay, new Date(Date.UTC(yy, mIdx + 1, 0)).getUTCDate());
                scheduledDateStr = `${yy}-${String(mIdx + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
            }

            const monthDateStr = scheduledDateStr || (auction && auction.auction_date ? auction.auction_date : null);

            let monthName = `Month ${m}`;
            if (scheduledDateStr || monthDateStr) {
                const md = new Date(scheduledDateStr || monthDateStr);
                if (!isNaN(md.getTime())) {
                    monthName = monthsList[md.getMonth()];
                }
            }

            const auctionDateFormatted = formatDateDMY(monthDateStr);

            // Winner Ticket & Position formatting
            let winnerTicketFormatted = 'N/A';
            let winnerPositionLabel = `P${m}`;
            let rawBidAmount = 0.00;
            let bidWinningAmount = 0.00;
            let isWinnerStatus = false;
            let winnerInfo = null;

            if (auction) {
                const winningEnrollment = allGroupEnrollments.find(e =>
                    (auction.ticket_number && Number(e.group_position_number) === Number(auction.ticket_number)) ||
                    (!auction.ticket_number && (Number(e.subscriber_id) === Number(auction.bidder_id) || (e.joint_holders || []).some(j => Number(j.member_id) === Number(auction.bidder_id))))
                );

                const winningHolders = winningEnrollment ? getEnrollmentHolders(winningEnrollment) : [];
                const isJointWinner = winningHolders.length > 1;

                winnerTicketFormatted = auction.ticket_number
                    ? '#' + String(auction.ticket_number).padStart(2, '0')
                    : (auction.bidder && auction.bidder.member_id ? `#${auction.bidder.member_id}` : 'N/A');

                if (auction.ticket_number) {
                    winnerPositionLabel = `P${auction.ticket_number}`;
                } else if (auction.bidder && auction.bidder.member_id) {
                    winnerPositionLabel = `P${auction.bidder.member_id}`;
                }

                const fullRawBidAmount = parseFloat(auction.bid_amount) || 0.00;
                const fullBidWinningAmount = getSchemeWinningAmount(schemeConfig, auction.auction_number) ?? fullRawBidAmount;

                // Scale bid amounts to the logged-in member's share (e.g. 50% = 10,500 instead of 21,000)
                const memberShareRatio = userEnrollments.length > 0
                    ? (userEnrollments.reduce((sum, e) => sum + (getUserEnrollmentSharePercent(e, subscriber_id) || 100), 0) / (userEnrollments.length * 100))
                    : 1;

                rawBidAmount = fullRawBidAmount * memberShareRatio;
                bidWinningAmount = fullBidWinningAmount * memberShareRatio;

                isWinnerStatus = myWonAuctionIds.has(auction.id) || (winningHolders.length > 0 && winningHolders.some(h => Number(h.member_id) === Number(subscriber_id)));

                let winnerDisplayName = auction.bidder ? (auction.bidder.name || 'N/A') : 'N/A';
                if (isJointWinner && winningHolders.length > 0) {
                    winnerDisplayName = winningHolders.map(h => `${h.name} (${h.sharePercent}%)`).join(', ');
                }

                winnerInfo = auction.bidder ? {
                    winner_name: winnerDisplayName,
                    winner_member_id: winnerTicketFormatted,
                    ticket_number: auction.ticket_number || null,
                    position_label: winnerPositionLabel,
                    is_self_winner: isWinnerStatus,
                    bid_winning_amount: parseFloat(bidWinningAmount.toFixed(2)),
                    ticket_full_bid_amount: parseFloat(fullRawBidAmount.toFixed(2)),
                    is_joint: isJointWinner,
                    ...(isJointWinner && {
                        joint_holders: winningHolders.map((h, idx) => {
                            const letter = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][idx] || String.fromCharCode(65 + idx);
                            const r = (h.sharePercent || 0) / 100;
                            return {
                                member_id: h.member_id,
                                name: h.name,
                                ticket_code: `${winnerTicketFormatted}-${letter}`,
                                share_percent: h.sharePercent,
                                is_main_holder: h.is_main_holder,
                                bid_share: parseFloat((fullRawBidAmount * r).toFixed(2)),
                                prize_share: parseFloat(((singleChitAmount - fullRawBidAmount) * r).toFixed(2))
                            };
                        })
                    })
                } : null;
            } else if (schemeConfig) {
                const fullBidWinningAmount = getSchemeWinningAmount(schemeConfig, m) ?? 0.00;
                const memberShareRatio = userEnrollments.length > 0
                    ? (userEnrollments.reduce((sum, e) => sum + (getUserEnrollmentSharePercent(e, subscriber_id) || 100), 0) / (userEnrollments.length * 100))
                    : 1;
                bidWinningAmount = fullBidWinningAmount * memberShareRatio;
            }

            // Math card stats per ticket
            const originalAmountPerTicket = auction
                ? getSchemeOriginalAmount(schemeConfig, auction)
                : (schemeConfig ? getSchemeOriginalAmount(schemeConfig, { auction_number: m }) : defaultInstAmt);

            let profitAmountPerTicket = 0.00;
            const matchingInstallment = allUserInstallments.find((inst) => inst.installment_no === m);
            const dividendAuction = auctions.find((a) => dividendMonthOf(a) === m) || null;

            // Calculate profit primarily from auction dividend if available
            if (dividendAuction) {
                if (dividendAuction.net_payable && parseFloat(dividendAuction.net_payable) > 0) {
                    const netPayable = parseFloat(dividendAuction.net_payable);
                    profitAmountPerTicket = Math.max(0, originalAmountPerTicket - netPayable);
                } else if (dividendAuction.dividend && parseFloat(dividendAuction.dividend) > 0) {
                    const divVal = parseFloat(dividendAuction.dividend);
                    const count = totalMembersCount || (group ? group.no_of_installments : 6) || 6;
                    const divPerMember = divVal < originalAmountPerTicket ? divVal : (divVal / count);
                    profitAmountPerTicket = Math.max(0, divPerMember);
                } else if (matchingInstallment) {
                    const payableVal = parseFloat(matchingInstallment.payable_amount);
                    profitAmountPerTicket = Math.max(0, originalAmountPerTicket - (Number.isNaN(payableVal) ? originalAmountPerTicket : payableVal));
                }
            } else if (matchingInstallment) {
                const payableVal = parseFloat(matchingInstallment.payable_amount) || 0.00;
                if (payableVal > 0 && payableVal < originalAmountPerTicket) {
                    profitAmountPerTicket = Math.max(0, originalAmountPerTicket - payableVal);
                }
            }

            const payableAmountPerTicket = Math.max(0, originalAmountPerTicket - profitAmountPerTicket);

            const allInstallmentsForAuction = allGroupInstallments.filter((inst) => inst.installment_no === m);

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
                const holderInfo = getEnrollmentHoldersInfo(ge, subscriber_id);
                const shareRatio = (holderInfo.mySharePercent || 100) / 100;

                const geInstallment = allInstallmentsForAuction.find((inst) => inst.enrollment_id === ge.id) ||
                    allUserInstallments.find((inst) => inst.enrollment_id === ge.id && inst.installment_no === m);

                const ticketOriginal = originalAmountPerTicket;
                const ticketProfit = profitAmountPerTicket;
                const ticketPayable = payableAmountPerTicket;

                const holders = getEnrollmentHolders(ge);
                const paymentsForInst = geInstallment
                    ? userPayments.filter((p) => p.chits_installment_id === geInstallment.id)
                    : [];

                const holderDues = geInstallment
                    ? getHolderInstallmentDues(geInstallment, ge, holders, paymentsForInst, simulatedNow, ticketPayable)
                    : holders.map(h => ({
                        holder: h,
                        payable: ticketPayable * h.shareRatio,
                        received: 0,
                        pending: ticketPayable * h.shareRatio,
                        expectedPenalty: 0,
                        penaltyPaid: 0,
                        penalty: 0,
                        isOverdue: false
                    }));

                const myDue = holderDues.find(d => Number(d.holder.member_id) === Number(subscriber_id)) || holderDues[0];

                const ticketPaymentHistory = paymentsForInst
                    .filter(p => {
                        const payerId = p.collection_submission ? Number(p.collection_submission.member_id) : (p.payer_member_id ? Number(p.payer_member_id) : null);
                        if (payerId && payerId !== Number(subscriber_id)) return false;

                        // If this payment is part of a multi-installment submission, only show the receipt on the earliest installment
                        if (p.collection_agent_amount_id && p.collection_submission) {
                            const subId = p.collection_agent_amount_id;
                            const subPayments = userPayments.filter(sp => String(sp.collection_agent_amount_id) === String(subId));
                            if (subPayments.length > 1) {
                                let minInstNo = Infinity;
                                subPayments.forEach(sp => {
                                    const matchedInst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                                    if (matchedInst && matchedInst.installment_no < minInstNo) {
                                        minInstNo = matchedInst.installment_no;
                                    }
                                });

                                if (geInstallment && geInstallment.installment_no > minInstNo) {
                                    // Carried forward portion into this installment: hide separate duplicate receipt from payment history
                                    return false;
                                }
                            }
                        }

                        return true;
                    })
                    .map((p) => {
                        let pReceived = parseFloat(p.received_amount) || 0.00;
                        const pPenalty = parseFloat(p.penalty_paid) || 0.00;

                        // If this is the originating installment of a multi-installment submission, show the total collected submission amount for this ticket
                        if (p.collection_agent_amount_id && p.collection_submission) {
                            const subId = p.collection_agent_amount_id;
                            const subPayments = userPayments.filter(sp => String(sp.collection_agent_amount_id) === String(subId));
                            if (subPayments.length > 1) {
                                let minInstNo = Infinity;
                                subPayments.forEach(sp => {
                                    const matchedInst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                                    if (matchedInst && matchedInst.installment_no < minInstNo) {
                                        minInstNo = matchedInst.installment_no;
                                    }
                                });

                                if (geInstallment && geInstallment.installment_no === minInstNo) {
                                    const ticketSubPayments = subPayments.filter(sp => {
                                        const inst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                                        return inst && inst.enrollment_id === ge.id;
                                    });
                                    const totalForTicket = ticketSubPayments.reduce((sum, sp) => sum + (parseFloat(sp.received_amount) || 0), 0);
                                    if (totalForTicket > 0) {
                                        pReceived = totalForTicket;
                                    }
                                }
                            }
                        }

                        const pDate = p.payment_date || (p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : null);
                        const pDateFormatted = formatDateDMY(pDate);
                        const pDateShort = formatDateShortDMY(pDate);
                        const pMode = p.payment_mode || 1;
                        const pModeLabel = getPaymentModeLabel(pMode);

                        return {
                            id: p.id,
                            payment_id: p.id,
                            receipt_id: p.receipt_number || null,
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

                const ticketSubPaid = paymentsForInst.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);
                const ticketPenaltyPaid = paymentsForInst.reduce((sum, p) => sum + (parseFloat(p.penalty_paid) || 0), 0);
                const ticketPaidAmount = parseFloat((ticketSubPaid + ticketPenaltyPaid).toFixed(2));
                const ticketPending = Math.max(0, ticketPayable - ticketSubPaid);

                let rawPenaltyAmount = 0;
                let overDueDaysCount = 0;
                if (geInstallment) {
                    rawPenaltyAmount = parseFloat(geInstallment.penalty_amount) || 0;
                    overDueDaysCount = geInstallment.over_due_days_count || 0;
                    if (overDueDaysCount === 0 && geInstallment.due_date && simulatedNow) {
                        const dueDate = new Date(geInstallment.due_date);
                        dueDate.setHours(0, 0, 0, 0);
                        if (dueDate < simulatedNow) {
                            overDueDaysCount = Math.max(0, Math.floor((simulatedNow.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
                        }
                    }
                }
                const ticketRemainingPenalty = Math.max(0, rawPenaltyAmount - ticketPenaltyPaid);
                let ticketPenaltyAmount = 0;
                let ticketPenaltyText = null;
                if (ticketRemainingPenalty > 0) {
                    ticketPenaltyAmount = ticketRemainingPenalty;
                    ticketPenaltyText = formatPenaltyCalculationText(ticketRemainingPenalty, overDueDaysCount);
                } else if (ticketPenaltyPaid > 0) {
                    ticketPenaltyAmount = ticketPenaltyPaid;
                    ticketPenaltyText = `₹${parseFloat(ticketPenaltyPaid.toFixed(2))} (Paid)`;
                } else if (rawPenaltyAmount > 0) {
                    ticketPenaltyAmount = rawPenaltyAmount;
                    ticketPenaltyText = formatPenaltyCalculationText(rawPenaltyAmount, overDueDaysCount);
                }
                const ticketTotalAmount = parseFloat((ticketPending + ticketRemainingPenalty).toFixed(2));

                const calculateHolderAdvance = (holder, hDueInst) => {
                    if (!geInstallment || !hDueInst) return 0;
                    const directOverpayment = Math.max(0, hDueInst.received - hDueInst.payable);

                    let submissionAdvance = 0;
                    const hPayments = paymentsForInst.filter(p => {
                        const payerId = p.collection_submission ? Number(p.collection_submission.member_id) : (p.payer_member_id ? Number(p.payer_member_id) : null);
                        return !payerId || payerId === Number(holder.member_id);
                    });

                    hPayments.forEach(p => {
                        if (p.collection_agent_amount_id && p.collection_submission) {
                            const subId = p.collection_agent_amount_id;
                            const subPayments = userPayments.filter(sp => String(sp.collection_agent_amount_id) === String(subId));
                            if (subPayments.length > 1) {
                                let minInstNo = Infinity;
                                subPayments.forEach(sp => {
                                    const matchedInst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                                    if (matchedInst && matchedInst.installment_no < minInstNo) {
                                        minInstNo = matchedInst.installment_no;
                                    }
                                });

                                if (geInstallment.installment_no === minInstNo) {
                                    const futurePayments = subPayments.filter(sp => {
                                        const spInst = allUserInstallments.find(i => String(i.id) === String(sp.chits_installment_id));
                                        return spInst && spInst.installment_no > minInstNo && spInst.enrollment_id === ge.id;
                                    });
                                    const carriedForward = futurePayments.reduce((sum, sp) => sum + (parseFloat(sp.received_amount) || 0), 0);
                                    submissionAdvance += carriedForward;
                                }
                            }
                        }
                    });

                    return Math.max(directOverpayment, submissionAdvance);
                };

                const myAdvance = myDue ? calculateHolderAdvance(myDue.holder, myDue) : 0;
                const shareAdvance = parseFloat(myAdvance.toFixed(2));

                // Share-proportional amounts for current member (if joint ticket)
                const shareOriginal = parseFloat((ticketOriginal * shareRatio).toFixed(2));
                const shareProfit = parseFloat((ticketProfit * shareRatio).toFixed(2));
                const sharePayable = parseFloat((myDue ? myDue.payable : (ticketPayable * shareRatio)).toFixed(2));
                const sharePaid = parseFloat((myDue ? (myDue.received + myDue.penaltyPaid) : (ticketPaidAmount * shareRatio)).toFixed(2));
                const sharePending = parseFloat((myDue ? myDue.pending : (ticketPending * shareRatio)).toFixed(2));
                const sharePenalty = parseFloat((myDue ? myDue.penalty : (ticketPenaltyAmount * shareRatio)).toFixed(2));
                const sharePenaltyPaid = parseFloat((myDue ? myDue.penaltyPaid : (ticketPenaltyPaid * shareRatio)).toFixed(2));
                const shareTotalAmount = parseFloat((sharePending + sharePenalty).toFixed(2));

                // Joint holders breakdown list
                const jointBreakdown = holderInfo.allHolders.map((h) => {
                    const r = (h.share_percent || 0) / 100;
                    const hDue = holderDues.find(d => Number(d.holder.member_id) === Number(h.member_id));
                    const hPayable = hDue ? hDue.payable : (ticketPayable * r);
                    const hReceived = hDue ? hDue.received : 0;
                    const hPenaltyPaid = hDue ? hDue.penaltyPaid : 0;
                    const hPending = hDue ? hDue.pending : (ticketPending * r);
                    const hPenalty = hDue ? hDue.penalty : (ticketPenaltyAmount * r);
                    const hAdvance = hDue ? calculateHolderAdvance(hDue.holder, hDue) : 0;
                    const hTotal = hPending + hPenalty;
                    const hCode = holderInfo.isJoint ? `${holderInfo.ticketNumber}-${h.letter}` : holderInfo.ticketNumber;

                    return {
                        letter: h.letter,
                        member_id: h.member_id,
                        name: h.name,
                        is_main_holder: h.is_main_holder,
                        share_percent: h.share_percent,
                        ticket_code: hCode,
                        ticket_number: holderInfo.ticketNumber,
                        original_amount: parseFloat((ticketOriginal * r).toFixed(2)),
                        profit_amount: parseFloat((ticketProfit * r).toFixed(2)),
                        payable: parseFloat(hPayable.toFixed(2)),
                        paid_amount: parseFloat((hReceived + hPenaltyPaid).toFixed(2)),
                        pending_amount: parseFloat(hPending.toFixed(2)),
                        advance_payment: parseFloat(hAdvance.toFixed(2)),
                        advance_amount_status: hAdvance > 0,
                        penalty_amount: parseFloat(hPenalty.toFixed(2)),
                        penalty_paid: parseFloat(hPenaltyPaid.toFixed(2)),
                        penalty_text: hPenalty > 0 ? formatPenaltyCalculationText(hPenalty, overDueDaysCount) : null,
                        total_amount: parseFloat(hTotal.toFixed(2)),
                        display_label: `${h.name} ${hCode}`
                    };
                });

                let ticketAdvance = 0;
                if (holderInfo.isJoint) {
                    ticketAdvance = jointBreakdown.reduce((sum, jb) => sum + (parseFloat(jb.advance_payment) || 0), 0);
                } else {
                    ticketAdvance = myAdvance;
                }

                monthOriginalTotal += (holderInfo.isJoint ? shareOriginal : ticketOriginal);
                monthProfitTotal += (holderInfo.isJoint ? shareProfit : ticketProfit);
                monthPayableTotal += (holderInfo.isJoint ? sharePayable : ticketPayable);
                monthPaidTotal += (holderInfo.isJoint ? sharePaid : ticketPaidAmount);
                monthPendingTotal += (holderInfo.isJoint ? sharePending : ticketPending);
                monthAdvanceTotal += (holderInfo.isJoint ? shareAdvance : ticketAdvance);
                monthPenaltyTotal += (holderInfo.isJoint ? sharePenalty : ticketPenaltyAmount);
                monthTotalAmountSum += (holderInfo.isJoint ? shareTotalAmount : ticketTotalAmount);

                let ticketPaymentState = 'unpaid';
                if (geInstallment) {
                    const myPayments = paymentsForInst.filter(p => {
                        const payerId = p.collection_submission ? Number(p.collection_submission.member_id) : (p.payer_member_id ? Number(p.payer_member_id) : null);
                        return !payerId || payerId === Number(subscriber_id);
                    });
                    if (myPayments.some((p) => p.payment_status === 0)) {
                        ticketPaymentState = 'awaiting_confirmation';
                    } else if (myDue && myDue.pending <= 0 && (myDue.received > 0 || myDue.payable === 0)) {
                        ticketPaymentState = 'paid';
                    }
                }

                const displayLabel = `${holderInfo.holderName} ${holderInfo.ticketCode}`;
                const positionLabel = `Member ${holderInfo.ticketCode}`;

                memberBreakdown.push({
                    enrollment_id: ge.id,
                    ticket_id: ge.id,
                    ticket_number: holderInfo.ticketNumber,
                    ticket_code: holderInfo.ticketCode,
                    ticket_letter: holderInfo.myLetter,
                    holder_name: holderInfo.holderName,
                    display_label: displayLabel,
                    name: ge.subscriber ? ge.subscriber.name : 'Unknown Subscriber',
                    position_label: positionLabel,
                    group_position_number: ge.group_position_number,
                    subscriber_id: ge.subscriber_id,
                    subscriber_name: ge.subscriber ? ge.subscriber.name : 'Unknown Subscriber',
                    is_joint: holderInfo.isJoint,
                    my_share_percent: holderInfo.mySharePercent,

                    // Proportional amounts for the logged-in holder (matching the UI screenshot)
                    original_amount: holderInfo.isJoint ? shareOriginal : parseFloat(ticketOriginal.toFixed(2)),
                    profit_amount: holderInfo.isJoint ? shareProfit : parseFloat(ticketProfit.toFixed(2)),
                    payable: holderInfo.isJoint ? sharePayable : parseFloat(ticketPayable.toFixed(2)),
                    paid_amount: holderInfo.isJoint ? sharePaid : parseFloat(ticketPaidAmount.toFixed(2)),
                    pending_amount: holderInfo.isJoint ? sharePending : parseFloat(ticketPending.toFixed(2)),
                    advance_payment: holderInfo.isJoint ? shareAdvance : parseFloat(ticketAdvance.toFixed(2)),
                    advance_amount_status: (holderInfo.isJoint ? shareAdvance : ticketAdvance) > 0,
                    penalty_amount: holderInfo.isJoint ? sharePenalty : parseFloat(ticketPenaltyAmount.toFixed(2)),
                    penalty_paid: holderInfo.isJoint ? sharePenaltyPaid : parseFloat(ticketPenaltyPaid.toFixed(2)),
                    penalty_text: sharePenalty > 0 ? formatPenaltyCalculationText(sharePenalty, overDueDaysCount) : ticketPenaltyText,
                    total_amount: holderInfo.isJoint ? shareTotalAmount : parseFloat(ticketTotalAmount.toFixed(2)),
                    total_amount_formatted_label: `(${displayLabel})`,

                    // Full ticket amounts
                    ticket_original_amount: parseFloat(ticketOriginal.toFixed(2)),
                    ticket_profit_amount: parseFloat(ticketProfit.toFixed(2)),
                    ticket_payable: parseFloat(ticketPayable.toFixed(2)),
                    ticket_paid_amount: parseFloat(ticketPaidAmount.toFixed(2)),
                    ticket_pending_amount: parseFloat(ticketPending.toFixed(2)),
                    ticket_penalty_amount: parseFloat(ticketPenaltyAmount.toFixed(2)),
                    ticket_penalty_paid: parseFloat(ticketPenaltyPaid.toFixed(2)),
                    ticket_total_amount: parseFloat(ticketTotalAmount.toFixed(2)),

                    // Joint holders breakdown list
                    joint_holders_breakdown: jointBreakdown,

                    payment_history: ticketPaymentHistory,
                    payment_state: ticketPaymentState
                });
            }

            let monthPenaltyText = null;
            const itemWithPenalty = memberBreakdown.find((item) => item.penalty_text);
            if (itemWithPenalty) {
                monthPenaltyText = itemWithPenalty.penalty_text;
            }

            const firstInstForMonth = allUserInstallments.find((i) => i.installment_no === m);

            monthlyActivity.push({
                id: auction ? auction.id : (firstInstForMonth ? firstInstForMonth.id : null),
                auction_number: m,
                month_count: m,
                total_months_count: totalMonthsCount,
                month_badge: `${m}/${totalMonthsCount}`,
                month_name: monthName,
                auction_date: monthDateStr,
                auction_date_formatted: auctionDateFormatted,
                bid_amount: parseFloat(rawBidAmount.toFixed(2)),
                bid_winning_amount: parseFloat(bidWinningAmount.toFixed(2)),
                winner_name: winnerInfo ? winnerInfo.winner_name : (auction && auction.bidder ? (auction.bidder.name || 'N/A') : 'N/A'),
                winner_member_id: winnerTicketFormatted,
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
                    total_paid: parseFloat((monthPaidTotal + monthAdvanceTotal).toFixed(2)),
                    total_paid_amount: parseFloat((monthPaidTotal + monthAdvanceTotal).toFixed(2)),
                    total_pending: parseFloat(monthPendingTotal.toFixed(2)),
                    total_advance: parseFloat(monthAdvanceTotal.toFixed(2)),
                    advance_amount_status: monthAdvanceTotal > 0,
                    total_amount: parseFloat(monthTotalAmountSum.toFixed(2)),
                    total_penalty: parseFloat(monthPenaltyTotal.toFixed(2))
                }
            });
        }

        // Calculate true group pending, paid and advance amounts across all months
        const groupPendingAmount = monthlyActivity.reduce((sum, item) => sum + (parseFloat(item.pending_amount) || 0), 0);
        const groupAdvanceAmount = monthlyActivity.reduce((sum, item) => sum + (parseFloat(item.advance_payment) || 0), 0);
        const totalPaidAmountForUser = monthlyActivity.reduce((sum, item) => sum + (parseFloat(item.paid_amount) || 0), 0);

        // Assemble final beautiful structured response matching all 5 screens
        const responsePayload = {
            chit_group_details: {
                group_id: group.id,
                group_name: group.group_name || 'Unknown Chit',
                start_date: startDateFormatted,
                end_date: endDateFormatted,
                total_amount: parseInt(totalChitAmountForUser, 10) || 0,
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
                joint_with: [...new Set(Object.values(detailCoHolders).flat())],
                collection_agent_name: collectionAgentName,
                business_agent_name: agentName
            },
            auction_type: resolvedAuctionType,
            auction_type_label: resolvedAuctionType === 1 ? 'Open Auction' : (resolvedAuctionType === 2 ? 'Fixed Chit' : 'Standard'),
            my_chit_overview: {
                monthly_bid_amount: parseFloat(totalUserShareMonthlyBid.toFixed(2)),
                total_paid_amount: parseFloat(totalPaidAmountForUser.toFixed(2)),
                total_pending_amount: parseFloat(groupPendingAmount.toFixed(2)),
                total_advance_payment: parseFloat(groupAdvanceAmount.toFixed(2)),
                advance_amount_status: groupAdvanceAmount > 0,
                next_payment_due: nextPaymentDue,
                awaiting_confirmation: awaitingConfirmation
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
                chits_group_status: { [Op.in]: [0, 1, 2] },
                is_deleted_status: 0
            }
        });

        const pendingInstallments = await ChitsInstallment.findAll({
            where: {
                enrollment_id: { [Op.in]: enrollmentIds },
                id: {
                    [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" IN (0, 1) AND "chits_installment_id" IS NOT NULL)`)
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
            where: { payment_status: { [Op.in]: [0, 1] } },
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
                chits_group_status: { [Op.in]: [0, 1, 2] },
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

            let groupStatus = 'Active';
            if (Number(group.chits_group_status) === 2) {
                groupStatus = 'Completed';
            } else if (Number(group.chits_group_status) === 0) {
                groupStatus = 'Upcoming';
            }

            return {
                group_id: group.id,
                group_name: group.group_name,
                status: groupStatus,
                status_label: groupStatus,
                chits_group_status: Number(group.chits_group_status),
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
                chits_group_status: { [Op.in]: [0, 1, 2] }, // Upcoming, Active & Completed
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
            where: { payment_status: { [Op.in]: [0, 1] } },
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

            let groupStatus = 'Active';
            if (Number(group.chits_group_status) === 2) {
                groupStatus = 'Completed';
            } else if (Number(group.chits_group_status) === 0) {
                groupStatus = 'Upcoming';
            }

            return {
                group_id: group.id,
                group_name: group.group_name,
                status: groupStatus,
                status_label: groupStatus,
                chits_group_status: Number(group.chits_group_status),
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
            enrollment_id: { [Op.in]: enrollmentIds }
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
            order: [['due_date', 'ASC'], ['installment_no', 'ASC']]
        });

        const installmentIds = installments.map(i => i.id);

        const payments = await CustomerPayment.findAll({
            where: {
                chits_installment_id: { [Op.in]: installmentIds },
                payment_status: { [Op.in]: [0, 1] }
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
            const simulatedNow = new Date(await SystemSettingsService.getBusinessDate());
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
                },
                {
                    model: CollectionAgentAmount,
                    as: 'collection_submission',
                    include: [{ model: Member, as: 'member' }]
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
            const subscriber = (payment.collection_submission && payment.collection_submission.member) || e.subscriber;

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
                    name: subscriber.name || `${subscriber.rep_by_first_name || ''} ${subscriber.sur_name || ''}`.trim() || 'Unknown',
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
            include: [
                { model: ChitsGroup, as: 'group' },
                { model: Member, as: 'subscriber' },
                {
                    model: EnrollmentJointHolder,
                    as: 'joint_holders',
                    required: false,
                    where: { removed_on: null },
                    include: [{ model: Member, as: 'member' }]
                }
            ]
        });
        const enrollmentIds = enrollments.map(e => e.id);

        let groupStatus = 'Active';
        if (Number(group.chits_group_status) === 2) {
            groupStatus = 'Completed';
        } else if (Number(group.chits_group_status) === 0) {
            groupStatus = 'Upcoming';
        }

        const auctions = await Auction.findAll({
            where: { group_id },
            order: [['auction_number', 'ASC']]
        });

        let currentMonthCount = 1;
        if (Number(group.chits_group_status) === 2) {
            currentMonthCount = parseInt(group.no_of_installments, 10) || 12;
        } else if (Number(group.chits_group_status) === 1) {
            if (auctions && auctions.length > 0) {
                currentMonthCount = Math.min(parseInt(group.no_of_installments, 10) || 12, auctions[auctions.length - 1].auction_number + 1);
            } else {
                currentMonthCount = 1;
            }
        } else {
            currentMonthCount = 1;
        }

        const businessDateObj = await SystemSettingsService.getBusinessDate();
        let currentDateStr;
        if (businessDateObj instanceof Date) {
            const year = businessDateObj.getFullYear();
            const month = String(businessDateObj.getMonth() + 1).padStart(2, '0');
            const day = String(businessDateObj.getDate()).padStart(2, '0');
            currentDateStr = `${year}-${month}-${day}`;
        } else {
            currentDateStr = String(businessDateObj).split('T')[0];
        }
        const simulatedNow = new Date(currentDateStr);

        if (!enrollments || enrollments.length === 0) {
            return successResponse(res, statusCodes.OK, 'Group dashboard', {
                group_id: group.id,
                group_name: group.group_name,
                status: groupStatus,
                status_label: groupStatus,
                chits_group_status: Number(group.chits_group_status),
                today_group_value_price: parseFloat(group.chit_amount) || 0,
                total_collected: 0,
                pending_amount: 0,
                overdue_members: 0,
                overall_collection_process_percentage: 0,
                current_date: currentDateStr,
                pending_members: []
            });
        }

        const allInstallments = await ChitsInstallment.findAll({
            where: { enrollment_id: { [Op.in]: enrollmentIds } },
            order: [['due_date', 'ASC'], ['installment_no', 'ASC']]
        });

        const payments = await CustomerPayment.findAll({
            where: { payment_status: { [Op.in]: [0, 1] } },
            include: [
                {
                    model: ChitsInstallment,
                    as: 'installment',
                    where: { enrollment_id: { [Op.in]: enrollmentIds } }
                },
                {
                    model: CollectionAgentAmount,
                    as: 'collection_submission'
                }
            ]
        });

        const total_collected = payments.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);

        let total_payable = 0;
        let total_pending = 0;
        let overdue_members_set = new Set();
        const memberMap = {};

        allInstallments.forEach(inst => {
            const e = enrollments.find(e => e.id === inst.enrollment_id);
            if (!e) return;

            const effectiveInstPayable = calculateEffectiveInstallmentPayable(inst, e, e.group || group, auctions);
            const holders = getEnrollmentHolders(e);
            const relatedPayments = payments.filter(p => p.chits_installment_id === inst.id);
            const dues = getHolderInstallmentDues(inst, e, holders, relatedPayments, simulatedNow, effectiveInstPayable);

            dues.forEach(d => {
                total_payable += d.payable;
                total_pending += d.pending;

                if (d.pending > 0) {
                    const sub = d.holder.member;
                    if (!memberMap[sub.id]) {
                        memberMap[sub.id] = {
                            id: sub.id,
                            member_name: sub.name || `${sub.rep_by_first_name || ''} ${sub.sur_name || ''}`.trim() || 'Unknown',
                            member_id: sub.member_id || `#${sub.id}`,
                            profile_image: sub.upload_image || null,
                            gender: sub.gender || null,
                            pending_months_set: new Set(),
                            oldest_due_date: inst.due_date,
                            balance: 0,
                            penalty_amount: 0,
                            penalty_text: ""
                        };
                    }

                    memberMap[sub.id].pending_months_set.add(inst.installment_no || inst.due_date);
                    memberMap[sub.id].balance += d.pending;
                    memberMap[sub.id].penalty_amount += d.penalty;
                    memberMap[sub.id].penalty_text = `₹ ${parseFloat(memberMap[sub.id].penalty_amount.toFixed(2))}`;

                    if (new Date(inst.due_date) < new Date(memberMap[sub.id].oldest_due_date)) {
                        memberMap[sub.id].oldest_due_date = inst.due_date;
                    }
                }

                if (d.isOverdue) {
                    overdue_members_set.add(d.holder.member.id);
                }
            });
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
            row.pending_months = row.pending_months_set ? row.pending_months_set.size : (row.pending_months || 0);
            delete row.pending_months_set;
            delete row.oldest_due_date;
            return row;
        });

        return successResponse(res, statusCodes.OK, 'Group dashboard', {
            group_id: group.id,
            group_name: group.group_name,
            status: groupStatus,
            status_label: groupStatus,
            chits_group_status: Number(group.chits_group_status),
            today_group_value_price: parseFloat(group.chit_amount) || 0,
            total_collected: parseFloat(total_collected.toFixed(2)),
            pending_amount: parseFloat(total_pending.toFixed(2)),
            overdue_members: overdue_members_set.size,
            overall_collection_process_percentage: parseFloat(percentage),
            current_date: currentDateStr,
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
                { model: ChitsGroup, as: 'group' },
                {
                    model: EnrollmentJointHolder,
                    as: 'joint_holders',
                    required: false,
                    where: { removed_on: null },
                    include: [{ model: Member, as: 'member' }]
                }
            ]
        });

        const enrollmentIds = enrollments.map(e => e.id);
        const installments = await ChitsInstallment.findAll({
            where: {
                enrollment_id: { [Op.in]: enrollmentIds }
            },
            order: [['due_date', 'ASC'], ['installment_no', 'ASC']]
        });

        const payments = await CustomerPayment.findAll({
            where: {
                payment_status: { [Op.in]: [0, 1] }
            },
            include: [
                {
                    model: ChitsInstallment,
                    as: 'installment',
                    where: { enrollment_id: { [Op.in]: enrollmentIds } }
                },
                {
                    model: CollectionAgentAmount,
                    as: 'collection_submission'
                }
            ]
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

        const auctions = group_id ? await Auction.findAll({
            where: { group_id },
            order: [['auction_number', 'ASC']]
        }) : await Auction.findAll({
            where: { group_id: { [Op.in]: enrollments.map(e => e.group_id).filter(Boolean) } },
            order: [['auction_number', 'ASC']]
        });

        const groupObj = group_id ? await ChitsGroup.findByPk(group_id) : null;
        let currentMonthCount = 12;
        if (groupObj) {
            if (Number(groupObj.chits_group_status) === 2) {
                currentMonthCount = parseInt(groupObj.no_of_installments, 10) || 12;
            } else if (Number(groupObj.chits_group_status) === 1) {
                if (auctions && auctions.length > 0) {
                    currentMonthCount = Math.min(parseInt(groupObj.no_of_installments, 10) || 12, auctions[auctions.length - 1].auction_number + 1);
                } else {
                    currentMonthCount = 1;
                }
            } else {
                currentMonthCount = 1;
            }
        }

        const businessDateObj = await SystemSettingsService.getBusinessDate();
        let currentDateStr;
        if (businessDateObj instanceof Date) {
            const year = businessDateObj.getFullYear();
            const month = String(businessDateObj.getMonth() + 1).padStart(2, '0');
            const day = String(businessDateObj.getDate()).padStart(2, '0');
            currentDateStr = `${year}-${month}-${day}`;
        } else {
            currentDateStr = String(businessDateObj).split('T')[0];
        }
        const simulatedNow = new Date(currentDateStr);

        const memberMap = {};
        installments.forEach(inst => {
            const e = enrollments.find(e => e.id === inst.enrollment_id);
            if (!e) return;

            const effectiveInstPayable = calculateEffectiveInstallmentPayable(inst, e, e.group || groupObj, auctions);
            const holders = getEnrollmentHolders(e);
            const relatedPayments = payments.filter(p => p.chits_installment_id === inst.id);
            const dues = getHolderInstallmentDues(inst, e, holders, relatedPayments, simulatedNow, effectiveInstPayable);

            dues.forEach(d => {
                if (d.pending > 0) {
                    const sub = d.holder.member;
                    if (!memberMap[sub.id]) {
                        memberMap[sub.id] = {
                            id: sub.id,
                            member_name: sub.name || `${sub.rep_by_first_name || ''} ${sub.sur_name || ''}`.trim() || 'Unknown',
                            member_id: sub.member_id || `#${sub.id}`,
                            profile_image: sub.upload_image || null,
                            gender: sub.gender || null,
                            pending_months_set: new Set(),
                            oldest_due_date: inst.due_date,
                            balance: 0,
                            penalty_amount: 0,
                            penalty_text: "",
                            pending_submissions: pendingSubMap[sub.id] || 0
                        };
                    }

                    memberMap[sub.id].pending_months_set.add(inst.installment_no || inst.due_date);
                    memberMap[sub.id].balance += d.pending;
                    memberMap[sub.id].penalty_amount += d.penalty;
                    memberMap[sub.id].penalty_text = `₹ ${parseFloat(memberMap[sub.id].penalty_amount.toFixed(2))}`;

                    if (new Date(inst.due_date) < new Date(memberMap[sub.id].oldest_due_date)) {
                        memberMap[sub.id].oldest_due_date = inst.due_date;
                    }
                }
            });
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
            row.balance = parseFloat(row.balance.toFixed(2));
            row.penalty_amount = parseFloat(row.penalty_amount.toFixed(2));
            row.pending_months = row.pending_months_set ? row.pending_months_set.size : (row.pending_months || 0);
            delete row.pending_months_set;
            delete row.oldest_due_date;
            return row;
        });

        return successResponse(res, statusCodes.OK, 'Pending members', { count, rows });
    } catch (error) {
        console.error('Error:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getMemberDuesService = async (res, member_id, userPayload, groupId = null) => {
    try {
        if (userPayload) {
            if (userPayload.role === 'member') {
                if (String(userPayload.id) !== String(member_id)) {
                    // If accessing someone else's dues, verify they are a collection agent assigned to this member
                    const authWhere = {
                        ...(await ticketHolderWhere(member_id)),
                        collection_agent_id: userPayload.id,
                        delete_status: 0
                    };
                    if (groupId) {
                        authWhere.group_id = groupId;
                    }
                    const isAssigned = await Enrollment.findOne({
                        where: authWhere
                    });
                    if (!isAssigned) {
                        return errorResponse(res, 403, 'You are not authorized to view this member\'s dues');
                    }
                }
            }
        }
        const member = await Member.findByPk(member_id);
        if (!member) return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');

        const enrollmentWhere = {
            ...(await ticketHolderWhere(member_id)),
            delete_status: 0
        };
        if (groupId) {
            enrollmentWhere.group_id = groupId;
        }

        const enrollments = await Enrollment.findAll({
            where: enrollmentWhere,
            include: [
                { model: ChitsGroup, as: 'group', where: { is_deleted_status: 0 }, required: true },
                { model: Member, as: 'subscriber' },
                {
                    model: EnrollmentJointHolder,
                    as: 'joint_holders',
                    required: false,
                    where: { removed_on: null },
                    include: [{ model: Member, as: 'member' }]
                }
            ]
        });

        if (enrollments.length === 0) {
            return successResponse(res, statusCodes.OK, 'Member dues', {
                id: member.id,
                name: member.name,
                member_id: member.member_id,
                profile_image: member.upload_image,
                gender: member.gender,
                group_id: groupId || null,
                group_name: null,
                ticket_member_number: null,
                total_due: 0,
                total_paid: 0,
                balance: 0,
                penalty_amount: 0,
                penalty_text: 'No penalty',
                older_due_months: null
            });
        }

        const ALPHABETS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        const ticketList = enrollments.map(e => {
            const isMain = Number(e.subscriber_id) === Number(member_id);
            const jointList = (e.joint_holders || []).filter(j => !j.removed_on);
            const isJoint = jointList.length > 0;
            let letter = null;
            if (isJoint) {
                if (isMain) {
                    letter = 'A';
                } else {
                    const jIdx = jointList.findIndex(j => Number(j.member_id) === Number(member_id));
                    letter = jIdx >= 0 ? (ALPHABETS[jIdx + 1] || String.fromCharCode(66 + jIdx)) : null;
                }
            }
            const pos = e.group_position_number != null ? '#' + String(e.group_position_number).padStart(2, '0') : `#${e.id}`;
            return letter ? `${pos}-${letter}` : pos;
        });

        const ticketNumbersFormatted = ticketList.join(', ');

        const businessDateObj = await SystemSettingsService.getBusinessDate();
        let currentDateStr;
        if (businessDateObj instanceof Date) {
            const year = businessDateObj.getFullYear();
            const month = String(businessDateObj.getMonth() + 1).padStart(2, '0');
            const day = String(businessDateObj.getDate()).padStart(2, '0');
            currentDateStr = `${year}-${month}-${day}`;
        } else {
            currentDateStr = String(businessDateObj).split('T')[0];
        }
        const simulatedNow = new Date(currentDateStr);

        let total_due = 0;
        let total_paid = 0;
        let balance = 0;
        let penalty_amount = 0;
        let oldest_due = null;
        let penalty_text = 'No penalty';
        let group_names = [...new Set(enrollments.map(e => e.group ? e.group.group_name : '').filter(Boolean))].join(', ');

        const enrollmentIds = enrollments.map(e => e.id);
        const installments = await ChitsInstallment.findAll({
            where: { enrollment_id: { [Op.in]: enrollmentIds } },
            order: [['due_date', 'ASC'], ['installment_no', 'ASC']]
        });

        const payments = await CustomerPayment.findAll({
            where: { payment_status: { [Op.in]: [0, 1] } },
            include: [
                {
                    model: ChitsInstallment,
                    as: 'installment',
                    where: { enrollment_id: { [Op.in]: enrollmentIds } }
                },
                {
                    model: CollectionAgentAmount,
                    as: 'collection_submission'
                }
            ]
        });

        let oldest_due_date_obj = null;
        let oldest_due_days = 0;
        let total_penalty = 0;

        const groupIds = [...new Set(enrollments.map(e => e.group_id).filter(Boolean))];
        const auctions = await Auction.findAll({
            where: { group_id: { [Op.in]: groupIds } },
            order: [['auction_number', 'ASC']]
        });

        installments.forEach(inst => {
            const e = enrollments.find(en => en.id === inst.enrollment_id);
            if (!e) return;

            const effectiveInstPayable = calculateEffectiveInstallmentPayable(inst, e, e.group, auctions);
            const holders = getEnrollmentHolders(e);
            const relatedPayments = payments.filter(p => p.chits_installment_id === inst.id);
            const dues = getHolderInstallmentDues(inst, e, holders, relatedPayments, simulatedNow, effectiveInstPayable);

            const myDue = dues.find(d => Number(d.holder.member_id) === Number(member_id));
            if (!myDue) return;

            total_due += myDue.payable;
            total_paid += myDue.received;

            if (myDue.penalty > 0) {
                total_penalty += myDue.penalty;
            }

            if (myDue.pending > 0 || myDue.penalty > 0) {
                const instDate = new Date(inst.due_date);
                if (!oldest_due_date_obj || instDate < oldest_due_date_obj) {
                    oldest_due_date_obj = instDate;
                    oldest_due = inst.due_date;

                    if (myDue.isOverdue) {
                        const dueDate = new Date(inst.due_date);
                        dueDate.setHours(0, 0, 0, 0);
                        const diffTime = simulatedNow.getTime() - dueDate.getTime();
                        oldest_due_days = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
                    } else {
                        oldest_due_days = 0;
                    }
                }
            }
        });

        if (total_penalty > 0 && oldest_due_days > 0) {
            penalty_amount = total_penalty;
            penalty_text = formatPenaltyCalculationText(penalty_amount, oldest_due_days);
        } else if (total_penalty > 0) {
            penalty_amount = total_penalty;
            penalty_text = `₹${parseFloat(penalty_amount.toFixed(2))}`;
        }

        balance = total_due - total_paid;

        return successResponse(res, statusCodes.OK, 'Member dues', {
            id: member.id,
            name: member.name,
            member_id: member.member_id,
            profile_image: member.upload_image,
            gender: member.gender,
            group_id: groupId || (enrollments.length === 1 ? enrollments[0].group_id : null),
            group_name: group_names,
            ticket_member_number: ticketNumbersFormatted,
            total_due: parseFloat(total_due.toFixed(2)),
            total_paid: parseFloat(total_paid.toFixed(2)),
            balance: parseFloat(balance.toFixed(2)),
            penalty_amount: parseFloat(penalty_amount.toFixed(2)),
            penalty_text,
            older_due_months: oldest_due
        });
    } catch (error) {
        console.error('Error in getMemberDuesService:', error);
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

        const businessDateObj = await SystemSettingsService.getBusinessDate();
        let currentDateStr;
        if (businessDateObj instanceof Date) {
            const year = businessDateObj.getFullYear();
            const month = String(businessDateObj.getMonth() + 1).padStart(2, '0');
            const day = String(businessDateObj.getDate()).padStart(2, '0');
            currentDateStr = `${year}-${month}-${day}`;
        } else {
            currentDateStr = String(businessDateObj).split('T')[0];
        }
        const simulatedNow = new Date(currentDateStr);
        const paymentDateVal = payload.paid_date || currentDateStr;

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
            paid_date: paymentDateVal,
            status: 0
        }, { transaction });

        // Clearance Logic
        // Only the chits this agent services: money an agent collects must never pay
        // an installment on a chit assigned to another agent, or the collection is
        // credited to that agent in every report.
        const enrollments = await Enrollment.findAll({
            where: {
                ...(await ticketHolderWhere(member_id)),
                delete_status: 0,
                collection_agent_id
            },
            include: [
                { model: ChitsGroup, as: 'group' },
                { model: Member, as: 'subscriber' },
                {
                    model: EnrollmentJointHolder,
                    as: 'joint_holders',
                    required: false,
                    where: { removed_on: null },
                    include: [{ model: Member, as: 'member' }]
                }
            ]
        });

        const enrollmentIds = enrollments.map(e => e.id);
        const installments = await ChitsInstallment.findAll({
            where: { enrollment_id: { [Op.in]: enrollmentIds } },
            order: [['due_date', 'ASC'], ['installment_no', 'ASC']] // Oldest first
        });

        const allPayments = await CustomerPayment.findAll({
            where: { payment_status: { [Op.in]: [0, 1] } },
            include: [
                {
                    model: ChitsInstallment,
                    as: 'installment',
                    where: { enrollment_id: { [Op.in]: enrollmentIds } }
                },
                {
                    model: CollectionAgentAmount,
                    as: 'collection_submission'
                }
            ]
        });

        let remaining_amount = parseFloat(amount);

        const groupIds = [...new Set(enrollments.map(e => e.group_id).filter(Boolean))];
        const auctions = await Auction.findAll({
            where: { group_id: { [Op.in]: groupIds } },
            order: [['auction_number', 'ASC']]
        });

        for (const inst of installments) {
            if (remaining_amount <= 0) break;

            const e = enrollments.find(e => e.id === inst.enrollment_id);
            if (!e) continue;

            const effectiveInstPayable = calculateEffectiveInstallmentPayable(inst, e, e.group, auctions);
            const holders = getEnrollmentHolders(e);
            const relatedPayments = allPayments.filter(p => p.chits_installment_id === inst.id);
            const dues = getHolderInstallmentDues(inst, e, holders, relatedPayments, simulatedNow, effectiveInstPayable);

            const myDue = dues.find(d => Number(d.holder.member_id) === Number(member_id));
            if (!myDue) continue;

            let pending_installment = myDue.pending;
            let pending_penalty = myDue.penalty;

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
                    const group = e.group;
                    const newReceiptNumber = await generateReceiptNumber(group ? group.company_id : null, transaction);
                    await CustomerPayment.create({
                        chits_installment_id: inst.id,
                        received_amount: payment_for_this_inst,
                        penalty_paid: penalty_for_this_inst,
                        payment_status: 0, // Pending Admin Approval
                        receipt_number: newReceiptNumber,
                        collection_agent_amount_id: submission.id,
                        payment_date: paymentDateVal,
                        payment_mode: submission.payment_type || null,
                        transaction_reference: submission.transaction_id || submission.cheque_number || null
                    }, { transaction });
                }
            }
        }

        // If there is still excess remaining after all pending dues have been covered, apply to the last installment as advance
        if (remaining_amount > 0 && installments.length > 0) {
            const lastInst = installments[installments.length - 1];
            const e = enrollments.find(e => e.id === lastInst.enrollment_id);
            const group = e ? e.group : null;
            const newReceiptNumber = await generateReceiptNumber(group ? group.company_id : null, transaction);
            await CustomerPayment.create({
                chits_installment_id: lastInst.id,
                received_amount: remaining_amount,
                penalty_paid: 0,
                payment_status: 0,
                receipt_number: newReceiptNumber,
                collection_agent_amount_id: submission.id,
                payment_date: paymentDateVal,
                payment_mode: submission.payment_type || null,
                transaction_reference: submission.transaction_id || submission.cheque_number || null
            }, { transaction });
            remaining_amount = 0;
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
                    `Payment of ₹${amount} collected by ${agentName}. It shows as paid; your receipt number will appear once the office confirms it.`,
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
        const enrollmentWhere = { ...(await ticketHolderWhere(subscriber_id)), delete_status: 0 };
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
            where: { payment_status: { [Op.in]: [0, 1, 2] } },
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
                },
                {
                    model: CollectionAgentAmount,
                    as: 'collection_submission',
                    required: false
                }
            ],
            order: [
                ['payment_date', 'DESC'],
                ['createdAt', 'DESC']
            ],
            limit,
            offset
        });

        const formattedRows = [];
        for (const payment of rows) {
            const payerId = payment.collection_submission ? Number(payment.collection_submission.member_id) : (payment.payer_member_id ? Number(payment.payer_member_id) : null);
            if (payerId && payerId !== Number(subscriber_id)) {
                continue;
            }

            const inst = payment.installment;
            const group = inst && inst.enrollment ? inst.enrollment.group : null;

            const received = parseFloat(payment.received_amount) || 0;
            const penalty = parseFloat(payment.penalty_paid) || 0;

            let status_label = 'Confirmed';
            if (payment.payment_status === 0) status_label = 'Awaiting office confirmation';
            else if (payment.payment_status === 2) status_label = 'Not confirmed by office';

            formattedRows.push({
                id: payment.id,
                payment_id: payment.id,
                receipt_id: payment.receipt_number || null,
                receipt_number: payment.receipt_number,
                payment_date: payment.payment_date || null,
                group_id: group ? group.id : null,
                group_name: group ? group.group_name : 'Unknown',
                installment_no: inst ? inst.installment_no : null,
                received_amount: received.toFixed(2),
                penalty_paid: penalty.toFixed(2),
                total_paid: (received + penalty).toFixed(2),
                payment_mode: payment.payment_mode,
                transaction_reference: payment.transaction_reference,
                payment_status: payment.payment_status,
                status_label
            });
        }

        return successResponse(res, statusCodes.OK, 'Payment history retrieved successfully', {
            count: formattedRows.length,
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
                    required: false,
                    include: [{ model: Member, as: 'member' }]
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

        const isSubscriber = await isTicketHolder(enrollment, subscriber_id);
        const isAgentForPayment = submission && submission.collection_agent_id === subscriber_id;

        // Verify it belongs to this subscriber or was collected by this agent
        if (!isSubscriber && !isAgentForPayment) {
            return errorResponse(res, statusCodes.FORBIDDEN, 'You are not authorized to view this receipt');
        }

        const group = enrollment.group;
        const subscriber = (submission && submission.member) ? submission.member : enrollment.subscriber;
        const company = group ? group.company : null;

        const received = parseFloat(payment.received_amount) || 0;
        const penalty = parseFloat(payment.penalty_paid) || 0;

        const responseData = {
            id: payment.id,
            payment_id: payment.id,
            receipt_id: payment.receipt_number || null,
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
            member_name: (submission && submission.member) ? (submission.member.name || `${submission.member.rep_by_first_name || ''} ${submission.member.sur_name || ''}`.trim() || 'Unknown') : ((await holderNamesByEnrollment([enrollment.id]))[enrollment.id] || (subscriber ? subscriber.name : 'Unknown')),
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

/** The member's 9-document checklist in one group (shared by the documents list and the one-Save upload). */
const memberDocumentsView = async (group_id, member_id) => {
    const docRecord = await MemberDocument.findOne({ where: { group_id, member_id } });
    const documents = docRecord && docRecord.documents ? docRecord.documents : {};
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

    return result;
};

const getMemberDocumentsService = async (res, userPayload, group_id, member_id) => {
    try {
        if (!userPayload) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Unauthorized access');

        const result = await memberDocumentsView(group_id, member_id);

        // Optional sureties on the member's ticket(s) this agent collects for (empty otherwise).
        const { suretiesBlock } = require('./agentSuretyService');
        const sureties = await suretiesBlock(userPayload, { group_id, member_id });

        return successResponse(res, statusCodes.OK, 'Member documents retrieved', { documents: result, sureties });
    } catch (error) {
        console.error('Error in getMemberDocumentsService:', error);
        return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
    }
};

const getDocumentSubmissionsService = async (res, userPayload, body) => {
    try {
        const { collection_agent_id, min, max } = body;
        const limit = parseInt(max, 10) || 50;
        const offset = parseInt(min, 10) || 0;

        const enrollments = await Enrollment.findAll({
            where: { collection_agent_id, delete_status: 0 },
            include: [
                { model: Member, as: 'subscriber', attributes: ['id', 'name', 'member_id'] },
                { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name'] }
            ],
            raw: true,
            nest: true
        });

        const uniqueKeys = new Set();
        const targets = [];
        for (const e of enrollments) {
            if (!e.subscriber || !e.group) continue;
            const key = `${e.group_id}_${e.subscriber.id}`;
            if (!uniqueKeys.has(key)) {
                uniqueKeys.add(key);
                targets.push({
                    group_id: e.group_id,
                    group_name: e.group.group_name,
                    member_id: e.subscriber.id,
                    member_name: e.subscriber.name,
                    member_code: e.subscriber.member_id
                });
            }
        }

        const groupIds = [...new Set(targets.map(t => t.group_id))];
        const memberIds = [...new Set(targets.map(t => t.member_id))];

        const documents = await MemberDocument.findAll({
            where: {
                group_id: { [Op.in]: groupIds },
                member_id: { [Op.in]: memberIds }
            },
            raw: true
        });

        const docMap = {};
        for (const d of documents) {
            docMap[`${d.group_id}_${d.member_id}`] = d;
        }

        const rows = [];
        for (const t of targets) {
            const key = `${t.group_id}_${t.member_id}`;
            const docRecord = docMap[key];
            if (!docRecord || !docRecord.documents) continue;

            const docs = Object.values(docRecord.documents);
            let submitted_count = 0;
            let last_submitted_at = null;
            let hasSubmittedOrRejected = false;

            for (const d of docs) {
                if (d.status >= 1) hasSubmittedOrRejected = true;
                if (d.status === 1) {
                    submitted_count++;
                    if (d.uploaded_at) {
                        if (!last_submitted_at || new Date(d.uploaded_at) > new Date(last_submitted_at)) {
                            last_submitted_at = d.uploaded_at;
                        }
                    }
                }
            }

            if (hasSubmittedOrRejected) {
                rows.push({
                    ...t,
                    submitted_count,
                    total_count: 4,
                    last_submitted_at
                });
            }
        }

        rows.sort((a, b) => {
            const dateA = a.last_submitted_at ? new Date(a.last_submitted_at).getTime() : 0;
            const dateB = b.last_submitted_at ? new Date(b.last_submitted_at).getTime() : 0;
            return dateB - dateA;
        });

        const total = rows.length;
        const paginatedRows = rows.slice(offset, offset + limit);

        return successResponse(res, statusCodes.OK, 'Document submissions retrieved successfully', {
            rows: paginatedRows,
            total
        });
    } catch (error) {
        console.error('Error in getDocumentSubmissionsService:', error);
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

        const formattedRows = await Promise.all(rows.map(async (r) => {
            const item = r.toJSON ? r.toJSON() : { ...r };
            if (item.body && item.body.includes('undefined')) {
                const groupId = item.data_payload ? (item.data_payload.group_id || item.data_payload.groupId) : null;
                let gName = 'Chit Group';
                if (groupId) {
                    const g = await ChitsGroup.findByPk(groupId);
                    if (g && g.group_name) gName = g.group_name;
                }
                item.body = item.body
                    .replace(/Chit Group: undefined/g, `Chit Group: ${gName}`)
                    .replace(/Chit undefined/g, `Chit ${gName}`)
                    .replace(/undefined/g, gName);
            }
            return item;
        }));

        return successResponse(res, statusCodes.OK, 'Notification history retrieved successfully', {
            unread_count,
            count,
            rows: formattedRows
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

        const enrollments = await Enrollment.findAll({
            where: { group_id, delete_status: 0 },
            include: [
                {
                    model: Member,
                    as: 'subscriber',
                    attributes: ['id', 'name', 'member_id', ['mobile_number', 'phone_number'], ['upload_image', 'profile_image'], 'gender']
                },
                {
                    model: EnrollmentJointHolder,
                    as: 'joint_holders',
                    required: false,
                    where: { removed_on: null },
                    include: [{
                        model: Member,
                        as: 'member',
                        attributes: ['id', 'name', 'member_id', ['mobile_number', 'phone_number'], ['upload_image', 'profile_image'], 'gender']
                    }]
                }
            ]
        });

        const memberMap = new Map();
        enrollments.forEach(e => {
            if (e.subscriber) {
                memberMap.set(e.subscriber.id, e.subscriber);
            }
            if (e.joint_holders) {
                e.joint_holders.forEach(j => {
                    if (j.member) {
                        memberMap.set(j.member.id, j.member);
                    }
                });
            }
        });

        let allMembers = Array.from(memberMap.values());
        if (search) {
            const s = search.toLowerCase();
            allMembers = allMembers.filter(m => {
                const name = (m.name || '').toLowerCase();
                const memId = (m.member_id || '').toLowerCase();
                return name.includes(s) || memId.includes(s);
            });
        }

        const totalCount = allMembers.length;
        const pagedMembers = allMembers.slice(offset, offset + limit);
        const memberIds = pagedMembers.map(m => m.id);

        const activeChitsCounts = await Promise.all(
            memberIds.map(async (mId) => {
                const count = await Enrollment.count({
                    where: {
                        ...(await ticketHolderWhere(mId)),
                        delete_status: 0
                    },
                    include: [{
                        model: ChitsGroup,
                        as: 'group',
                        attributes: [],
                        where: { chits_group_status: { [Op.in]: [0, 1] }, is_deleted_status: 0 }
                    }]
                });
                return { id: mId, count };
            })
        );
        const activeChitsMap = {};
        activeChitsCounts.forEach(c => { activeChitsMap[c.id] = c.count; });

        const members = pagedMembers.map(m => {
            const memberData = m.toJSON ? m.toJSON() : { ...m };
            memberData.active_chits = activeChitsMap[memberData.id] || 0;
            return memberData;
        });

        return successResponse(res, statusCodes.OK, 'Members retrieved successfully', { count: totalCount, rows: members });
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

        // Distinct members across main subscribers and joint holders for this collection agent
        const enrollments = await Enrollment.findAll({
            where: { collection_agent_id, delete_status: 0 },
            include: [
                {
                    model: EnrollmentJointHolder,
                    as: 'joint_holders',
                    required: false,
                    where: { removed_on: null },
                    attributes: ['member_id']
                }
            ]
        });

        const allMemberIds = new Set();
        enrollments.forEach(e => {
            if (e.subscriber_id) allMemberIds.add(e.subscriber_id);
            (e.joint_holders || []).forEach(j => {
                if (j.member_id) allMemberIds.add(j.member_id);
            });
        });

        const distinctSubscriberIds = Array.from(allMemberIds);

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

        const activeChitsCounts = await Promise.all(
            memberIds.map(async (mId) => {
                const count = await Enrollment.count({
                    where: {
                        ...(await ticketHolderWhere(mId)),
                        delete_status: 0
                    },
                    include: [{
                        model: ChitsGroup,
                        as: 'group',
                        attributes: [],
                        where: { chits_group_status: { [Op.in]: [0, 1] }, is_deleted_status: 0 }
                    }]
                });
                return { id: mId, count };
            })
        );
        const activeChitsMap = {};
        activeChitsCounts.forEach(c => { activeChitsMap[c.id] = c.count; });

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
                where: { chits_group_status: { [Op.in]: [0, 1] } },
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
                            where: { ...(await ticketHolderWhere(member_id)), delete_status: 0 },
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

            let status_label = 'Confirmed';
            if (payment.payment_status === 0) status_label = 'Awaiting office confirmation';
            else if (payment.payment_status === 2) status_label = 'Not confirmed by office';

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
                status_label,
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
    getDocumentSubmissionsService,
    getMemberDocumentsService,
    memberDocumentsView,
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
    getBusinessAgentMemberJoinedService,
    getEnrollmentHolders,
    getHolderInstallmentDues,
    formatPenaltyCalculationText
};
