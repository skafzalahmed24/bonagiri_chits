// Pure money rules for the admin direct receipt (POST /api/customer-payment/store-direct).
// No database access here, so they can be unit-tested (see docs/team/bugs/2026-10-21-receipt-penalty-prefill-includes-paid.md).
const { penaltyOwed } = require('./installmentBalanceHelper');

// Whole paise, rounded half up on the decimal text the caller typed, the same way PostgreSQL rounds
// NUMERIC(15,2): 516.675 becomes 516.68 (Math.round(516.675 * 100) would give 51667 because of the
// binary double). Meant for amounts of 0 or more that Joi has already limited (negative amounts would
// round toward zero, unlike PostgreSQL, and values near 1.8e308 are not handled). Anything that is not
// a finite number is 0. SEC-P3: the value that is checked is the value that is stored.
const toPaise = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const text = String(n);
  if (/e/i.test(text)) return Math.round(n * 100) / 100; // 1e-9 and 1e21 style: no half-way cases that matter
  return Number(`${Math.round(Number(`${text}e2`))}e-2`);
};

// Cap for the penalty part of a receipt: it may not be more than the penalty still owed on the
// instalment. Rows that count: verified receipts (payment_status 1) AND agent collections still
// waiting for verification (payment_status 0), so a penalty an agent already took is not taken a second
// time at the office (SEC-P2). `penaltyOwed` (get-by-group, reports) stays verified-only.
// Whole-paise comparison. Returns { ok, owed, pendingPart }.
const checkPenaltyCap = ({ penaltyAmount, penaltyPaid, verifiedPaid, pendingPaid }) => {
  const pendingPart = toPaise(pendingPaid);
  const owed = penaltyOwed(penaltyAmount, toPaise((parseFloat(verifiedPaid) || 0) + pendingPart));
  return { ok: Math.round(toPaise(penaltyPaid) * 100) <= Math.round(owed * 100), owed, pendingPart };
};

const penaltyCapMessage = (penaltyPaid, { owed, pendingPart }) =>
  `Penalty paid (₹${toPaise(penaltyPaid).toFixed(2)}) cannot be more than the penalty still owed (₹${owed.toFixed(2)})`
  + (pendingPart > 0 ? ' (including agent collections waiting for verification)' : '');

module.exports = { toPaise, checkPenaltyCap, penaltyCapMessage };
