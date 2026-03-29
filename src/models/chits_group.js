'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ChitsGroup extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  ChitsGroup.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    group_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    chit_series_term: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    auction_type: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    chit_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    no_of_installments: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    chit_agreement_number: DataTypes.STRING,
    pso_date: DataTypes.DATEONLY,
    pso_number: DataTypes.STRING,
    ca_date: DataTypes.DATEONLY,
    commencement_date: DataTypes.DATEONLY,
    term_date: DataTypes.DATEONLY,
    enrollment_fee: DataTypes.DECIMAL(15, 2),
    company_chit_number: DataTypes.INTEGER,
    no_auction_installment: DataTypes.INTEGER,
    company_commission: DataTypes.DECIMAL(5, 2),
    max_ceiling_in: DataTypes.DECIMAL(5, 2),
    penality_for_nps: DataTypes.DECIMAL(10, 2),
    penality_for_ps: DataTypes.DECIMAL(10, 2),
    auctions_per_month: DataTypes.INTEGER,
    installment_amount: DataTypes.DECIMAL(15, 2),
    auction_date: DataTypes.DATEONLY,
    days: DataTypes.INTEGER,
    bi_monthly_extra_input: DataTypes.TEXT,
    auction_from: DataTypes.TIME,
    auction_to: DataTypes.TIME,
    dividend: DataTypes.INTEGER,
    send_sms_to_all_customers: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    fdr_number: DataTypes.STRING,
    fdr_type: DataTypes.INTEGER,
    fdr_amount: DataTypes.DECIMAL(15, 2),
    fdr_date: DataTypes.DATEONLY,
    no_of_months: DataTypes.INTEGER,
    maturity_date: DataTypes.DATEONLY,
    roi_per_year: DataTypes.DECIMAL(5, 2),
    fdr_mat_amt: DataTypes.DECIMAL(15, 2),
    bank_name: DataTypes.STRING,
    bank_branch: DataTypes.STRING,
    asset_description: DataTypes.TEXT,
    asset_value: DataTypes.DECIMAL(15, 2),
    chits_group_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '0 - Not started, 1 - started, 2 - completed'
    },
    chit_start_date: DataTypes.DATEONLY,
    chit_end_date: DataTypes.DATEONLY,
    due_date_number_count: DataTypes.INTEGER,
    running_status: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    company_id: DataTypes.UUID,
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'ChitsGroup',
    tableName: 'chits_groups'
  });
  return ChitsGroup;
};
