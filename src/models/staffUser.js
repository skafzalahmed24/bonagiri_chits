module.exports = (sequelize, DataTypes) => {
  const StaffUser = sequelize.define('StaffUser', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    role_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    user_code: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name_prefix: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    mobile_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    otp: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    otp_expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    otp_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    fcm_token: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    device_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    device_unique_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    platform_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    device_details: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'staff_user',
    timestamps: true,
    defaultScope: {
      attributes: { exclude: ['password'] }
    },
    scopes: {
      withPassword: {
        attributes: { include: ['password'] }
      }
    }
  });

  StaffUser.associate = function(models) {
    StaffUser.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
    StaffUser.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
  };

  return StaffUser;
};
