'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ChitsInstallment extends Model {
    static associate(models) {
      ChitsInstallment.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
      ChitsInstallment.hasMany(models.CustomerPayment, { foreignKey: 'chits_installment_id', as: 'payments' });
    }
  }
  ChitsInstallment.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    enrollment_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '1 - monthly, 2 - weekly, 3 - daily'
    },
    installment_no: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    over_due_days_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    penalty_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    payable_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'ChitsInstallment',
    tableName: 'chits_installments'
  });
  return ChitsInstallment;
};