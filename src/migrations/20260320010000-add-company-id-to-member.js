'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('member', 'company_id', {
      type: Sequelize.UUID,
      allowNull: true,
      after: 'other_info_user_password'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('member', 'company_id');
  }
};
