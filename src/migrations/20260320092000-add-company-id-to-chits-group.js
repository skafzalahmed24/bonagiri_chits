'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('chits_groups', 'company_id', {
      type: Sequelize.UUID,
      allowNull: true,
      after: 'running_status'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('chits_groups', 'company_id');
  }
};
