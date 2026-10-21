'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. customer_payments_upi_account_id_fkey
      await queryInterface.sequelize.query('ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_upi_account_id_fkey;', { transaction });
      await queryInterface.sequelize.query('ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_upi_account_id_fkey FOREIGN KEY (upi_account_id) REFERENCES payment_accounts(id) ON DELETE RESTRICT;', { transaction });

      // 2. customer_payments_bank_account_id_fkey
      await queryInterface.sequelize.query('ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_bank_account_id_fkey;', { transaction });
      await queryInterface.sequelize.query('ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES payment_accounts(id) ON DELETE RESTRICT;', { transaction });

      // 3. prize_payments_account_id_fkey
      await queryInterface.sequelize.query('ALTER TABLE prize_payments DROP CONSTRAINT prize_payments_account_id_fkey;', { transaction });
      await queryInterface.sequelize.query('ALTER TABLE prize_payments ADD CONSTRAINT prize_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES payment_accounts(id) ON DELETE RESTRICT;', { transaction });

      // 4. new for cash_account_id
      await queryInterface.sequelize.query('ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_cash_account_id_fkey FOREIGN KEY (cash_account_id) REFERENCES payment_accounts(id) ON DELETE RESTRICT;', { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query('ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_upi_account_id_fkey;', { transaction });
      await queryInterface.sequelize.query('ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_upi_account_id_fkey FOREIGN KEY (upi_account_id) REFERENCES payment_accounts(id) ON DELETE SET NULL;', { transaction });

      await queryInterface.sequelize.query('ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_bank_account_id_fkey;', { transaction });
      await queryInterface.sequelize.query('ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES payment_accounts(id) ON DELETE SET NULL;', { transaction });

      await queryInterface.sequelize.query('ALTER TABLE prize_payments DROP CONSTRAINT prize_payments_account_id_fkey;', { transaction });
      await queryInterface.sequelize.query('ALTER TABLE prize_payments ADD CONSTRAINT prize_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES payment_accounts(id) ON DELETE SET NULL;', { transaction });

      await queryInterface.sequelize.query('ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_cash_account_id_fkey;', { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
