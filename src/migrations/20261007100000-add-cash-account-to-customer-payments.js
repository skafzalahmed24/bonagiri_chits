'use strict';

/**
 * Receipts now record which Cash account received their cash, as they already do for
 * UPI and Bank. Until now cash always went to the company's oldest active Cash account
 * (lowest id), so existing cash receipts are backfilled with exactly that account:
 * the one their money was credited to at the time.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const info = await queryInterface.describeTable('customer_payments');
    if (!info.cash_account_id) {
      await queryInterface.addColumn('customer_payments', 'cash_account_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    const [indexes] = await queryInterface.sequelize.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'customer_payments' AND indexname = 'customer_payments_cash_account_id'"
    );
    if (indexes.length === 0) {
      await queryInterface.addIndex('customer_payments', ['cash_account_id'], { name: 'customer_payments_cash_account_id' });
    }

    // Company comes from instalment -> enrollment -> group. Prefer the oldest active
    // Cash account (what the old code credited); fall back to the oldest one at all.
    await queryInterface.sequelize.query(`
      UPDATE customer_payments cp
      SET cash_account_id = (
        SELECT pa.id FROM payment_accounts pa
        WHERE pa.company_id = g.company_id AND pa.account_type = 'CASH'
        ORDER BY pa.is_active DESC, pa.id ASC
        LIMIT 1
      )
      FROM chits_installments ci
      JOIN enrollments e ON e.id = ci.enrollment_id
      JOIN chits_groups g ON g.id = e.group_id
      WHERE ci.id = cp.chits_installment_id
        AND cp.cash_amount > 0
        AND cp.cash_account_id IS NULL
    `);
  },

  async down(queryInterface) {
    const info = await queryInterface.describeTable('customer_payments');
    if (info.cash_account_id) {
      await queryInterface.removeColumn('customer_payments', 'cash_account_id');
    }
  },
};
