'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('member');

    // Task 1: Add new columns if they don't exist
    if (!tableInfo.rep_by_first_name) {
      await queryInterface.addColumn('member', 'rep_by_first_name', { type: Sequelize.STRING, allowNull: true });
    }
    if (!tableInfo.sur_name) {
      await queryInterface.addColumn('member', 'sur_name', { type: Sequelize.STRING, allowNull: true });
    }
    if (!tableInfo.guardian_name) {
      await queryInterface.addColumn('member', 'guardian_name', { type: Sequelize.STRING, allowNull: true });
    }
    if (!tableInfo.relation) {
      await queryInterface.addColumn('member', 'relation', { type: Sequelize.STRING, allowNull: true });
    }

    // Task 2: Modify existing columns to store UUIDs
    const uuidCols = [
      'name_prefix',
      'parental_prefix',
      'gender',
      'employee_occupation',
      'employee_type'
    ];

    for (const col of uuidCols) {
      if (tableInfo[col].type !== 'UUID') {
        try {
          await queryInterface.sequelize.query(`ALTER TABLE member ALTER COLUMN ${col} TYPE UUID USING ${col}::uuid`);
        } catch (e) {
          console.warn(`Could not cast ${col} to UUID: ${e.message}`);
          // If casting fails, it might be because of existing invalid data. 
          // For now, we'll try to set them to null if it fails, or just warn.
        }
      }
    }

    const jsonCols = ['introduced_as', 'other_info_kyc_details'];
    for (const col of jsonCols) {
      if (tableInfo[col].type !== 'UUID') {
        try {
          // If it's JSON, we cast to text then uuid
          await queryInterface.sequelize.query(`ALTER TABLE member ALTER COLUMN ${col} TYPE UUID USING ${col}::text::uuid`);
        } catch (e) {
          console.warn(`Could not cast ${col} to UUID: ${e.message}`);
        }
      }
    }
  },

  async down(queryInterface, Sequelize) {
    // Revert Task 1
    await queryInterface.removeColumn('member', 'rep_by_first_name');
    await queryInterface.removeColumn('member', 'sur_name');
    await queryInterface.removeColumn('member', 'guardian_name');
    await queryInterface.removeColumn('member', 'relation');

    // Revert Task 2
    const uuidCols = [
      'name_prefix',
      'parental_prefix',
      'gender',
      'employee_occupation',
      'employee_type'
    ];
    for (const col of uuidCols) {
      await queryInterface.sequelize.query(`ALTER TABLE member ALTER COLUMN ${col} TYPE VARCHAR(255) USING ${col}::text`);
    }

    const jsonCols = ['introduced_as', 'other_info_kyc_details'];
    for (const col of jsonCols) {
      await queryInterface.sequelize.query(`ALTER TABLE member ALTER COLUMN ${col} TYPE JSON USING ${col}::text::json`);
    }
  }
};
