'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('customer_payments', 'cash_amount', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00
      }, { transaction });
      
      await queryInterface.addColumn('customer_payments', 'upi_amount', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00
      }, { transaction });
      
      await queryInterface.addColumn('customer_payments', 'upi_account_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'payment_accounts',
          key: 'id'
        }
      }, { transaction });
      
      await queryInterface.addColumn('customer_payments', 'bank_amount', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00
      }, { transaction });
      
      await queryInterface.addColumn('customer_payments', 'bank_account_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'payment_accounts',
          key: 'id'
        }
      }, { transaction });
      
      await queryInterface.addColumn('customer_payments', 'cheque_number', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });
      
      await queryInterface.addColumn('customer_payments', 'cheque_date', {
        type: Sequelize.DATEONLY,
        allowNull: true
      }, { transaction });
      
      await queryInterface.addColumn('customer_payments', 'narration', {
        type: Sequelize.TEXT,
        allowNull: true
      }, { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('customer_payments', 'cash_amount', { transaction });
      await queryInterface.removeColumn('customer_payments', 'upi_amount', { transaction });
      await queryInterface.removeColumn('customer_payments', 'upi_account_id', { transaction });
      await queryInterface.removeColumn('customer_payments', 'bank_amount', { transaction });
      await queryInterface.removeColumn('customer_payments', 'bank_account_id', { transaction });
      await queryInterface.removeColumn('customer_payments', 'cheque_number', { transaction });
      await queryInterface.removeColumn('customer_payments', 'cheque_date', { transaction });
      await queryInterface.removeColumn('customer_payments', 'narration', { transaction });
      
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
