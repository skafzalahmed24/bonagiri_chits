'use strict';
const { Model } = require('sequelize');

/** Unused member advance paid back out of a payment account (admin only, with a reason). */
module.exports = (sequelize, DataTypes) => {
  class AdvanceRefund extends Model {
    static associate(models) {
      AdvanceRefund.belongsTo(models.MemberAdvance, { foreignKey: 'member_advance_id', as: 'advance' });
      AdvanceRefund.belongsTo(models.PaymentAccount, { foreignKey: 'account_id', as: 'account' });
    }
  }
  AdvanceRefund.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    member_advance_id: { type: DataTypes.INTEGER, allowNull: false },
    account_id: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    refund_date: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    refunded_by_name: { type: DataTypes.STRING, allowNull: true },
  }, { sequelize, modelName: 'AdvanceRefund', tableName: 'advance_refunds' });
  return AdvanceRefund;
};
