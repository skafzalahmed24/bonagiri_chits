'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PlatformSupportFaq extends Model {
    static associate(models) {
      // Platform-level: no associations required
    }
  }

  PlatformSupportFaq.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    question: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'PlatformSupportFaq',
    tableName: 'platform_support_faq',
    underscored: true,
    timestamps: true
  });

  return PlatformSupportFaq;
};
