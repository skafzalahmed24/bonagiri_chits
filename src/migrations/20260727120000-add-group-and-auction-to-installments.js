'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Add columns to chits_installments
      await queryInterface.addColumn('chits_installments', 'group_id', {
        type: Sequelize.UUID,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('chits_installments', 'auction_number', {
        type: Sequelize.INTEGER,
        allowNull: true
      }, { transaction });

      // Add dividend_credit_balance to enrollments
      await queryInterface.addColumn('enrollments', 'dividend_credit_balance', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00
      }, { transaction });

      // Backfill group_id and auction_number
      await queryInterface.sequelize.query(`
        UPDATE chits_installments
        SET 
          group_id = e.group_id,
          auction_number = chits_installments.installment_no
        FROM enrollments e
        WHERE chits_installments.enrollment_id = e.id
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('chits_installments', 'group_id', { transaction });
      await queryInterface.removeColumn('chits_installments', 'auction_number', { transaction });
      await queryInterface.removeColumn('enrollments', 'dividend_credit_balance', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
