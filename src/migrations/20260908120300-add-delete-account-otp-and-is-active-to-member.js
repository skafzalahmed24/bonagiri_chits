'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('member');

    if (!tableInfo.is_active) {
      await queryInterface.addColumn('member', 'is_active', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }

    if (!tableInfo.delete_account_otp) {
      await queryInterface.addColumn('member', 'delete_account_otp', {
        type: Sequelize.STRING(10),
        allowNull: true,
        defaultValue: null
      });
    }

    if (!tableInfo.delete_account_otp_expires_at) {
      await queryInterface.addColumn('member', 'delete_account_otp_expires_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('member');

    if (tableInfo.delete_account_otp_expires_at) {
      await queryInterface.removeColumn('member', 'delete_account_otp_expires_at');
    }
    if (tableInfo.delete_account_otp) {
      await queryInterface.removeColumn('member', 'delete_account_otp');
    }
    if (tableInfo.is_active) {
      await queryInterface.removeColumn('member', 'is_active');
    }
  }
};
