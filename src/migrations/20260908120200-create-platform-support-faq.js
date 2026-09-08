'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.tableExists('platform_support_faq').catch(() => false);
    if (!tableInfo) {
      await queryInterface.createTable('platform_support_faq', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        question: {
          type: Sequelize.STRING(500),
          allowNull: false
        },
        answer: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        sort_order: {
          type: Sequelize.INTEGER,
          defaultValue: 0
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
    await queryInterface.dropTable('platform_support_faq');
  }
};
