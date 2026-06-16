'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('static_dropdowns_list', [
      // type id 14 - Chit Type
      { id: 62, dropdown_name: 'Withdrawn / Non Withdrawn', type_id: 14, status: 1, is_default: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 63, dropdown_name: 'Fixed + Adding', type_id: 14, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 64, dropdown_name: 'Auction Based Growing Amount', type_id: 14, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 65, dropdown_name: 'Growing Price & Fixed Installments', type_id: 14, status: 1, is_default: 0, createdAt: new Date(), updatedAt: new Date() },
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('static_dropdowns_list', {
      id: [62, 63, 64, 65]
    }, {});
  }
};
