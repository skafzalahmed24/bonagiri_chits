'use strict';
const bcrypt = require('bcryptjs');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // We cannot reliably use Model classes in a migration, so we run raw SQL updates
    // Hash Company passwords
    const [companies] = await queryInterface.sequelize.query('SELECT id, company_password FROM "companies" WHERE company_password IS NOT NULL');
    for (const c of companies) {
      if (!c.company_password.startsWith('$2a$') && !c.company_password.startsWith('$2b$')) {
        const hash = await bcrypt.hash(c.company_password, 10);
        await queryInterface.sequelize.query(`UPDATE "companies" SET company_password = '${hash}' WHERE id = '${c.id}'`);
      }
    }

    // Hash Member passwords
    const [members] = await queryInterface.sequelize.query('SELECT id, other_info_user_password FROM "member" WHERE other_info_user_password IS NOT NULL');
    for (const m of members) {
      if (!m.other_info_user_password.startsWith('$2a$') && !m.other_info_user_password.startsWith('$2b$')) {
        const hash = await bcrypt.hash(m.other_info_user_password, 10);
        await queryInterface.sequelize.query(`UPDATE "member" SET other_info_user_password = '${hash}' WHERE id = '${m.id}'`);
      }
    }

    // Hash StaffUser passwords
    const [staff] = await queryInterface.sequelize.query('SELECT id, password FROM "staff_user" WHERE password IS NOT NULL');
    for (const s of staff) {
      if (!s.password.startsWith('$2a$') && !s.password.startsWith('$2b$')) {
        const hash = await bcrypt.hash(s.password, 10);
        await queryInterface.sequelize.query(`UPDATE "staff_user" SET password = '${hash}' WHERE id = '${s.id}'`);
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log("Cannot revert hashed passwords to plaintext.");
  }
};
