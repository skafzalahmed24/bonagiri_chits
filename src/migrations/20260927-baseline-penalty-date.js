'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // get business date
    const [settings] = await queryInterface.sequelize.query(
      `SELECT business_date FROM system_settings LIMIT 1;`
    );
    if (!settings || settings.length === 0) return;
    const businessDateStr = settings[0].business_date;
    
    // Set penalty_last_applied_date to businessDateStr for overdue unpaid installments
    await queryInterface.sequelize.query(`
      UPDATE chits_installments 
      SET penalty_last_applied_date = '${businessDateStr}'
      WHERE due_date < '${businessDateStr}'
      AND id NOT IN (
        SELECT chits_installment_id FROM customer_payments 
        WHERE payment_status = 1 AND chits_installment_id IS NOT NULL
      )
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // down migration doesn't need to revert
  }
};
