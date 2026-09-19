'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AccountingVoucher extends Model {
    static associate(models) {
      if (models.Company) {
        AccountingVoucher.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
      }
      if (models.PaymentAccount) {
        AccountingVoucher.belongsTo(models.PaymentAccount, { foreignKey: 'account_id', as: 'payment_account' });
      }
      if (models.AccountingVoucherLine) {
        AccountingVoucher.hasMany(models.AccountingVoucherLine, { foreignKey: 'voucher_id', as: 'lines', onDelete: 'CASCADE' });
      }
    }
  }

  AccountingVoucher.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    voucher_type: {
      type: DataTypes.ENUM('CR', 'CP', 'BD', 'BP'),
      allowNull: false
    },
    voucher_number: {
      type: DataTypes.STRING,
      allowNull: false
    },
    transaction_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    account_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    narration: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    total_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'AccountingVoucher',
    tableName: 'accounting_vouchers',
    underscored: true,
  });

  return AccountingVoucher;
};
