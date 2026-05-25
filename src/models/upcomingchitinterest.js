'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UpcomingChitInterest extends Model {
    static associate(models) {
      UpcomingChitInterest.belongsTo(models.UpcomingChit, { foreignKey: 'upcoming_chit_id', as: 'upcomingChit' });
      UpcomingChitInterest.belongsTo(models.Member, { foreignKey: 'user_id', as: 'user' });
    }
  }

  UpcomingChitInterest.init({
    upcoming_chit_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    showing_interest: {
      type: DataTypes.INTEGER,
      defaultValue: 1 // 1 = Interested
    }
  }, {
    sequelize,
    modelName: 'UpcomingChitInterest',
    tableName: 'upcoming_chit_interests'
  });

  return UpcomingChitInterest;
};
