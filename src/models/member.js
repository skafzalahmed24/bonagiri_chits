'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Member extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Member.init({
    name_prefix: DataTypes.STRING,
    name: DataTypes.STRING,
    date_of_birth: DataTypes.DATEONLY,
    age: DataTypes.INTEGER,
    registration_date: DataTypes.DATEONLY,
    parental_prefix: DataTypes.STRING,
    parental_name: DataTypes.STRING,
    gender: DataTypes.STRING,
    mobile_number: DataTypes.STRING,
    email: DataTypes.STRING,
    gst_number: DataTypes.STRING,
    marital_status: DataTypes.STRING,
    married_date: DataTypes.DATEONLY,
    introduced_as: DataTypes.JSON,
    account_number: DataTypes.STRING,
    account_holder_name: DataTypes.STRING,
    bank_branch: DataTypes.STRING,
    bank_name: DataTypes.STRING,
    ifsc_code: DataTypes.STRING,
    upload_image: DataTypes.STRING,
    upload_signature: DataTypes.STRING,
    passbook_details: DataTypes.STRING,
    employee_occupation: DataTypes.STRING,
    employee_type: DataTypes.STRING,
    employee_organisation: DataTypes.STRING,
    employee_designation: DataTypes.STRING,
    employee_department: DataTypes.STRING,
    employee_id: DataTypes.STRING,
    employee_date_of_joining: DataTypes.DATEONLY,
    employee_retirement_date: DataTypes.DATEONLY,
    employee_net_salary: DataTypes.DECIMAL,
    business_type: DataTypes.STRING,
    business_firm_name: DataTypes.STRING,
    business_capital: DataTypes.DECIMAL,
    business_income: DataTypes.DECIMAL,
    annual_income: DataTypes.DECIMAL,
    description: DataTypes.TEXT,
    farmer_land_acres: DataTypes.DECIMAL,
    address_info_door_no: DataTypes.STRING,
    address_info_street_name: DataTypes.STRING,
    address_info_address: DataTypes.TEXT,
    address_info_city_id: DataTypes.INTEGER,
    address_info_phone: DataTypes.STRING,
    address_info_same_as_residential_status: DataTypes.BOOLEAN,
    address_info_office_door_no: DataTypes.STRING,
    address_info_office_street_name: DataTypes.STRING,
    address_info_office_address: DataTypes.TEXT,
    address_info_office_city_id: DataTypes.INTEGER,
    address_info_office_phone: DataTypes.STRING,
    address_info_corresponding_address_status: DataTypes.BOOLEAN,
    other_info_kyc_details: DataTypes.JSON,
    other_info_reference: DataTypes.STRING,
    other_info_remarks: DataTypes.TEXT,
    other_info_mobile_access: DataTypes.BOOLEAN,
    other_info_web_access: DataTypes.BOOLEAN,
    other_info_user_code: DataTypes.STRING,
    other_info_user_password: DataTypes.STRING,
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'Member',
    tableName: 'member',
  });
  return Member;
};