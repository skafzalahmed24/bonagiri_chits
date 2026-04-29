'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Update non-numeric values to NULL
    await queryInterface.sequelize.query('UPDATE "member" SET "business_type" = NULL WHERE "business_type" !~ \'^[0-9]+$\'');
    
    await queryInterface.changeColumn('member', 'business_type', {
      type: 'INTEGER USING CAST("business_type" AS INTEGER)',
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('member', 'business_type', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};
