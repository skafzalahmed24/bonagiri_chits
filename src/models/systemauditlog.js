module.exports = (sequelize, DataTypes) => {
  const SystemAuditLog = sequelize.define('SystemAuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    action_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    previous_value: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    new_value: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    changed_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    changed_on: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
    }
  }, {
    tableName: 'system_audit_logs',
    timestamps: true,
  });

  SystemAuditLog.associate = function(models) {
    SystemAuditLog.belongsTo(models.StaffUser, { foreignKey: 'changed_by', as: 'changedBy' });
  };

  return SystemAuditLog;
};