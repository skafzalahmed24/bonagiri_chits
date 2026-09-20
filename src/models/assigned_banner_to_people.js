'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssignedBannerToPeople extends Model {
    static associate(models) {
      AssignedBannerToPeople.belongsTo(models.Banner, { foreignKey: 'assigned_banner_id', as: 'banner' });
      AssignedBannerToPeople.belongsTo(models.Member, { foreignKey: 'subscriber_id', as: 'subscriber' });
    }
  }

  AssignedBannerToPeople.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    assigned_banner_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    subscriber_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'AssignedBannerToPeople',
    tableName: 'assigned_banner_to_peoples',
    timestamps: true
  });

  return AssignedBannerToPeople;
};
