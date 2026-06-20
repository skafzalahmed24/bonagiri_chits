'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('self_chits', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      subscriber_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      slot_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      is_deleted_status: {
        type: Sequelize.INTEGER,
        defaultValue: 0
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
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('self_chits');
  }
};
