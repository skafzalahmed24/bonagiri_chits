'use strict';
const { Model } = require('sequelize');
const { cancelFields, cancelScopes } = require('../utils/cancellable');

module.exports = (sequelize, DataTypes) => {
  class OutgoingPayment extends Model {
    static associate(models) {
      if (models.PaymentAccount) {
        OutgoingPayment.belongsTo(models.PaymentAccount, { as: 'Account', foreignKey: 'account_id' });
      }
      if (models.Company) {
        OutgoingPayment.belongsTo(models.Company, { as: 'Company', foreignKey: 'company_id' });
      }
    }
  }

  OutgoingPayment.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      recipient_name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      category: {
        type: DataTypes.STRING,
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
      },
      account_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      reference_no: {
        type: DataTypes.STRING,
        allowNull: true
      },
      narration: {
        type: DataTypes.STRING,
        allowNull: true
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      ...cancelFields(DataTypes),
    },
    {
      sequelize,
      ...cancelScopes,
      modelName: 'OutgoingPayment',
      tableName: 'outgoing_payments',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  );

  return OutgoingPayment;
};
