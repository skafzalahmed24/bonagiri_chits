'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AuditLog extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  AuditLog.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: DataTypes.STRING,
    user_type: DataTypes.STRING,
    company_id: DataTypes.STRING,
    action_type: DataTypes.STRING,
    module_or_route: DataTypes.STRING,
    request_payload: DataTypes.JSON,
    old_values: DataTypes.JSON,
    new_values: DataTypes.JSON,
    ip_address: DataTypes.STRING,
    user_agent: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'AuditLog',
    tableName: 'audit_logs'
  });
  return AuditLog;
};