'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // 1. Backfill company_id for historical company-admin audit logs where
    // company_id was recorded as NULL but user_id contains the company UUID.
    await queryInterface.sequelize.query(`
      UPDATE audit_logs
      SET company_id = user_id
      WHERE user_type = 'company'
        AND company_id IS NULL
        AND user_id IS NOT NULL
        AND user_id IN (SELECT id::text FROM companies);
    `);

    // 2. Create index on company_id and createdAt for performant tenant queries.
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
      ON audit_logs (company_id, "createdAt" DESC);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_audit_logs_company_created;
    `);
  }
};
