'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('member', 'group_status', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: '0 for normal, 1 for company status'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('member', 'group_status');
  }
};
