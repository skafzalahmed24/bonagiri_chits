'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = ['member', 'companies'];
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
      },
      mobile_otp: {
        type: Sequelize.STRING,
        allowNull: true
      }
    };

    for (const tableName of tables) {
      for (const [colName, config] of Object.entries(columns)) {
        await queryInterface.addColumn(tableName, colName, config);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = ['member', 'companies'];
    const columns = ['device_id', 'device_unique_id', 'platform_type', 'device_details', 'mobile_otp'];

    for (const tableName of tables) {
      for (const colName of columns) {
        await queryInterface.removeColumn(tableName, colName);
      }
    }
  }
};
