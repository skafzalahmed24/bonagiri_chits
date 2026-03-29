'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('customer_payments', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      chits_installment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'chits_installments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      received_amount: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00
      },
      payment_status: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: '0 - no action, 1 - paid, 2 - due date'
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
    await queryInterface.dropTable('customer_payments');
  }
};