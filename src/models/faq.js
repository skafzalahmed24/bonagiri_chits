'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FAQ extends Model {
    static associate(models) {
      FAQ.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
    }
  }

  FAQ.init({
    company_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'FAQ',
    tableName: 'faqs'
  });

  return FAQ;
};
