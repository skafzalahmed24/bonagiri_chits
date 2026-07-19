const { CustomerPayment, ChitsInstallment, Enrollment } = require('../models');
const { Op } = require('sequelize');

/**
 * Generates a gapless receipt number scoped by company and year.
 * Format: RCT-{YEAR}-{6-DIGIT-SEQUENCE}
 */
const generateReceiptNumber = async (companyId, transaction = null) => {
  const year = new Date().getFullYear();
  
  // Find the latest receipt number for this company and year
  const latestPayment = await CustomerPayment.findOne({
    where: {
      receipt_number: { [Op.like]: `RCT-${year}-%` }
    },
    include: [{ 
      model: ChitsInstallment, 
      as: 'installment', 
      required: true,
      include: [{ 
        model: Enrollment, 
        as: 'enrollment', 
        where: { company_id: companyId },
        required: true
      }] 
    }],
    order: [['receipt_number', 'DESC']],
    transaction
  });

  let nextSequence = 1;
  if (latestPayment && latestPayment.receipt_number) {
    const parts = latestPayment.receipt_number.split('-');
    if (parts.length === 3) {
      nextSequence = parseInt(parts[2], 10) + 1;
    }
  }

  return `RCT-${year}-${String(nextSequence).padStart(6, '0')}`;
};

module.exports = { generateReceiptNumber };
