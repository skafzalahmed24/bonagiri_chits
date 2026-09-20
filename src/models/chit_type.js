'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ChitType extends Model {
    static associate(models) {
      ChitType.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
    }
  }
  ChitType.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    bg_color: {
      type: DataTypes.STRING,
      allowNull: true
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true
    },
    auction_type: {
      type: DataTypes.INTEGER,
      allowNull: true
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
    display_order: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    }
  }, {
    sequelize,
    modelName: 'ChitType',
    tableName: 'chit_types',
    timestamps: true
  });
  return ChitType;
};
