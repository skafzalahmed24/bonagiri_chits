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

function getSchemeOriginalAmount(schemeConfig, auctionOrMonth, isWithdrawn = false) {
  if (!schemeConfig) {
    return parseFloat(auctionOrMonth?.subscription_amount) || 0.00;
  }

  const prices = typeof schemeConfig.prices === 'string' ? JSON.parse(schemeConfig.prices) : schemeConfig.prices;

  const auctionNumber = typeof auctionOrMonth === 'number'
    ? auctionOrMonth
    : (auctionOrMonth?.auction_number || 1);

  const withdrawn = Boolean(
    isWithdrawn ||
    (typeof auctionOrMonth === 'object' && auctionOrMonth !== null && (auctionOrMonth.is_withdrawn || auctionOrMonth.isWithdrawn))
  );

  if (schemeConfig.scheme_type === 63) {
    return parseFloat(schemeConfig.installment) || 0.00;
  }
  if (schemeConfig.scheme_type === 62) {
    const row = prices?.[auctionNumber - 1];
    if (withdrawn && row?.withdrawn != null) {
      return parseFloat(row.withdrawn) || 0.00;
    }
    return parseFloat(row?.not_withdrawn) || 0.00;
  }
  const row = prices?.[auctionNumber - 1];
  return parseFloat(row?.installment) || 0.00;
}

/**
 * Due date of the last monthly instalment of a group: instalment 1 falls on the start date, then on
 * the due day of each following month (clamped in short months) - the same stepping the instalment
 * schedule uses. This is the chit's end date. Returns 'YYYY-MM-DD' or null.
 */
function lastInstalmentDate(startDateStr, noOfInstallments, dueDay) {
  const n = parseInt(noOfInstallments, 10);
  const parts = String(startDateStr || '').slice(0, 10).split('-').map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d || !(n > 0)) return null;
  if (n === 1) return String(startDateStr).slice(0, 10);
  const day = parseInt(dueDay, 10) || d;
  const idx = (m - 1) + (n - 1);
  const yy = y + Math.floor(idx / 12);
  const mm = idx % 12;
  const dd = Math.min(day, new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate());
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// ---- Open-auction months
//
// Chit Funds Act 1982, s.21(1)(a): the foreman (company) takes the chit amount at its own month
// without discount, so that month has no auction and no dividend. s.22(6): a dividend is adjusted
// "towards the subscriptions payable for the next instalment". So for an open-auction group:
//   - the company month (company_chit_number) is never auctioned: auction numbers skip it;
//   - the last instalment is not auctioned for a discount: its winner is recorded at the full chit amount;
//   - the dividend of the auction in month N reduces the instalment of the next month that is not
//     the company month.

/** The company's month in an open-auction group, or null (legacy single-month helper). */
function openCompanyMonth(group) {
  const n = parseInt(group && group.company_chit_number, 10);
  return n > 0 ? n : null;
}

/**
 * Synchronous extraction of company seats from group and optional selfChits list.
 */
function extractCompanySeats(group, selfChitsList = null) {
  const seats = new Set();
  const companyChitNum = parseInt(group && group.company_chit_number, 10);
  if (companyChitNum > 0) {
    seats.add(companyChitNum);
  }

  const isSelfChitAsCompany = group && (
    group.self_chits_as_company_months === true ||
    group.self_chits_as_company_months === 1 ||
    group.self_chits_as_company_months === '1'
  );

  const list = selfChitsList !== null ? selfChitsList : (group && group.self_chits ? group.self_chits : []);

  if (isSelfChitAsCompany && Array.isArray(list)) {
    for (const sc of list) {
      const slot = parseInt(typeof sc === 'object' && sc !== null ? sc.slot_id : sc, 10);
      if (slot > 0) {
        seats.add(slot);
      }
    }
  }
  return Array.from(seats).sort((a, b) => a - b);
}

/**
 * Async resolution of all company seat/month numbers for a group.
 * If self_chits_as_company_months is enabled on the group, combines company_chit_number
 * with all active SelfChit.slot_id records.
 */
async function getGroupCompanySeats(groupOrGroupId, groupRecord = null, transaction = null) {
  const { ChitsGroup, SelfChit } = require('../models');
  let group = groupRecord;
  let groupId = null;

  if (typeof groupOrGroupId === 'object' && groupOrGroupId !== null) {
    group = groupOrGroupId;
    groupId = group.id;
  } else if (groupOrGroupId) {
    groupId = groupOrGroupId;
    if (!group) {
      group = await ChitsGroup.findByPk(groupId, {
        attributes: ['id', 'company_chit_number', 'self_chits_as_company_months', 'auction_type', 'no_of_installments'],
        transaction
      });
    }
  }

  const seats = new Set();
  const companyChitNum = parseInt(group && group.company_chit_number, 10);
  if (companyChitNum > 0) {
    seats.add(companyChitNum);
  }

  const isSelfChitAsCompany = group && (
    group.self_chits_as_company_months === true ||
    group.self_chits_as_company_months === 1 ||
    group.self_chits_as_company_months === '1'
  );

  if (isSelfChitAsCompany && groupId) {
    const selfChits = await SelfChit.findAll({
      where: { group_id: groupId, is_deleted_status: 0 },
      attributes: ['slot_id'],
      transaction
    });
    for (const sc of selfChits) {
      const slot = parseInt(sc.slot_id, 10);
      if (slot > 0) {
        seats.add(slot);
      }
    }
  }

  return Array.from(seats).sort((a, b) => a - b);
}

/** The auction number to record next, skipping all company months. */
function nextOpenAuctionNumber(lastRecorded, group, companySeats = null) {
  let seats = companySeats;
  if (!Array.isArray(seats)) {
    seats = extractCompanySeats(group);
  }
  let n = (parseInt(lastRecorded, 10) || 0) + 1;
  while (seats.includes(n)) {
    n += 1;
  }
  const total = parseInt(group && group.no_of_installments, 10) || 0;
  if (total > 0 && n > total) return null;
  return n;
}

/** Is this auction number the group's last instalment (no discount, no dividend)? */
function isFinalOpenMonth(auctionNumber, group) {
  const total = parseInt(group && group.no_of_installments, 10) || 0;
  return total > 0 && parseInt(auctionNumber, 10) === total;
}

/** The instalment number the dividend of auction `auctionNumber` reduces, or null when there is none. */
function dividendTargetMonth(auctionNumber, group, companySeats = null) {
  let seats = companySeats;
  if (!Array.isArray(seats)) {
    seats = extractCompanySeats(group);
  }
  let t = (parseInt(auctionNumber, 10) || 0) + 1;
  while (seats.includes(t)) {
    t += 1;
  }
  const total = parseInt(group && group.no_of_installments, 10) || 0;
  return t <= total ? t : null;
}

/** The instalment number an auction's dividend was applied to (older auctions: their own month). */
function dividendMonthOf(auction) {
  if (!auction) return null;
  return auction.dividend_installment_no != null ? Number(auction.dividend_installment_no) : Number(auction.auction_number);
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

/**
 * How much of an auction's dividend still has to be added to an enrollment's running
 * `dividend_credit_balance`. First recording (previousDividend null/undefined): the whole per-member
 * share. Re-saving an existing auction: only the change since the dividend that was applied before,
 * so saving the same auction again adds 0 (SEC-7).
 */
function dividendBalanceIncrement({ rawDividend, divisor, previousDividend = null }) {
  const div = divisor > 0 ? divisor : 1;
  const now = parseFloat(rawDividend) || 0;
  if (previousDividend === null || previousDividend === undefined) {
    return now / div;
  }
  const before = parseFloat(previousDividend) || 0;
  return (now - before) / div;
}

/**
 * `previousDividend` (option): the dividend already stored on the auction before this save. Pass it
 * when re-saving an existing auction; leave it out for a brand-new auction.
 */
async function applyOpenAuctionAdjustments(auctionData, winnerEnrollmentId, groupId, transaction = null, { previousDividend = null } = {}) {
  const { Enrollment, ChitsGroup, ChitsInstallment } = require('../models');
  const options = transaction ? { transaction } : {};

  // The dividend reduces the next non-company month's instalment (see "Open-auction months" above).
  let target = auctionData.dividend_installment_no != null
    ? Number(auctionData.dividend_installment_no)
    : null;

  if (target === null) {
    const grp = await ChitsGroup.findByPk(groupId, {
      attributes: ['id', 'no_of_installments', 'company_chit_number', 'self_chits_as_company_months'],
      ...options
    });
    const companySeats = await getGroupCompanySeats(groupId, grp, transaction);
    target = dividendTargetMonth(auctionData.auction_number, grp, companySeats);
  }
  if (!target) return; // last instalment: nothing to adjust

  const allEnrollments = await Enrollment.findAll({
    where: { group_id: groupId, delete_status: 0 },
    ...options
  });

  // Act standard: divide dividend among ALL N members (including winner)
  const divisor = allEnrollments.length > 0 ? allEnrollments.length : 1;
  const rawDividend = parseFloat(auctionData.dividend) || 0;
  const dividendPerMember = divisor > 0 ? rawDividend / divisor : 0;
  const subscription = parseFloat(auctionData.subscription_amount) || 0;
  const rawNet = auctionData.net_payable !== undefined && auctionData.net_payable !== null && !isNaN(parseFloat(auctionData.net_payable))
    ? parseFloat(auctionData.net_payable)
    : Math.max(0, subscription - dividendPerMember);
  const netPayableFromAuction = isNaN(rawNet) || rawNet <= 0 ? (subscription > 0 ? subscription : 0) : rawNet;

  // Apply dividend to ALL members (including winner)
  for (const enrollment of allEnrollments) {
    // Track cumulative dividends for accounting/reporting
    // Only add what is new: a re-save of the same auction must not add the dividend again (SEC-7).
    const balanceStep = dividendBalanceIncrement({ rawDividend, divisor, previousDividend });
    if (balanceStep !== 0 && !isNaN(balanceStep)) {
      const currentBalance = parseFloat(enrollment.dividend_credit_balance) || 0;
      const newBalance = Math.max(0, currentBalance + balanceStep);
      await enrollment.update({ dividend_credit_balance: newBalance }, options);
    }

    // Use THIS auction's dividend only — not the cumulative balance
    // (dividend_credit_balance is for accounting; installment uses single-month dividend)
    await ChitsInstallment.update(
      { payable_amount: Math.max(0, netPayableFromAuction) },
      { where: { enrollment_id: enrollment.id, installment_no: target }, ...options }
    );
  }

  // Winner's later installments stay at base subscription (unchanged)
  if (winnerEnrollmentId) {
    await ChitsInstallment.update(
      { payable_amount: subscription },
      { where: { enrollment_id: winnerEnrollmentId, installment_no: { [Op.gt]: target } }, ...options }
    );
  }
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Bid rules for an open-auction group (shared by auction store-or-update and record-winner):
 * 0 < bid <= chit amount, and bid >= chit x (1 - max ceiling %). Max ceiling 0 / empty = no ceiling.
 * Returns { ok, message, minBid }.
 */
function validateOpenAuctionBid({ bidAmount, chitAmount, maxCeilingPct, checkCeiling = true }) {
  const bid = Number(bidAmount);
  const chit = parseFloat(chitAmount) || 0;
  if (bidAmount === null || bidAmount === undefined || bidAmount === '' || !Number.isFinite(bid) || bid <= 0) {
    return { ok: false, message: 'Bid amount must be greater than 0', minBid: null };
  }
  if (chit > 0 && bid > chit + 0.005) {
    return { ok: false, message: `Bid amount cannot be more than the chit amount (₹${round2(chit)})`, minBid: null };
  }
  const ceiling = parseFloat(maxCeilingPct) || 0;
  if (checkCeiling && ceiling > 0 && chit > 0) {
    const minBid = round2(chit * (1 - ceiling / 100));
    if (bid < minBid - 0.005) {
      return { ok: false, message: `Bid amount cannot be lower than the maximum discount floor (₹${minBid})`, minBid };
    }
    return { ok: true, message: null, minBid };
  }
  return { ok: true, message: null, minBid: null };
}

/**
 * capToDiscount (default true): when commission + GST would be more than the auction discount
 * (chit - bid), they are reduced so that commission + GST = discount (GST keeps its % of the
 * commission) and the dividend is 0. `commissionCapped` / `requestedCommission` / `requestedGst`
 * report what happened. Pass false for the last instalment (recorded at the full chit amount,
 * no discount by design).
 */
function calculateOpenAuctionFinancials({ chitAmount, installments, bidAmount, commissionPct, memberCount, gstPercentage = 0, capToDiscount = true }) {
  const cAmt = parseFloat(chitAmount) || 0;
  const instCount = parseInt(installments, 10) || 1;
  const bidAmt = parseFloat(bidAmount) || 0;
  const commPct = parseFloat(commissionPct) || 0;
  const mCount = parseInt(memberCount, 10) || instCount || 1;

  const subscription = cAmt / (instCount > 0 ? instCount : 1);
  let commission = cAmt * (commPct / 100);
  const gstPct = (gstPercentage !== undefined && gstPercentage !== null && !isNaN(parseFloat(gstPercentage)))
    ? parseFloat(gstPercentage)
    : 0;
  let gst = commission * (gstPct / 100);
  const bidDiscount = cAmt - bidAmt;
  const requestedCommission = commission;
  const requestedGst = gst;
  let commissionCapped = false;
  let totalDividend = Math.max(0, bidDiscount - commission - gst);
  if (capToDiscount && commission + gst > Math.max(0, bidDiscount) + 0.005) {
    const room = Math.max(0, bidDiscount);
    commission = round2(room / (1 + gstPct / 100));
    gst = round2(room - commission);
    totalDividend = 0;
    commissionCapped = true;
  }
  const divisor = mCount > 0 ? mCount : 1; // all N members (Act standard)
  const dividendPerMember = totalDividend / divisor;
  const netPayable = Math.max(0, subscription - dividendPerMember);
  const winnerReceives = bidAmt; // full bid amount — commission deducted from pool only, not from winner
  
  return {
    subscription: isNaN(subscription) ? 0 : subscription,
    commission: isNaN(commission) ? 0 : commission,
    gst: isNaN(gst) ? 0 : gst,
    bidDiscount: isNaN(bidDiscount) ? 0 : bidDiscount,
    totalDividend: isNaN(totalDividend) ? 0 : totalDividend,
    dividendPerMember: isNaN(dividendPerMember) ? 0 : dividendPerMember,
    netPayable: isNaN(netPayable) ? subscription : netPayable,
    winnerReceives: isNaN(winnerReceives) ? 0 : winnerReceives,
    gstPct,
    commissionCapped,
    requestedCommission: isNaN(requestedCommission) ? 0 : requestedCommission,
    requestedGst: isNaN(requestedGst) ? 0 : requestedGst
  };
}

const isBlankSent = (v) => v === undefined || v === null || v === '';

// Numeric compare rounded to 2 dp. Blank sent value = unchanged; non-numeric sent value = changed.
// Stored DECIMAL values come back from Sequelize as strings ("16000.00"), so String() compares are wrong.
function numberFieldChanged(sent, stored) {
  if (isBlankSent(sent)) return false;
  const a = Number(sent);
  if (!Number.isFinite(a)) return true;
  const b = Number(stored);
  if (!Number.isFinite(b)) return true;
  const r = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  return r(a) !== r(b);
}

// Ids are compared by exact string identity (never Number()/parseInt(), L2). Blank sent = unchanged.
function idFieldChanged(sent, stored) {
  if (isBlankSent(sent)) return false;
  return String(sent).trim() !== String(stored === null || stored === undefined ? '' : stored).trim();
}

// True when an auction edit changes the bidder, ticket or bid amount (the fields a prize payment is tied to).
function auctionPrizeKeyFieldsChanged(input, stored) {
  return idFieldChanged(input.bidder_id, stored.bidder_id) ||
    numberFieldChanged(input.ticket_number, stored.ticket_number) ||
    numberFieldChanged(input.bid_amount, stored.bid_amount);
}

module.exports = {
  numberFieldChanged,
  idFieldChanged,
  auctionPrizeKeyFieldsChanged,
  getSchemeWinningAmount,
  getSchemeOriginalAmount,
  applyWinnerSchemeAdjustments,
  applyOpenAuctionAdjustments,
  calculateOpenAuctionFinancials,
  validateOpenAuctionBid,
  dividendBalanceIncrement,
  openCompanyMonth,
  getGroupCompanySeats,
  extractCompanySeats,
  nextOpenAuctionNumber,
  isFinalOpenMonth,
  lastInstalmentDate,
  dividendTargetMonth,
  dividendMonthOf
};
