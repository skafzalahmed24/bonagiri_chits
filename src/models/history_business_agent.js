'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class HistoryBusinessAgent extends Model {
    static associate(models) {
      HistoryBusinessAgent.belongsTo(models.ConfigureBusinessAgentCommission, { foreignKey: 'configure_business_agent_id', as: 'configure_business_agent' });
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
    }
  }, {
    sequelize,
    modelName: 'HistoryBusinessAgent',
    tableName: 'history_business_agents',
  });
  return HistoryBusinessAgent;
};
