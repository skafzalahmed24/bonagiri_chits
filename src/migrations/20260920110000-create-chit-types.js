'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.tableExists('chit_types').catch(() => false);
    if (!tableInfo) {
      await queryInterface.createTable('chit_types', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        company_id: {
          type: Sequelize.UUID,
          allowNull: true
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        bg_color: {
          type: Sequelize.STRING,
          allowNull: true
        },
        image: {
          type: Sequelize.STRING,
          allowNull: true
        },
        auction_type: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        status: {
          type: Sequelize.INTEGER,
          defaultValue: 1,
          comment: '1 - active, 0 - inactive'
        },
        is_deleted_status: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '0 - active, 1 - deleted'
        },
        display_order: {
          type: Sequelize.INTEGER,
          defaultValue: 1
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('chit_types');
  }
};
