const { CustomerPayment, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Generates a unique, gapless receipt number.
 * Format: RCT-{YEAR}-{6-DIGIT-SEQUENCE}
 *
 * Numbering is global per year (not per company) — kept as shipped; `companyId`
 * is accepted for call-site clarity but does not scope the sequence.
 *
 * Concurrency: two callers reading max+1 at the same time both get the same
 * number, and the collision check below cannot see the other's uncommitted row.
 * A transaction-scoped advisory lock serialises allocation, so callers MUST pass
 * their transaction — without one, duplicate receipt numbers are possible.
 */
const generateReceiptNumber = async (companyId = null, transaction = null) => {
  const year = new Date().getFullYear();

  if (transaction) {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
      replacements: { key: `receipt-number-${year}` },
      transaction,
    });
  } else {
    console.warn('[receiptGenerator] called without a transaction — receipt numbers are not collision-safe.');
  }

  // Find the latest receipt number globally for this year
  const latestPayment = await CustomerPayment.findOne({
    where: {
      receipt_number: { [Op.like]: `RCT-${year}-%` }
    },
    order: [
      ['receipt_number', 'DESC'],
      ['createdAt', 'DESC']
    ],
    transaction
  });

  let nextSequence = 1;
  if (latestPayment && latestPayment.receipt_number) {
    const parts = latestPayment.receipt_number.split('-');
    if (parts.length >= 3) {
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        nextSequence = lastSeq + 1;
      }
    }
  }

  // Safety collision check: loop to guarantee candidate is unique
  let candidate = `RCT-${year}-${String(nextSequence).padStart(6, '0')}`;
  let exists = await CustomerPayment.findOne({
    where: { receipt_number: candidate },
    transaction
  });

  while (exists) {
    nextSequence++;
    candidate = `RCT-${year}-${String(nextSequence).padStart(6, '0')}`;
    exists = await CustomerPayment.findOne({
      where: { receipt_number: candidate },
      transaction
    });
  }

  return candidate;
};

module.exports = { generateReceiptNumber };
