'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GroupUnderStaticList extends Model {
    static associate(models) {
      // No associations required for now
    }
  }
  GroupUnderStaticList.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    group_under_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    account_order: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'GroupUnderStaticList',
    tableName: 'group_under_static_lists',
  });
  return GroupUnderStaticList;
};
