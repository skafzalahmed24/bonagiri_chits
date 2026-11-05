'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.tableExists('app_versions').catch(() => false);
    if (exists) return;

    await queryInterface.createTable('app_versions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      platform: {
        type: Sequelize.STRING(20), // 'android' | 'ios'
        allowNull: false,
        unique: true
      },
      latest_version: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: '1.0.0'
      },
      min_supported_version: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: '1.0.0'
      },
      force_update: {
        type: Sequelize.BOOLEAN, // true = every version below latest_version must update
        allowNull: false,
        defaultValue: false
      },
      store_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      update_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.bulkInsert('app_versions', [
      { platform: 'android', latest_version: '1.0.0', min_supported_version: '1.0.0', force_update: false },
      { platform: 'ios', latest_version: '1.0.0', min_supported_version: '1.0.0', force_update: false }
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('app_versions');
  }
};
