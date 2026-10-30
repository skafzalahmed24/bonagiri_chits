'use strict';

/**
 * transactions-chitcare-parity 1b-DB1, migration 2 of 3 (02-plan.md DB-3, DB-4, DB-6.2).
 *
 * Nine nullable columns on customer_payments for the ChitCare-order Member Receipt Entry:
 *   receipt_mode        varchar(12)  CASH | UPI | CHEQUE | DD | RTGS_NEFT | SPLIT (CHECK; NULL = legacy row, derive from payment_mode)
 *   tr_series           varchar(10)  "TR" = the ChitCare TR Series / TR No. / TR Date boxes (names equal the API keys); free text
 *   tr_number           varchar(20)
 *   tr_date             date
 *   cheque_deposit_date date
 *   cheque_bank_name    varchar(100)
 *   cheque_place        varchar(60)
 *   cheque_clearing     varchar(10)  LOCAL | NON_LOCAL (CHECK)
 *   tagged_collection_agent_id int → member(id) ON UPDATE CASCADE ON DELETE RESTRICT
 *       The collection agent an OFFICE receipt is tagged to (request key stays collection_agent_id).
 *       Not "collected by": agent cash, Agent Float, commission and the leaderboard attribute receipts through
 *       collection_agent_amount_id only, and must never sum this column (R1b-7, DB-3).
 *
 * One transaction (PostgreSQL DDL is transactional): a failure leaves nothing half-applied.
 * Additive only: every column is nullable with no default (catalogue change, no rewrite); old rows read NULL; no backfill.
 * The CHECKs and the FK scan the table once (the new columns are empty, so they cannot fail).
 * down drops the nine columns in reverse order (the CHECKs and the FK go with them). After live use, down destroys
 * entered receipt data: copy it out first and get the owner's approval (DB-7 step 5).
 */
const TABLE = 'customer_payments';

const columns = (Sequelize) => [
  ['receipt_mode', { type: Sequelize.STRING(12), allowNull: true, comment: 'Receipt mode picked on the office form: CASH, UPI, CHEQUE, DD, RTGS_NEFT, SPLIT. NULL on old rows (derive from payment_mode).' }],
  ['tr_series', { type: Sequelize.STRING(10), allowNull: true, comment: 'ChitCare "TR Series" box (free text; meaning still open, P-1b-11).' }],
  ['tr_number', { type: Sequelize.STRING(20), allowNull: true, comment: 'ChitCare "TR No." box (free text, not unique).' }],
  ['tr_date', { type: Sequelize.DATEONLY, allowNull: true, comment: 'ChitCare "TR Date" box; not after payment_date (service rule).' }],
  ['cheque_deposit_date', { type: Sequelize.DATEONLY, allowNull: true, comment: 'Date the cheque / D.D. was deposited.' }],
  ['cheque_bank_name', { type: Sequelize.STRING(100), allowNull: true, comment: 'Drawee bank of the cheque / D.D. (free text).' }],
  ['cheque_place', { type: Sequelize.STRING(60), allowNull: true, comment: 'Place / branch of the cheque / D.D.' }],
  ['cheque_clearing', { type: Sequelize.STRING(10), allowNull: true, comment: 'LOCAL or NON_LOCAL clearing.' }],
  ['tagged_collection_agent_id', {
    type: Sequelize.INTEGER,
    allowNull: true,
    references: { model: 'member', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
    comment: 'Collection agent an office receipt is tagged to. NOT the collector: never count it as agent cash/commission (use collection_agent_amount_id).',
  }],
];

const CHECKS = [
  ['customer_payments_receipt_mode_check', "receipt_mode IS NULL OR receipt_mode IN ('CASH','UPI','CHEQUE','DD','RTGS_NEFT','SPLIT')"],
  ['customer_payments_cheque_clearing_check', "cheque_clearing IS NULL OR cheque_clearing IN ('LOCAL','NON_LOCAL')"],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const info = await queryInterface.describeTable(TABLE, { transaction });
      for (const [name, spec] of columns(Sequelize)) {
        if (!info[name]) await queryInterface.addColumn(TABLE, name, spec, { transaction });
      }
      for (const [name, expr] of CHECKS) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${TABLE}" DROP CONSTRAINT IF EXISTS "${name}";
           ALTER TABLE "${TABLE}" ADD CONSTRAINT "${name}" CHECK (${expr});`,
          { transaction }
        );
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [name] of CHECKS) {
        await queryInterface.sequelize.query(`ALTER TABLE "${TABLE}" DROP CONSTRAINT IF EXISTS "${name}";`, { transaction });
      }
      const info = await queryInterface.describeTable(TABLE, { transaction });
      for (const [name] of columns(Sequelize).reverse()) {
        if (info[name]) await queryInterface.removeColumn(TABLE, name, { transaction });
      }
    });
  },
};
