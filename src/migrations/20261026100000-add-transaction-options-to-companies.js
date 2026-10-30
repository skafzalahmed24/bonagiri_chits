'use strict';

/**
 * transactions-chitcare-parity X4-DB (02-plan.md DB-2, DB-6.1).
 *
 * companies.transaction_options: the per-company "Transaction options (ChitCare)".
 * - JSONB (not JSON) so the write can merge atomically:
 *     SET transaction_options = COALESCE(transaction_options, '{}'::jsonb) || :changed::jsonb
 * - Nullable, no default: NULL or a missing key means "use the default". No backfill.
 * - CHECK: the value is NULL or a JSON object (never an array, string or number).
 * - Which keys and values are allowed is checked in Joi (the registry grows per slice), not here.
 *
 * Additive only: adding a nullable column with no default is a catalogue change (no table rewrite).
 * down drops the column (and its CHECK). After live use, down destroys saved options: copy them out first
 * and get the owner's approval (DB-7 step 5).
 */
const TABLE = 'companies';
const COLUMN = 'transaction_options';
const CHECK = 'companies_transaction_options_is_object';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const info = await queryInterface.describeTable(TABLE, { transaction });
      if (!info[COLUMN]) {
        await queryInterface.addColumn(TABLE, COLUMN, {
          type: Sequelize.JSONB,
          allowNull: true,
          comment: 'Per-company transaction options (ChitCare parity), e.g. {"auction_dates":"CHITCARE"}. NULL or a missing key = default. Keys/values checked in Joi.',
        }, { transaction });
      }
      await queryInterface.sequelize.query(
        `ALTER TABLE "${TABLE}" DROP CONSTRAINT IF EXISTS "${CHECK}";
         ALTER TABLE "${TABLE}" ADD CONSTRAINT "${CHECK}"
           CHECK (${COLUMN} IS NULL OR jsonb_typeof(${COLUMN}) = 'object');`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`ALTER TABLE "${TABLE}" DROP CONSTRAINT IF EXISTS "${CHECK}";`, { transaction });
      const info = await queryInterface.describeTable(TABLE, { transaction });
      if (info[COLUMN]) await queryInterface.removeColumn(TABLE, COLUMN, { transaction });
    });
  },
};
