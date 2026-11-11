'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const [duplicates] = await queryInterface.sequelize.query(`
      SELECT company_id, TRIM(mobile_number) AS mobile, COUNT(*)::int AS cnt
      FROM member
      WHERE is_deleted_status = 0
        AND company_id IS NOT NULL
        AND mobile_number IS NOT NULL
        AND TRIM(mobile_number) <> ''
      GROUP BY company_id, TRIM(mobile_number)
      HAVING COUNT(*) > 1
    `);

    if (duplicates.length > 0) {
      throw new Error(
        `Cannot create member_company_mobile_active_unique index; intra-company duplicates exist: ${JSON.stringify(duplicates)}`
      );
    }

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS member_company_mobile_active_unique
      ON member (company_id, TRIM(mobile_number))
      WHERE is_deleted_status = 0
        AND company_id IS NOT NULL
        AND mobile_number IS NOT NULL
        AND TRIM(mobile_number) <> '';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS member_company_mobile_active_unique;
    `);
  }
};
