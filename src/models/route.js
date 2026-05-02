'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Route extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Route.hasMany(models.Area, {
        foreignKey: 'route_id',
        as: 'areas'
      });
    }
  }
  Route.init({
    route_name: DataTypes.STRING,
    company_id: DataTypes.UUID,
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'Route',
    tableName: 'routes'
  });
  return Route;
};