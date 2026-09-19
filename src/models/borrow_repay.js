'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BorrowRepay extends Model {
    static associate(models) {
      if (models.PaymentAccount) {
        BorrowRepay.belongsTo(models.PaymentAccount, { as: 'Account', foreignKey: 'account_id' });
      }
      if (models.Company) {
        BorrowRepay.belongsTo(models.Company, { as: 'Company', foreignKey: 'company_id' });
      }
    }
  }

  BorrowRepay.init(
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
      type: {
        type: DataTypes.ENUM('BORROW', 'REPAY'),
        allowNull: false
      },
      party_name: {
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
      modelName: 'BorrowRepay',
      tableName: 'borrow_repays',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  );

  return BorrowRepay;
};
