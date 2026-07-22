'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RevokedToken extends Model {
    static associate(models) {
      // define association here
    }
  }
  RevokedToken.init({
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'RevokedToken',
  });
  return RevokedToken;
};
