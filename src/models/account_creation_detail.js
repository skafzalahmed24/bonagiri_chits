'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AccountCreationDetail extends Model {
    static associate(models) {
      // Any associations go here
    }
  }
  AccountCreationDetail.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    account_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    account_group_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    person_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address_line_one: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address_line_two: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address_line_three: {
      type: DataTypes.STRING,
      allowNull: true
    },
    pin_code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mobile: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true
    },
    hsn_code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    tin_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mfl_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    gst_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    pan_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    igst_percentage: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    },
    cgst_percentage: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    },
    sgst_percentage: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    },
    opening_balance: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    },
    cr_dr_status: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    action_status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    created_by: {
      type: DataTypes.STRING,
      allowNull: true
    },
    updated_by: {
      type: DataTypes.STRING,
      allowNull: true
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'AccountCreationDetail',
    tableName: 'account_creation_details',
  });
  return AccountCreationDetail;
};
