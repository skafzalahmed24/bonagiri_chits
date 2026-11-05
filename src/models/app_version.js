'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AppVersion extends Model {
    static associate(models) {
      // Platform-level: no associations required
    }
  }

  AppVersion.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    platform: {
      type: DataTypes.STRING(20), // 'android' | 'ios'
      allowNull: false,
      unique: true
    },
    latest_version: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: '1.0.0'
    },
    min_supported_version: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: '1.0.0'
    },
    force_update: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    store_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    update_message: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'AppVersion',
    tableName: 'app_versions',
    underscored: true,
    timestamps: true
  });

  return AppVersion;
};
