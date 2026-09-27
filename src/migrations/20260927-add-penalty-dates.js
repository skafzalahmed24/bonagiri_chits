'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('chits_installments', 'penalty_from_date', {
      type: Sequelize.DATEONLY,
      allowNull: true
    });
    await queryInterface.addColumn('chits_installments', 'penalty_last_applied_date', {
      type: Sequelize.DATEONLY,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('chits_installments', 'penalty_from_date');
    await queryInterface.removeColumn('chits_installments', 'penalty_last_applied_date');
  }
};
