'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerVisit extends Model {
    static associate(models) {
      // define association here
      CustomerVisit.belongsTo(models.Member, { foreignKey: 'member_id', as: 'member' });
      CustomerVisit.belongsTo(models.Member, { foreignKey: 'collection_agent_id', as: 'collection_agent' });
    }
  }
  CustomerVisit.init({
    member_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    collection_agent_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    visitor_type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '1 for offline, 2 for online'
    },
    upload_proof: {
      type: DataTypes.STRING,
      allowNull: true
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    customer_vistor_status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '0 for pending, 1 for verified, 3 for rejected'
    }
  }, {
    sequelize,
    modelName: 'CustomerVisit',
    tableName: 'customer_visits',
  });
  return CustomerVisit;
};
