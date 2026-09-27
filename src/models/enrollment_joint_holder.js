'use strict';
const { Model } = require('sequelize');

/** A member who holds a ticket jointly with the enrollment's main holder (subscriber). */
module.exports = (sequelize, DataTypes) => {
  class EnrollmentJointHolder extends Model {
    static associate(models) {
      EnrollmentJointHolder.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
      EnrollmentJointHolder.belongsTo(models.Member, { foreignKey: 'member_id', as: 'member' });
    }
  }
  EnrollmentJointHolder.init({
    company_id: DataTypes.UUID,
    enrollment_id: DataTypes.INTEGER,
    member_id: DataTypes.INTEGER,
    share_percent: DataTypes.DECIMAL(5, 2),
    added_on: DataTypes.DATEONLY,
    removed_on: DataTypes.DATEONLY,
    removed_reason: DataTypes.TEXT,
  }, {
    sequelize,
    modelName: 'EnrollmentJointHolder',
    tableName: 'enrollment_joint_holders',
  });
  return EnrollmentJointHolder;
};
