'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('member', 'is_verified', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });
    await queryInterface.addColumn('member', 'verification_otp', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addColumn('member', 'verification_otp_expires_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('member', 'verification_otp_attempts', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('member', 'is_verified');
    await queryInterface.removeColumn('member', 'verification_otp');
    await queryInterface.removeColumn('member', 'verification_otp_expires_at');
    await queryInterface.removeColumn('member', 'verification_otp_attempts');
  }
};
