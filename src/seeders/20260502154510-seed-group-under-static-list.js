'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('group_under_static_lists', [
      { id: 1, name: 'Branch/Divisions', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, name: 'Capital Account', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 3, name: 'Current Assets', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 4, name: 'Current Liabilities', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 5, name: 'Direct Expenses', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 6, name: 'Direct Income', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 7, name: 'Fixed Assets', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 8, name: 'Indirect Expenses', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 9, name: 'Indirect Income', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 10, name: 'Loans (Liability)', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 11, name: 'Misc. Expenses (Asset)', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 12, name: 'Outstandings', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 13, name: 'Purchase Accounts', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 14, name: 'Sale Accounts', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 15, name: 'Suspense A/c', group_under_id: null, account_order: 1, type: 1, is_deleted_status: 0, createdAt: new Date(), updatedAt: new Date() }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('group_under_static_lists', null, {});
  }
};
