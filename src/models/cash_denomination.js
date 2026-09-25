'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CashDenomination extends Model {}

  CashDenomination.init({
    company_id: { type: DataTypes.UUID, allowNull: false },
    count_date: { type: DataTypes.DATEONLY, allowNull: false },
    notes_500: { type: DataTypes.INTEGER, defaultValue: 0 },
    notes_200: { type: DataTypes.INTEGER, defaultValue: 0 },
    notes_100: { type: DataTypes.INTEGER, defaultValue: 0 },
    notes_50: { type: DataTypes.INTEGER, defaultValue: 0 },
    notes_20: { type: DataTypes.INTEGER, defaultValue: 0 },
    notes_10: { type: DataTypes.INTEGER, defaultValue: 0 },
    coins_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    total_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    remarks: DataTypes.TEXT,
    counted_by: DataTypes.STRING,
  }, {
    sequelize,
    modelName: 'CashDenomination',
    tableName: 'cash_denominations',
  });

  return CashDenomination;
};
