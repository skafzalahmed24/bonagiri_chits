'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('member', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name_prefix: {
        type: Sequelize.STRING
      },
      name: {
        type: Sequelize.STRING
      },
      date_of_birth: {
        type: Sequelize.DATEONLY
      },
      age: {
        type: Sequelize.INTEGER
      },
      registration_date: {
        type: Sequelize.DATEONLY
      },
      parental_prefix: {
        type: Sequelize.STRING
      },
      parental_name: {
        type: Sequelize.STRING
      },
      gender: {
        type: Sequelize.STRING
      },
      mobile_number: {
        type: Sequelize.STRING
      },
      email: {
        type: Sequelize.STRING
      },
      gst_number: {
        type: Sequelize.STRING
      },
      marital_status: {
        type: Sequelize.INTEGER
      },
      married_date: {
        type: Sequelize.DATEONLY
      },
      introduced_as: {
        type: Sequelize.JSON
      },
      account_number: {
        type: Sequelize.STRING
      },
      account_holder_name: {
        type: Sequelize.STRING
      },
      bank_branch: {
        type: Sequelize.STRING
      },
      bank_name: {
        type: Sequelize.STRING
      },
      ifsc_code: {
        type: Sequelize.STRING
      },
      upload_image: {
        type: Sequelize.STRING
      },
      upload_signature: {
        type: Sequelize.STRING
      },
      passbook_details: {
        type: Sequelize.STRING
      },
      employee_occupation: {
        type: Sequelize.STRING
      },
      employee_type: {
        type: Sequelize.STRING
      },
      employee_organisation: {
        type: Sequelize.STRING
      },
      employee_designation: {
        type: Sequelize.STRING
      },
      employee_department: {
        type: Sequelize.STRING
      },
      employee_id: {
        type: Sequelize.STRING
      },
      employee_date_of_joining: {
        type: Sequelize.DATEONLY
      },
      employee_retirement_date: {
        type: Sequelize.DATEONLY
      },
      employee_net_salary: {
        type: Sequelize.DECIMAL
      },
      business_type: {
        type: Sequelize.STRING
      },
      business_firm_name: {
        type: Sequelize.STRING
      },
      business_capital: {
        type: Sequelize.DECIMAL
      },
      business_income: {
        type: Sequelize.DECIMAL
      },
      annual_income: {
        type: Sequelize.DECIMAL
      },
      description: {
        type: Sequelize.TEXT
      },
      farmer_land_acres: {
        type: Sequelize.DECIMAL
      },
      address_info_door_no: {
        type: Sequelize.STRING
      },
      address_info_street_name: {
        type: Sequelize.STRING
      },
      address_info_address: {
        type: Sequelize.TEXT
      },
      address_info_city_id: {
        type: Sequelize.UUID
      },
      address_info_phone: {
        type: Sequelize.STRING
      },
      address_info_same_as_residential_status: {
        type: Sequelize.BOOLEAN
      },
      address_info_office_door_no: {
        type: Sequelize.STRING
      },
      address_info_office_street_name: {
        type: Sequelize.STRING
      },
      address_info_office_address: {
        type: Sequelize.TEXT
      },
      address_info_office_city_id: {
        type: Sequelize.UUID
      },
      address_info_office_phone: {
        type: Sequelize.STRING
      },
      address_info_corresponding_address_status: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      other_info_kyc_details: {
        type: Sequelize.JSON
      },
      other_info_reference: {
        type: Sequelize.STRING
      },
      other_info_remarks: {
        type: Sequelize.TEXT
      },
      other_info_mobile_access: {
        type: Sequelize.BOOLEAN
      },
      other_info_web_access: {
        type: Sequelize.BOOLEAN
      },
      other_info_user_code: {
        type: Sequelize.STRING
      },
      other_info_user_password: {
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
    await queryInterface.dropTable('member');
  }
};