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
      Member.belongsTo(models.StaticDropdownsList, { foreignKey: 'name_prefix', as: 'title', targetKey: 'id' });
      Member.belongsTo(models.StaticDropdownSubcategoryList, { foreignKey: 'parental_prefix', as: 'parental_title', targetKey: 'id' });
      Member.belongsTo(models.StaticDropdownsList, { foreignKey: 'gender', as: 'gender_dropdown', targetKey: 'id' });
      Member.belongsTo(models.StaticDropdownsList, { foreignKey: 'employee_occupation', as: 'occupation', targetKey: 'id' });
      Member.belongsTo(models.StaticDropdownsList, { foreignKey: 'employee_type', as: 'emp_type', targetKey: 'id' });
      Member.belongsTo(models.StaticDropdownSubcategoryList, { foreignKey: 'business_type', as: 'business_type_details', targetKey: 'id' });
    }
  }
  Member.init({
    member_id: DataTypes.STRING,
    name_prefix: DataTypes.INTEGER,
    rep_by_first_name: DataTypes.STRING,
    sur_name: DataTypes.STRING,
    name: DataTypes.STRING,
    date_of_birth: DataTypes.DATEONLY,
    age: DataTypes.INTEGER,
    registration_date: DataTypes.DATEONLY,
    parental_prefix: DataTypes.INTEGER,
    parental_name: DataTypes.STRING,
    guardian_name: DataTypes.STRING,
    relation: DataTypes.STRING,
    gender: DataTypes.INTEGER,
    mobile_number: DataTypes.STRING,
    email: DataTypes.STRING,
    gst_number: DataTypes.STRING,
    marital_status: DataTypes.INTEGER,
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
    employee_occupation: DataTypes.INTEGER,
    employee_type: DataTypes.INTEGER,
    employee_organisation: DataTypes.STRING,
    employee_designation: DataTypes.STRING,
    employee_department: DataTypes.STRING,
    employee_id: DataTypes.STRING,
    employee_date_of_joining: DataTypes.DATEONLY,
    employee_retirement_date: DataTypes.DATEONLY,
    employee_net_salary: DataTypes.DECIMAL,
    business_type: DataTypes.INTEGER,
    business_firm_name: DataTypes.STRING,
    business_capital: DataTypes.DECIMAL,
    business_income: DataTypes.DECIMAL,
    annual_income: DataTypes.DECIMAL,
    description: DataTypes.TEXT,
    farmer_land_acres: DataTypes.DECIMAL,
    address_info_door_no: DataTypes.STRING,
    address_info_street_name: DataTypes.STRING,
    address_info_address: DataTypes.TEXT,
    address_info_city_id: DataTypes.UUID,
    address_info_phone: DataTypes.STRING,
    address_info_same_as_residential_status: DataTypes.BOOLEAN,
    address_info_office_door_no: DataTypes.STRING,
    address_info_office_street_name: DataTypes.STRING,
    address_info_office_address: DataTypes.TEXT,
    address_info_office_city_id: DataTypes.UUID,
    address_info_office_phone: DataTypes.STRING,
    address_info_corresponding_address_status: DataTypes.INTEGER,
    other_info_kyc_details: DataTypes.JSON,
    other_info_reference: DataTypes.STRING,
    other_info_remarks: DataTypes.TEXT,
    other_info_mobile_access: DataTypes.BOOLEAN,
    other_info_web_access: DataTypes.BOOLEAN,
    other_info_user_code: {
      type: DataTypes.INTEGER,
      validate: {
        min: 100000
      }
    },
    other_info_user_password: DataTypes.STRING,
    company_id: DataTypes.UUID,
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    group_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    device_id: {
      type: DataTypes.STRING,
    },
    device_unique_id: {
      type: DataTypes.STRING,
    },
    platform_type: {
      type: DataTypes.STRING,
    },
    device_details: {
      type: DataTypes.TEXT,
    },
    mobile_otp: {
      type: DataTypes.STRING,
    },
    type: {
      type: DataTypes.INTEGER,
      defaultValue: 2,
      allowNull: false
    },
    is_favorites: {
      type: DataTypes.JSON,
      allowNull: true
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    verification_otp: {
      type: DataTypes.STRING,
      allowNull: true
    },
    verification_otp_expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    verification_otp_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Member',
    tableName: 'member',
  });
  return Member;
};