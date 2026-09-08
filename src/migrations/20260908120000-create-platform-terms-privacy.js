'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.tableExists('platform_terms_privacy').catch(() => false);
    if (!tableInfo) {
      await queryInterface.createTable('platform_terms_privacy', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        type: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true
        },
        content: {
          type: Sequelize.TEXT,
          allowNull: false,
          defaultValue: ''
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
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('platform_terms_privacy');
  }
};
