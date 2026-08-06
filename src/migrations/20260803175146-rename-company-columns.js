'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.renameColumn('companies', 'enrollement_charges', 'enrollment_charges');
    await queryInterface.renameColumn('companies', 'tranaction_lock_days', 'transaction_lock_days');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.renameColumn('companies', 'enrollment_charges', 'enrollement_charges');
    await queryInterface.renameColumn('companies', 'transaction_lock_days', 'tranaction_lock_days');
  }
};
