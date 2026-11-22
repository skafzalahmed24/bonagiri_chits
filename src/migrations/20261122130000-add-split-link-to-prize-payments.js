'use strict';

/**
 * Tester sheet row 42 (split a bid payment across accounts): the two parts of one split payment (for example
 * ₹5,000 cash + ₹5,000 cheque) are saved together and share a `split_group_id`; `split_part` is 1 for the
 * first (cash) part and 2 for the second. Both are NULL for every existing payment, so nothing changes for them.
 *
 * Additive: two new nullable columns and an index. Run this BEFORE the code that reads or writes them.
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('prize_payments');
    if (!table.split_group_id) {
      await queryInterface.addColumn('prize_payments', 'split_group_id', { type: Sequelize.UUID, allowNull: true });
    }
    if (!table.split_part) {
      await queryInterface.addColumn('prize_payments', 'split_part', { type: Sequelize.SMALLINT, allowNull: true });
    }
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS idx_prize_payments_split_group ON prize_payments (split_group_id) WHERE split_group_id IS NOT NULL;'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_prize_payments_split_group;');
    const table = await queryInterface.describeTable('prize_payments');
    if (table.split_part) await queryInterface.removeColumn('prize_payments', 'split_part');
    if (table.split_group_id) await queryInterface.removeColumn('prize_payments', 'split_group_id');
  },
};
