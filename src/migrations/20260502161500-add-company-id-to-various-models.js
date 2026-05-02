'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add company_id to routes
    await queryInterface.addColumn('routes', 'company_id', {
      type: Sequelize.UUID,
      allowNull: true
    });

    // Add company_id to areas
    await queryInterface.addColumn('areas', 'company_id', {
      type: Sequelize.UUID,
      allowNull: true
    });

    // Add company_id to districts
    await queryInterface.addColumn('districts', 'company_id', {
      type: Sequelize.UUID,
      allowNull: true
    });

    // Add company_id to cities
    await queryInterface.addColumn('cities', 'company_id', {
      type: Sequelize.UUID,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('routes', 'company_id');
    await queryInterface.removeColumn('areas', 'company_id');
    await queryInterface.removeColumn('districts', 'company_id');
    await queryInterface.removeColumn('cities', 'company_id');
  }
};
