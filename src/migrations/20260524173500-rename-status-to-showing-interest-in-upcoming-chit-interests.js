'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.renameColumn('upcoming_chit_interests', 'status', 'showing_interest');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.renameColumn('upcoming_chit_interests', 'showing_interest', 'status');
  }
};
