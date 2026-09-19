'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AccountingVoucherLine extends Model {
    static associate(models) {
      if (models.AccountingVoucher) {
        AccountingVoucherLine.belongsTo(models.AccountingVoucher, { foreignKey: 'voucher_id', as: 'voucher' });
      }
      if (models.AccountCreationDetail) {
        AccountingVoucherLine.belongsTo(models.AccountCreationDetail, { foreignKey: 'particulars_account_id', as: 'particulars_account' });
      }
    }
  }

  AccountingVoucherLine.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    voucher_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    particulars_account_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    narration: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0
    },
    cheque_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cheque_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    bank_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    place: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'AccountingVoucherLine',
    tableName: 'accounting_voucher_lines',
    underscored: true,
  });

  return AccountingVoucherLine;
};
