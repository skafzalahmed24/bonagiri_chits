'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SelfTransfer extends Model {
    static associate(models) {
      if (models.PaymentAccount) {
        SelfTransfer.belongsTo(models.PaymentAccount, { as: 'FromAccount', foreignKey: 'from_account_id' });
        SelfTransfer.belongsTo(models.PaymentAccount, { as: 'ToAccount', foreignKey: 'to_account_id' });
      }
      if (models.Company) {
        SelfTransfer.belongsTo(models.Company, { as: 'Company', foreignKey: 'company_id' });
      }
    }
  }

  SelfTransfer.init(
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
      from_account_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      to_account_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
      },
      narration: {
        type: DataTypes.STRING,
        allowNull: true
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'SelfTransfer',
      tableName: 'self_transfers',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  );

  return SelfTransfer;
};
