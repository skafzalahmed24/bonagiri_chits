'use strict';

/**
 * transactions-chitcare-parity 1b-DB1, migration 3 of 3 (02-plan.md DB-5, DB-6.3).
 *
 * 1. customer_payments_cheque_number_norm: functional, partial index for the duplicate cheque / D.D. check.
 *    The query MUST repeat the expression exactly to use it:
 *      lower(btrim(cp.cheque_number)) = lower(btrim(:number)) AND cp.cheque_number IS NOT NULL
 *    No company column exists on customer_payments; a cheque number is highly selective, so the few matching rows
 *    are then scoped through chits_installments → enrollments.company_id (DB-1). No payment_status in the predicate
 *    (the status changes on cancel).
 * 2. customer_payments_tagged_collection_agent_id: partial index for include_office_tagged lists and for the
 *    RESTRICT check when a member row is deleted.
 *
 * Raw SQL with IF NOT EXISTS / IF EXISTS (addIndex with an expression is awkward in Sequelize v6).
 * Live: below ~1M rows a plain CREATE INDEX locks writes for seconds; above that, ask db-architect for a
 * CONCURRENTLY variant run outside a transaction (DB-7 step 3). down drops only these two indexes.
 */
const INDEXES = [
  ['customer_payments_cheque_number_norm',
    'ON customer_payments (lower(btrim(cheque_number))) WHERE cheque_number IS NOT NULL'],
  ['customer_payments_tagged_collection_agent_id',
    'ON customer_payments (tagged_collection_agent_id) WHERE tagged_collection_agent_id IS NOT NULL'],
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [name, def] of INDEXES) {
        await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "${name}" ${def};`, { transaction });
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [name] of INDEXES) {
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${name}";`, { transaction });
      }
    });
  },
};
