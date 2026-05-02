'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('agent_target_entries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      agent_type_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      agent_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      target_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
      },
      from_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      to_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      due_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
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
    await queryInterface.dropTable('agent_target_entries');
  }
};
