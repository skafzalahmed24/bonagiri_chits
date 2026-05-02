'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('account_creation_details', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      account_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      account_group_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      person_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      address_line_one: {
        type: Sequelize.STRING,
        allowNull: true
      },
      address_line_two: {
        type: Sequelize.STRING,
        allowNull: true
      },
      address_line_three: {
        type: Sequelize.STRING,
        allowNull: true
      },
      pin_code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      mobile: {
        type: Sequelize.STRING,
        allowNull: true
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true
      },
      hsn_code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      tin_number: {
        type: Sequelize.STRING,
        allowNull: true
      },
      mfl_number: {
        type: Sequelize.STRING,
        allowNull: true
      },
      gst_number: {
        type: Sequelize.STRING,
        allowNull: true
      },
      pan_number: {
        type: Sequelize.STRING,
        allowNull: true
      },
      igst_percentage: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      },
      cgst_percentage: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      },
      sgst_percentage: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      },
      opening_balance: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      },
      cr_dr_status: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      action_status: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      created_by: {
        type: Sequelize.STRING,
        allowNull: true
      },
      updated_by: {
        type: Sequelize.STRING,
        allowNull: true
      },
      is_deleted_status: {
        type: Sequelize.INTEGER,
        allowNull: false,
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

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('account_creation_details');
  }
};
