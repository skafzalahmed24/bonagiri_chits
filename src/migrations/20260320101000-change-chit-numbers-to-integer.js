'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Change company_chit_number in chits_groups
    // We set non-numeric values to NULL before casting
    await queryInterface.sequelize.query(`
      UPDATE chits_groups 
      SET company_chit_number = NULL 
      WHERE company_chit_number !~ '^[0-9]+$'
    `);
    await queryInterface.changeColumn('chits_groups', 'company_chit_number', {
      type: 'INTEGER USING CAST(company_chit_number AS INTEGER)',
      allowNull: true
    });

    // Change group_position_number in enrollments
    await queryInterface.sequelize.query(`
      UPDATE enrollments 
      SET group_position_number = NULL 
      WHERE group_position_number !~ '^[0-9]+$'
    `);
    await queryInterface.changeColumn('enrollments', 'group_position_number', {
      type: 'INTEGER USING CAST(group_position_number AS INTEGER)',
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.changeColumn('chits_groups', 'company_chit_number', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.changeColumn('enrollments', 'group_position_number', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};
