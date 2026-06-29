'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('chits_groups', 'is_chit_full_status', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: '0 - not full, 1 - full'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('chits_groups', 'is_chit_full_status');
  }
};
