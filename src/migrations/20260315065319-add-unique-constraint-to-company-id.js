'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addConstraint('companies', {
      fields: ['company_id'],
      type: 'unique',
      name: 'unique_company_id_constraint'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeConstraint('companies', 'unique_company_id_constraint');
  }
};
