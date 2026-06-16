'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class UpcomingChit extends Model {
    static associate(models) {
      // define association here
      UpcomingChit.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
      UpcomingChit.hasMany(models.UpcomingChitInterest, { foreignKey: 'upcoming_chit_id', as: 'interests' });
    }
  }
  UpcomingChit.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    group_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    chit_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    chit_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    },
    remarks: {
      type: DataTypes.STRING,
      allowNull: true
    },
    no_of_installments: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'UpcomingChit',
    tableName: 'upcoming_chits'
  });
  return UpcomingChit;
};
