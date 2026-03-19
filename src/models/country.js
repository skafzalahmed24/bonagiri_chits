'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Country extends Model {
    static associate(models) {
      Country.hasMany(models.State, { foreignKey: 'country_id' });
    }
  }
  Country.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false
    },
    country_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    country_code: DataTypes.STRING,
    dialing_code: DataTypes.STRING,
    currency: DataTypes.STRING,
    currency_name: DataTypes.STRING,
    currency_symbol: DataTypes.STRING,
    emoji: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Country',
    tableName: 'countries',
  });
  return Country;
};
