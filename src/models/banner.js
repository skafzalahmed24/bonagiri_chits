'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Banner extends Model {
    static associate(models) {
      Banner.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
      Banner.hasMany(models.AssignedBannerToPeople, { foreignKey: 'assigned_banner_id', as: 'assigned_subscribers' });
      Banner.belongsToMany(models.Member, {
        through: models.AssignedBannerToPeople,
        foreignKey: 'assigned_banner_id',
        otherKey: 'subscriber_id',
        as: 'subscribers'
      });
    }
  }

  Banner.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    banner_image: {
      type: DataTypes.STRING,
      allowNull: false
    },
    banner_type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: '1 - regular (all subscribers), 2 - particular subscribers'
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: '1 - active, 0 - inactive'
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '0 - active, 1 - deleted'
    },
    banner_start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    banner_end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Banner',
    tableName: 'banners',
    timestamps: true
  });

  return Banner;
};
