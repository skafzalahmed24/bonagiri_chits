'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.tableExists('platform_support_contact').catch(() => false);
    if (!tableInfo) {
      await queryInterface.createTable('platform_support_contact', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        address: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        phone_numbers: {
          type: Sequelize.JSON,
          allowNull: true
        },
        emails: {
          type: Sequelize.JSON,
          allowNull: true
        },
        website_link: {
          type: Sequelize.STRING(500),
          allowNull: true
        },
        social_media_links: {
          type: Sequelize.JSON,
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
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('platform_support_contact');
  }
};
