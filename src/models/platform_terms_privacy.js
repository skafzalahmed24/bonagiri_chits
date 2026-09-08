'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PlatformTermsPrivacy extends Model {
    static associate(models) {
      // Platform-level: no associations required
    }
  }

  PlatformTermsPrivacy.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    type: {
      type: DataTypes.INTEGER, // 1 = Terms and Conditions, 2 = Privacy Policy
      allowNull: false,
      unique: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    }
  }, {
    sequelize,
    modelName: 'PlatformTermsPrivacy',
    tableName: 'platform_terms_privacy',
    underscored: true,
    timestamps: true
  });

  return PlatformTermsPrivacy;
};
