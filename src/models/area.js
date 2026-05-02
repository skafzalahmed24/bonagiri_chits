'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Area extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Area.belongsTo(models.Route, {
        foreignKey: 'route_id',
        as: 'route'
      });
    }
  }
  Area.init({
    route_id: DataTypes.INTEGER,
    area_name: DataTypes.STRING,
    company_id: DataTypes.UUID,
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'Area',
    tableName: 'areas'
  });
  return Area;
};