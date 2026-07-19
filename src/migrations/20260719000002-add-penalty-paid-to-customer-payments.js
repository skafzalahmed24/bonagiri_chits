'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('customer_payments', 'penalty_paid', {
      type: Sequelize.DECIMAL(15, 2),
      defaultValue: 0.00
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('customer_payments', 'penalty_paid');
  }
};
