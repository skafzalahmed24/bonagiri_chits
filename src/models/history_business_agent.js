'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class HistoryBusinessAgent extends Model {
    static associate(models) {
      HistoryBusinessAgent.belongsTo(models.ConfigureBusinessAgentCommission, { foreignKey: 'configure_business_agent_id', as: 'configure_business_agent' });
      HistoryBusinessAgent.belongsTo(models.PaymentAccount, { foreignKey: 'account_id', as: 'account' });
    }
  }
  HistoryBusinessAgent.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    configure_business_agent_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    upload_document: {
      type: DataTypes.STRING,
      allowNull: true
    },
    paid_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    account_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    payment_mode: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    paid_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    // Cancelled payouts keep is_deleted_status = 1 plus who, when and why.
    cancelled_at: { type: DataTypes.DATE, allowNull: true },
    cancelled_by_name: { type: DataTypes.STRING, allowNull: true },
    cancel_reason: { type: DataTypes.TEXT, allowNull: true }
  }, {
    sequelize,
    modelName: 'HistoryBusinessAgent',
    tableName: 'history_business_agents',
  });
  return HistoryBusinessAgent;
};
