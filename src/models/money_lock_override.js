'use strict';
const { Model } = require('sequelize');

/** One row each time the company admin changes a money entry inside Transaction Lock Days. */
module.exports = (sequelize, DataTypes) => {
  class MoneyLockOverride extends Model {}
  MoneyLockOverride.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    entity: { type: DataTypes.STRING(40), allowNull: false },
    entity_id: { type: DataTypes.STRING, allowNull: true },
    action: { type: DataTypes.STRING(20), allowNull: false },
    entry_date: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    user_id: { type: DataTypes.STRING, allowNull: true },
    user_name: { type: DataTypes.STRING, allowNull: true },
  }, { sequelize, modelName: 'MoneyLockOverride', tableName: 'money_lock_overrides' });
  return MoneyLockOverride;
};
