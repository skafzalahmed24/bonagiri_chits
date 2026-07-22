'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // companies
    await queryInterface.addColumn('companies', 'mobile_otp_expires_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('companies', 'mobile_otp_attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // member
    await queryInterface.addColumn('member', 'mobile_otp_expires_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('member', 'mobile_otp_attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // staff_user
    await queryInterface.addColumn('staff_user', 'otp_expires_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('staff_user', 'otp_attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('companies', 'mobile_otp_expires_at');
    await queryInterface.removeColumn('companies', 'mobile_otp_attempts');
    await queryInterface.removeColumn('member', 'mobile_otp_expires_at');
    await queryInterface.removeColumn('member', 'mobile_otp_attempts');
    await queryInterface.removeColumn('staff_user', 'otp_expires_at');
    await queryInterface.removeColumn('staff_user', 'otp_attempts');
  }
};
