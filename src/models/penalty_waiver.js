'use strict';
const { Model } = require('sequelize');

/** Penalty the company admin forgave on an instalment, and why. The instalment's penalty is reduced by it. */
module.exports = (sequelize, DataTypes) => {
  class PenaltyWaiver extends Model {}
  PenaltyWaiver.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    chits_installment_id: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    waived_by_name: { type: DataTypes.STRING, allowNull: true },
  }, { sequelize, modelName: 'PenaltyWaiver', tableName: 'penalty_waivers' });
  return PenaltyWaiver;
};
