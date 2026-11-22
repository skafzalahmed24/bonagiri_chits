'use strict';

/**
 * Tester sheet rows 27 / 34 / 37 (joint tickets): a receipt entered at the office can record WHICH holder paid.
 * `customer_payments.payer_member_id` is NULL for every existing receipt and for receipts that do not name a
 * payer, so nothing changes for them (they keep being split by share). userService.js already reads
 * `payment.payer_member_id` when it works out per-holder dues, so the apps pick the new value up with no change.
 *
 * Additive: a new nullable column and an index. Run this BEFORE the code that reads or writes it.
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('customer_payments');
    if (!table.payer_member_id) {
      await queryInterface.addColumn('customer_payments', 'payer_member_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Joint tickets: the holder (members.id) who paid this receipt; NULL = not recorded (split by share)',
      });
    }
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS idx_customer_payments_payer_member ON customer_payments (payer_member_id) WHERE payer_member_id IS NOT NULL;'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_customer_payments_payer_member;');
    const table = await queryInterface.describeTable('customer_payments');
    if (table.payer_member_id) await queryInterface.removeColumn('customer_payments', 'payer_member_id');
  },
};
