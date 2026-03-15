'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {

    await queryInterface.addColumn('companies', 'company_email', {
      type: Sequelize.STRING,
      allowNull: false
    });

    await queryInterface.addColumn('companies', 'company_password', {
      type: Sequelize.STRING,
      allowNull: false
    });

    await queryInterface.addColumn('companies', 'company_id', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('companies', 'is_deleted_status', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false
    });

  },

  async down(queryInterface, Sequelize) {

    await queryInterface.removeColumn('companies', 'company_email');
    await queryInterface.removeColumn('companies', 'company_password');
    await queryInterface.removeColumn('companies', 'company_id');
    await queryInterface.removeColumn('companies', 'is_deleted_status');

  }
};