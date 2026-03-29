'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('chits_groups', 'chits_group_status', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: '0 - Not started, 1 - started, 2 - completed'
    });
    await queryInterface.addColumn('chits_groups', 'chit_start_date', {
      type: Sequelize.DATEONLY
    });
    await queryInterface.addColumn('chits_groups', 'chit_end_date', {
      type: Sequelize.DATEONLY
    });
    await queryInterface.addColumn('chits_groups', 'due_date_number_count', {
      type: Sequelize.INTEGER
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('chits_groups', 'chits_group_status');
    await queryInterface.removeColumn('chits_groups', 'chit_start_date');
    await queryInterface.removeColumn('chits_groups', 'chit_end_date');
    await queryInterface.removeColumn('chits_groups', 'due_date_number_count');
  }
};
