'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('member_advances', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      member_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      collection_agent_amount_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      account_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      payment_type: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      balance: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      narration: {
        type: Sequelize.STRING,
        allowNull: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addColumn('customer_payments', 'member_advance_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('customer_payments', 'member_advance_id');
    await queryInterface.dropTable('member_advances');
  }
};
