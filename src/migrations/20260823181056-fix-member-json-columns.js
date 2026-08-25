'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Safely convert introduced_as to JSONB
    await queryInterface.sequelize.query(`
      ALTER TABLE member 
      ALTER COLUMN introduced_as TYPE JSONB 
      USING CASE 
        WHEN introduced_as IS NULL THEN NULL 
        ELSE introduced_as::text::JSONB 
      END
    `).catch(() => console.log('introduced_as is already JSONB or conversion skipped'));

    // Safely convert other_info_kyc_details to JSONB
    await queryInterface.sequelize.query(`
      ALTER TABLE member 
      ALTER COLUMN other_info_kyc_details TYPE JSONB 
      USING CASE 
        WHEN other_info_kyc_details IS NULL THEN NULL 
        ELSE other_info_kyc_details::text::JSONB 
      END
    `).catch(() => console.log('other_info_kyc_details is already JSONB or conversion skipped'));
  },

  async down (queryInterface, Sequelize) {
    // Revert logic if necessary
    await queryInterface.sequelize.query(`
      ALTER TABLE member 
      ALTER COLUMN introduced_as TYPE UUID 
      USING (introduced_as->>0)::uuid
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TABLE member 
      ALTER COLUMN other_info_kyc_details TYPE UUID 
      USING (other_info_kyc_details->>0)::uuid
    `).catch(() => {});
  }
};

