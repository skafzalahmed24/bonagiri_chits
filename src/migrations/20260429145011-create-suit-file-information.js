'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('suit_file_informations', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      ticket_number: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      subscriber_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      court_name: {
        type: Sequelize.STRING
      },
      advocate_name: {
        type: Sequelize.STRING
      },
      suit_cause: {
        type: Sequelize.STRING
      },
      suit_no: {
        type: Sequelize.STRING
      },
      suit_file_date: {
        type: Sequelize.DATEONLY
      },
      principle_amount: {
        type: Sequelize.DECIMAL(15, 2)
      },
      cost_of_legal_amount: {
        type: Sequelize.DECIMAL(15, 2)
      },
      inc_charges: {
        type: Sequelize.DECIMAL(15, 2)
      },
      interest_amount: {
        type: Sequelize.DECIMAL(15, 2)
      },
      claim_amount: {
        type: Sequelize.DECIMAL(15, 2)
      },
      legal_notice_date: {
        type: Sequelize.DATEONLY
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
    await queryInterface.dropTable('suit_file_informations');
  }
};