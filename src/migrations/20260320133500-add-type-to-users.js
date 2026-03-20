'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add type column to companies table (default 1)
    await queryInterface.addColumn('companies', 'type', {
      type: Sequelize.INTEGER,
      defaultValue: 1,
      allowNull: false
    });

    // Add type column to member table (default 2)
    await queryInterface.addColumn('member', 'type', {
      type: Sequelize.INTEGER,
      defaultValue: 2,
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('companies', 'type');
    await queryInterface.removeColumn('member', 'type');
  }
};
