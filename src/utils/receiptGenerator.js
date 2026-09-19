const { CustomerPayment } = require('../models');
const { Op } = require('sequelize');

/**
 * Generates a unique, gapless receipt number.
 * Format: RCT-{YEAR}-{6-DIGIT-SEQUENCE}
 */
const generateReceiptNumber = async (companyId = null, transaction = null) => {
  const year = new Date().getFullYear();
  
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
