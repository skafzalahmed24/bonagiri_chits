const { CustomerPayment, ChitsInstallment, Enrollment } = require('../models');

const generateReceiptNumber = async (companyId) => {
  const year = new Date().getFullYear();
  const count = await CustomerPayment.count({
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
    }]
  });
  return `RCT-${year}-${String(count + 1).padStart(6, '0')}`;
};

module.exports = {
  generateReceiptNumber
};
