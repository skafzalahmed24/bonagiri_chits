module.exports = (sequelize, DataTypes) => {
  const SystemSettings = sequelize.define('SystemSettings', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    business_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    scheduler_mode: {
      type: DataTypes.STRING,
      defaultValue: 'AUTOMATIC',
    },
    environment: {
      type: DataTypes.STRING,
      defaultValue: 'Production',
    },
    last_updated_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    last_updated_on: {
      type: DataTypes.DATE,
      allowNull: true,
    }
  }, {
    tableName: 'system_settings',
    timestamps: true,
  });

  SystemSettings.associate = function(models) {
    SystemSettings.belongsTo(models.StaffUser, { foreignKey: 'last_updated_by', as: 'lastUpdatedBy' });
  };

  return SystemSettings;
};