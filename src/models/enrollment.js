'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Enrollment extends Model {
    static associate(models) {
      Enrollment.belongsTo(models.Company, { foreignKey: 'company_id', as: 'company' });
      Enrollment.belongsTo(models.ChitsGroup, { foreignKey: 'group_id', as: 'group' });
      Enrollment.belongsTo(models.Member, { foreignKey: 'subscriber_id', as: 'subscriber' });
      Enrollment.belongsTo(models.StaticDropdownsList, { foreignKey: 'payment_mode_id', as: 'payment_mode', targetKey: 'id' });
      Enrollment.belongsTo(models.Member, { foreignKey: 'business_agent_id', as: 'business_agent' });
      Enrollment.belongsTo(models.StaticDropdownsList, { foreignKey: 'intimation_card_id', as: 'intimation_card', targetKey: 'id' });
      Enrollment.belongsTo(models.Member, { foreignKey: 'collection_agent_id', as: 'collection_agent' });
      Enrollment.belongsTo(models.Area, { foreignKey: 'area_id', as: 'area' });
      Enrollment.belongsTo(models.City, { foreignKey: 'nominee_city_id', as: 'nominee_city' });
    }
  }
  Enrollment.init({
    company_id: DataTypes.UUID,
    group_id: DataTypes.UUID,
    group_position_number: DataTypes.INTEGER,
    enrollment_date: DataTypes.DATEONLY,
    subscriber_id: DataTypes.INTEGER,
    payment_mode_id: DataTypes.INTEGER,
    business_agent_id: DataTypes.INTEGER,
    intimation_card_id: DataTypes.INTEGER,
    address_type: DataTypes.INTEGER,
    collection_agent_id: DataTypes.INTEGER,
    business_type_id: DataTypes.INTEGER,
    area_id: DataTypes.INTEGER,
    nominee_name: DataTypes.STRING,
    nominee_age: DataTypes.INTEGER,
    nominee_relation: DataTypes.STRING,
    nominee_door_number: DataTypes.STRING,
    nominee_city_id: DataTypes.UUID,
    nominee_street_name: DataTypes.STRING,
    nominee_address: DataTypes.TEXT,
    nominee_mobile_number: DataTypes.STRING,
    nominee_pincode: DataTypes.STRING,
    fill_subscriber_address_status: DataTypes.INTEGER,
    delete_status: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'Enrollment',
    tableName: 'enrollments',
  });
  return Enrollment;
};
