'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('group_under_static_lists', 'company_id', {
      type: Sequelize.UUID,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('group_under_static_lists', 'company_id');
  }
};
