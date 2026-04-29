'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('static_dropdowns_subcategory_list', [
      // category_id 1 - Mr.
      { subcategory_name: 'S/O', category_id: 1, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'C/O', category_id: 1, is_default: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'M/S', category_id: 1, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // category_id 2 - Mrs.
      { subcategory_name: 'C/O', category_id: 2, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'M/S', category_id: 2, is_default: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'W/O', category_id: 2, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // category_id 3 - Miss.
      { subcategory_name: 'D/O', category_id: 3, is_default: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'C/O', category_id: 3, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'M/S', category_id: 3, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // category_id 4 - Dr.
      { subcategory_name: 'dr', category_id: 4, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'S/O', category_id: 4, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'D/O', category_id: 4, is_default: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'C/O', category_id: 4, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'M/S', category_id: 4, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'W/O', category_id: 4, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // category_id 5 - M/S.
      { subcategory_name: 'C/O', category_id: 5, is_default: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // category_id 6 - Mnr.
      { subcategory_name: 'S/O', category_id: 6, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'C/O', category_id: 6, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'M/S', category_id: 6, is_default: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // category_id 19 - Employee (User says business list)
      { subcategory_name: 'business', category_id: 19, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'Retail', category_id: 19, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'Computer', category_id: 19, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'Others', category_id: 19, is_default: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },

      // category_id 20 - Business (User says Private/Govt)
      { subcategory_name: 'Private', category_id: 20, is_default: 0, status: 1, createdAt: new Date(), updatedAt: new Date() },
      { subcategory_name: 'Govt.', category_id: 20, is_default: 1, status: 1, createdAt: new Date(), updatedAt: new Date() },
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('static_dropdowns_subcategory_list', null, {});
  }
};
