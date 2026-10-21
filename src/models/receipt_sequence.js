'use strict';
const { Model } = require('sequelize');

/** Last receipt number issued per company and financial year ('2026-27'). */
module.exports = (sequelize, DataTypes) => {
  class ReceiptSequence extends Model {}
  ReceiptSequence.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    fin_year: { type: DataTypes.STRING(7), allowNull: false },
    last_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, { sequelize, modelName: 'ReceiptSequence', tableName: 'receipt_sequences' });
  return ReceiptSequence;
};
