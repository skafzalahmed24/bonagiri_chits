'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop existing table if it was recently created with wrong types, or just alter columns
    // Using explicit SQL for casting since we're using Postgres
    await queryInterface.sequelize.query('ALTER TABLE enrollments ALTER COLUMN company_id TYPE UUID USING (CASE WHEN company_id IS NULL THEN NULL ELSE company_id::text::uuid END)');
    await queryInterface.sequelize.query('ALTER TABLE enrollments ALTER COLUMN group_id TYPE UUID USING (CASE WHEN group_id IS NULL THEN NULL ELSE group_id::text::uuid END)');
    await queryInterface.sequelize.query('ALTER TABLE enrollments ALTER COLUMN nominee_city_id TYPE UUID USING (CASE WHEN nominee_city_id IS NULL THEN NULL ELSE nominee_city_id::text::uuid END)');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('ALTER TABLE enrollments ALTER COLUMN company_id TYPE INTEGER USING (CASE WHEN company_id IS NULL THEN NULL ELSE company_id::text::integer END)');
    await queryInterface.sequelize.query('ALTER TABLE enrollments ALTER COLUMN group_id TYPE INTEGER USING (CASE WHEN group_id IS NULL THEN NULL ELSE group_id::text::integer END)');
    await queryInterface.sequelize.query('ALTER TABLE enrollments ALTER COLUMN nominee_city_id TYPE INTEGER USING (CASE WHEN nominee_city_id IS NULL THEN NULL ELSE nominee_city_id::text::integer END)');
  }
};
