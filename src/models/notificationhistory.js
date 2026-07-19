'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class NotificationHistory extends Model {
    static associate(models) {
      // We do not set a strict foreign key because user_id is polymorphic
      // between Member.id (INTEGER) and StaffUser.id (UUID).
    }
  }
  NotificationHistory.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    user_type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    data_payload: {
      type: DataTypes.JSON,
      allowNull: true
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    sequelize,
    modelName: 'NotificationHistory',
    tableName: 'notification_histories',
  });
  return NotificationHistory;
};
