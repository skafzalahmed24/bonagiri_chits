'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PaymentAccount extends Model {
    static associate(models) {
      if (models.Company) {
        PaymentAccount.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
      }
    }
  }

  PaymentAccount.init({
    company_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    account_type: {
      type: DataTypes.ENUM('CASH', 'UPI', 'BANK'),
      allowNull: false
    },
    identifier: {
      type: DataTypes.STRING,
      allowNull: true
    },
    opening_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0
    },
    current_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'PaymentAccount',
    tableName: 'payment_accounts',
    underscored: true,
  });

  return PaymentAccount;
};
