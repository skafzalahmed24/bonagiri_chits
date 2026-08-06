'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('system_audit_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      action_type: {
        type: Sequelize.STRING
      },
      previous_value: {
        type: Sequelize.JSON
      },
      new_value: {
        type: Sequelize.JSON
      },
      changed_by: {
        type: Sequelize.UUID,
        references: {
          model: 'staff_user',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      changed_on: {
        type: Sequelize.DATE
      },
      reason: {
        type: Sequelize.STRING
      },
      remarks: {
        type: Sequelize.TEXT
      },
      status: {
        type: Sequelize.STRING
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
    await queryInterface.dropTable('system_audit_logs');
  }
};