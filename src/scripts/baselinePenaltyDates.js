const { ChitsInstallment, sequelize } = require('../models');
const SystemSettingsService = require('../services/systemSettingsService');
const { Op } = require('sequelize');

const baselinePenaltyDates = async () => {
  try {
    const businessDateStr = await SystemSettingsService.getBusinessDate();
    
    const businessDateObj = new Date(businessDateStr);
    const yyyy = businessDateObj.getUTCFullYear();
    const mm = String(businessDateObj.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(businessDateObj.getUTCDate()).padStart(2, '0');
    const dateFormatted = `${yyyy}-${mm}-${dd}`;

    await sequelize.query(`
      UPDATE chits_installments 
      SET penalty_last_applied_date = :dateFormatted
      WHERE due_date < :dateFormatted
      AND id NOT IN (
        SELECT chits_installment_id FROM customer_payments 
        WHERE payment_status = 1 AND chits_installment_id IS NOT NULL
      )
    `, {
      replacements: { dateFormatted }
    });
    console.log('Baseline penalty dates updated successfully.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

baselinePenaltyDates();
