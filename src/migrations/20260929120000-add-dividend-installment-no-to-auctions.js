'use strict';

/**
 * Open-auction dividends now reduce the NEXT month's instalment (skipping the company's month),
 * not the auction's own month. `dividend_installment_no` records the instalment number a
 * dividend was applied to. It stays NULL on auctions recorded before this change, whose
 * dividend was applied to the auction's own month (readers fall back to auction_number).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('auctions');
    if (!table.dividend_installment_no) {
      await queryInterface.addColumn('auctions', 'dividend_installment_no', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Instalment number the dividend of this auction was applied to; NULL = the auction\'s own month (older auctions)',
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('auctions');
    if (table.dividend_installment_no) await queryInterface.removeColumn('auctions', 'dividend_installment_no');
  },
};
