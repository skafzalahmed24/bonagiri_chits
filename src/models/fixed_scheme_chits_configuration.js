'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FixedSchemeChitsConfiguration extends Model {
    static associate(models) {
      FixedSchemeChitsConfiguration.belongsTo(models.Company, {
        foreignKey: 'company_id',
        as: 'company'
      });
    }
  }

  FixedSchemeChitsConfiguration.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Common fields
    scheme_type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '62=Withdrawn/Non-Withdrawn, 63=Fixed+Adding, 64=Auction Based Growing, 65=Growing Price & Fixed Installments'
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    months_count: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    members_count: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: '0=inactive, 1=active'
    },
    company_profit: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },

    // Prices JSONB (types 62, 64, 65)
    prices: {
      type: DataTypes.JSONB,
      allowNull: true
    },

    // Type 63 specific fields
    chit_value: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true
    },
    adding_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },
    installment: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true
    },
    company_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },
    company_chit: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'FixedSchemeChitsConfiguration',
    tableName: 'fixed_scheme_chits_configuration'
  });

  return FixedSchemeChitsConfiguration;
};
