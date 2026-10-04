'use strict';

/**
 * Adds self_chits_as_company_months to chits_groups table.
 * When true/1, all active self-chit seats in an open auction group take a discount-free
 * company prize month with no auction and no dividend to members.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('chits_groups');
    if (!table.self_chits_as_company_months) {
      await queryInterface.addColumn('chits_groups', 'self_chits_as_company_months', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'When true, all self chits in this group take a discount-free company month (no auction, no dividend)',
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('chits_groups');
    if (table.self_chits_as_company_months) {
      await queryInterface.removeColumn('chits_groups', 'self_chits_as_company_months');
    }
  },
};
