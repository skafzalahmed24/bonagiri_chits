'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('companies', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true
      },
      company_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      company_address: {
        type: Sequelize.TEXT
      },
      bank_name: {
        type: Sequelize.STRING
      },
      gst_percentage: {
        type: Sequelize.DECIMAL(5, 2)
      },
      cheque_return_charges: {
        type: Sequelize.DECIMAL(10, 2)
      },
      enrollement_charges: {
        type: Sequelize.DECIMAL(10, 2)
      },
      notice_charges: {
        type: Sequelize.DECIMAL(10, 2)
      },
      tranaction_lock_days: {
        type: Sequelize.INTEGER
      },
      latitude: {
        type: Sequelize.STRING
      },
      longitude: {
        type: Sequelize.STRING
      },
      location: {
        type: Sequelize.STRING
      },
      gst_number: {
        type: Sequelize.STRING
      },
      pan_number: {
        type: Sequelize.STRING
      },
      sac_code: {
        type: Sequelize.STRING
      },
      rect_print_format: {
        type: Sequelize.INTEGER
      },
      gst_type: {
        type: Sequelize.INTEGER,
        defaultValue: 1
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
    await queryInterface.dropTable('companies');
  }
};