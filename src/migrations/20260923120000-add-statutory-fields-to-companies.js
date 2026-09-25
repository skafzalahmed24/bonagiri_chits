'use strict';

// Fields the statutory registrar forms need (Form I, II, VII, XI and the
// Annexure). The old system keeps these in Company Setup and types the rest
// per print; see docs/STATUTORY_FORM_TEMPLATES.md.
const COLUMNS = {
  foreman_name: { type: 'STRING', comment: 'Authorised foreman who signs the registrar forms' },
  foreman_father_name: { type: 'STRING', comment: 'Form I: "I, <name> Son of <father>"' },
  foreman_address: { type: 'TEXT', comment: "Foreman's residential address, printed on Form I" },
  cin: { type: 'STRING', comment: 'Corporate Identity Number' },
  place: { type: 'STRING', comment: 'Place printed on filings, e.g. the head office city' },
  registrar_office_address: { type: 'TEXT', comment: 'Office of the Registrar of Chits the forms are addressed to' },
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('companies');
    for (const [name, spec] of Object.entries(COLUMNS)) {
      if (table[name]) continue; // idempotent: this table has been patched by hand before
      await queryInterface.addColumn('companies', name, {
        type: Sequelize[spec.type],
        allowNull: true,
        comment: spec.comment,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('companies');
    for (const name of Object.keys(COLUMNS)) {
      if (table[name]) await queryInterface.removeColumn('companies', name);
    }
  },
};
