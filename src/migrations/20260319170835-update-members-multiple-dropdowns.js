'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Change UUID to JSONB by wrapping existing value in an array if it's not null
    await queryInterface.sequelize.query(`
      ALTER TABLE member 
      ALTER COLUMN introduced_as TYPE JSONB 
      USING CASE 
        WHEN introduced_as IS NULL THEN NULL 
        ELSE jsonb_build_array(introduced_as::text) 
      END
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE member 
      ALTER COLUMN other_info_kyc_details TYPE JSONB 
      USING CASE 
        WHEN other_info_kyc_details IS NULL THEN NULL 
        ELSE jsonb_build_array(other_info_kyc_details::text) 
      END
    `);
  },

  async down(queryInterface, Sequelize) {
    // Revert back to UUID (takes first element of array if it's an array)
    await queryInterface.sequelize.query(`
      ALTER TABLE member 
      ALTER COLUMN introduced_as TYPE UUID 
      USING (introduced_as->>0)::uuid
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE member 
      ALTER COLUMN other_info_kyc_details TYPE UUID 
      USING (other_info_kyc_details->>0)::uuid
    `);
  }
};
