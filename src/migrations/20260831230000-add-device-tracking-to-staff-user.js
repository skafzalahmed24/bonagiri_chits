'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = {
      device_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      device_unique_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      platform_type: {
        type: Sequelize.STRING,
        allowNull: true
      },
      device_details: {
        type: Sequelize.TEXT,
        allowNull: true
      }
    };

    for (const [colName, config] of Object.entries(columns)) {
      await queryInterface.addColumn('staff_user', colName, config);
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = ['device_id', 'device_unique_id', 'platform_type', 'device_details'];

    for (const colName of columns) {
      await queryInterface.removeColumn('staff_user', colName);
    }
  }
};
