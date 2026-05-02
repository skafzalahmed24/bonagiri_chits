'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('group_under_static_lists', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      group_under_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      account_order: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      type: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 2
      },
      is_deleted_status: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('group_under_static_lists');
  }
};
