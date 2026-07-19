'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('customer_payments', 'payment_date', {
        type: Sequelize.DATEONLY,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('customer_payments', 'payment_mode', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '1 cash, 2 upi, 3 cheque, 4 bank, 5 others'
      }, { transaction });

      await queryInterface.addColumn('customer_payments', 'transaction_reference', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('customer_payments', 'receipt_number', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
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
      await queryInterface.removeColumn('customer_payments', 'payment_date', { transaction });
      await queryInterface.removeColumn('customer_payments', 'payment_mode', { transaction });
      await queryInterface.removeColumn('customer_payments', 'transaction_reference', { transaction });
      await queryInterface.removeColumn('customer_payments', 'receipt_number', { transaction });
      
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
