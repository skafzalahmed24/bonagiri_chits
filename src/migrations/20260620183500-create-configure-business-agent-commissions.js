'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('configure_business_agent_commissions', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      business_agent_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      member_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      commission_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      status: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: '1 for unpaid, 2 for partial paid, 3 for paid'
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
    await queryInterface.dropTable('configure_business_agent_commissions');
  }
};
