'use strict';
const {
  Model
} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AgentTargetEntry extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      AgentTargetEntry.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
      AgentTargetEntry.belongsTo(models.StaticDropdownsList, { foreignKey: 'agent_type_id', as: 'agent_type' });
      AgentTargetEntry.belongsTo(models.Member, { foreignKey: 'agent_id', as: 'agent' });
    }
  }
  AgentTargetEntry.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    agent_type_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    agent_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    target_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true
    },
    from_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    to_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    due_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'AgentTargetEntry',
    tableName: 'agent_target_entries',
  });
  return AgentTargetEntry;
};
