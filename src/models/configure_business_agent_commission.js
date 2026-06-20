'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ConfigureBusinessAgentCommission extends Model {
    static associate(models) {
      ConfigureBusinessAgentCommission.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
      ConfigureBusinessAgentCommission.belongsTo(models.ChitsGroup, { foreignKey: 'group_id', as: 'group' });
      ConfigureBusinessAgentCommission.belongsTo(models.Member, { foreignKey: 'business_agent_id', as: 'business_agent' });
      ConfigureBusinessAgentCommission.belongsTo(models.Member, { foreignKey: 'member_id', as: 'member' });
    }
  }
  ConfigureBusinessAgentCommission.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    group_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    business_agent_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    member_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    commission_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'ConfigureBusinessAgentCommission',
    tableName: 'configure_business_agent_commissions',
  });
  return ConfigureBusinessAgentCommission;
};
