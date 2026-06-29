'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('chits_groups', 'chit_category_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('chits_groups', 'scheme_configuration_id', {
      type: Sequelize.UUID,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('chits_groups', 'chit_category_id');
    await queryInterface.removeColumn('chits_groups', 'scheme_configuration_id');
  }
};
