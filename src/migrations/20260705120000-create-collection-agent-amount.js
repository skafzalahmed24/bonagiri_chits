'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('collection_agent_amounts', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      collection_agent_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      member_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      payment_type: {
        type: Sequelize.INTEGER,
        comment: '1 - cash, 2 - upi, 3 - cheque, 4 - bank, 5 - others'
      },
      cash: {
        type: Sequelize.JSON,
        allowNull: true
      },
      transaction_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      cheque_number: {
        type: Sequelize.STRING,
        allowNull: true
      },
      bank_details: {
        type: Sequelize.JSON,
        allowNull: true
      },
      other_details: {
        type: Sequelize.TEXT('long'),
        allowNull: true
      },
      status: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: '0 - pending, 1 - paid'
      },
      paid_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      confirm_date: {
        type: Sequelize.DATE,
        allowNull: true
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
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('collection_agent_amounts');
  }
};
