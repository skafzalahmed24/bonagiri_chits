module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define('Role', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    permissions: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  }, {
    tableName: 'role',
    timestamps: true,
  });

  Role.associate = function(models) {
    Role.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
  };

  return Role;
};
