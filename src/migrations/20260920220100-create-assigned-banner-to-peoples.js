'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('assigned_banner_to_peoples', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      assigned_banner_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'banners',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      subscriber_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'member',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add composite index for quick lookup by subscriber and banner
    await queryInterface.addIndex('assigned_banner_to_peoples', ['assigned_banner_id', 'subscriber_id'], {
      name: 'assigned_banner_subscriber_idx'
    });
    await queryInterface.addIndex('assigned_banner_to_peoples', ['subscriber_id'], {
      name: 'assigned_banner_subscriber_only_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('assigned_banner_to_peoples');
  }
};
