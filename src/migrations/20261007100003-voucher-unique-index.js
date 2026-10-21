'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check for duplicates
    const duplicates = await queryInterface.sequelize.query(
      `SELECT company_id, voucher_number, COUNT(*) FROM accounting_vouchers GROUP BY company_id, voucher_number HAVING COUNT(*) > 1`
    );
    if (duplicates[0] && duplicates[0].length > 0) {
      throw new Error('Duplicates found in accounting_vouchers. Fix them before applying unique index: ' + JSON.stringify(duplicates[0]));
    }

    await queryInterface.addIndex('accounting_vouchers', ['company_id', 'voucher_number'], {
      unique: true,
      name: 'accounting_vouchers_company_id_voucher_number_unique'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('accounting_vouchers', 'accounting_vouchers_company_id_voucher_number_unique');
  }
};
