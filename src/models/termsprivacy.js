'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TermsPrivacy extends Model {
    static associate(models) {
      TermsPrivacy.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
    }
  }

  TermsPrivacy.init({
    company_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    type: {
      type: DataTypes.INTEGER, // 1 = Terms & Conditions, 2 = Privacy Policy
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    is_deleted_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'TermsPrivacy',
    tableName: 'terms_privacy'
  });

  return TermsPrivacy;
};
