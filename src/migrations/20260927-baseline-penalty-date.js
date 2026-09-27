'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // get business date as text directly from postgres
    const [settings] = await queryInterface.sequelize.query(
      `SELECT COALESCE(business_date, CURRENT_DATE)::text AS d FROM system_settings LIMIT 1;`
    );
    let businessDateStr = new Date().toISOString().split('T')[0];
    if (settings && settings.length > 0 && settings[0].d) {
      businessDateStr = settings[0].d.split(' ')[0]; // just in case it returns datetime text
    }

    // Set penalty_last_applied_date to businessDateStr for overdue unpaid installments
    await queryInterface.sequelize.query(`
      UPDATE chits_installments 
      SET penalty_last_applied_date = :businessDate
      WHERE due_date < :businessDate
      AND id NOT IN (
        SELECT chits_installment_id FROM customer_payments 
        WHERE payment_status = 1 AND chits_installment_id IS NOT NULL
      )
    `, {
      replacements: { businessDate: businessDateStr }
    });
  },

  down: async (queryInterface, Sequelize) => {
    // down migration doesn't need to revert
  }
};
