'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class City extends Model {
    static associate(models) {
      City.belongsTo(models.Country, { foreignKey: 'country_id' });
      City.belongsTo(models.State, { foreignKey: 'state_id' });
      City.belongsTo(models.District, { foreignKey: 'district_id' });
    }
  }
  City.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    city_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    pin_code: DataTypes.STRING,
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    state_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    district_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    company_id: DataTypes.UUID
  }, {
    sequelize,
    modelName: 'City',
    tableName: 'cities',
  });
  return City;
};
