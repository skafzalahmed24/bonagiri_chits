'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StaticDropdownSubcategoryList extends Model {
    static associate(models) {
      StaticDropdownSubcategoryList.belongsTo(models.StaticDropdownsList, { foreignKey: 'category_id', as: 'category' });
    }
  }
  
  StaticDropdownSubcategoryList.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    subcategory_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    is_default: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'StaticDropdownSubcategoryList',
    tableName: 'static_dropdowns_subcategory_list'
  });
  
  return StaticDropdownSubcategoryList;
};
