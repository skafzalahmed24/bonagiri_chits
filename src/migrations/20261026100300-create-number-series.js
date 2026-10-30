'use strict';

/**
 * transactions-chitcare-parity spec 4 B1: voucher / receipt number SERIES per company, document type and financial year
 * (Utilities › Transaction Vouchers). New table only; no existing row or number is touched.
 *
 * Shape: one row per (company, doc_type, fin_year, series). Exactly one row per (company, doc_type, fin_year) is ACTIVE
 * (partial unique index): that is the series new documents of that type and year get. When the admin changes the series,
 * the old row is set is_active = false and kept, so switching back continues after its last number (R4-5), and a series
 * text can never be reused by another type or year (unique per company, case-insensitive).
 *   last_number = the last number issued in that series (0 = none yet). Next Number shown on the screen = last_number + 1.
 *
 * Issuing (4-BE, inside the document's own transaction; atomic like receipt_sequences):
 *   1. INSERT ... ON CONFLICT (company_id, doc_type, fin_year) WHERE is_active DO NOTHING   -- first use: seed row
 *   2. UPDATE number_series SET last_number = last_number + 1, "updatedAt" = now()
 *        WHERE company_id = :c AND doc_type = :t AND fin_year = :fy AND is_active RETURNING series, last_number
 *   The UPDATE row lock is held until the document commits, so concurrent saves queue; a rolled-back save gives its
 *   number back; a cancelled document keeps its number (the counter never goes down).
 *
 * Existing numbers never change, and nothing collides: this migration writes NO rows. The table starts empty and a row
 * is seeded on first use (step 1) with last_number = the highest number already issued in that default series, computed
 * at that moment inside the issuing transaction (seeding here would go stale while old code keeps issuing until the new
 * code is deployed). seeded_last_number keeps that starting value for audit. Seeds per type (R4-4):
 *   MEMBER_RECEIPT  RCT/<FY>   GREATEST(receipt_sequences.last_number for (company, FY),
 *                              highest "RCT/<FY>/nnnnnn" in customer_payments of the company, scoped through
 *                              chits_installments → enrollments.company_id). receipt_sequences is kept (not dropped).
 *   BID_PAYMENT     BP/<FY>    highest "BP/<FY>/nnnn" in prize_payments (paranoid: false) of the company
 *   BID_ADVANCE     BA/<FY>    highest "BA/<FY>/nnnn" likewise
 *   OPENING_PAID    OP/<FY>    highest "OP/<FY>/nnnn" likewise
 *   CASH_RECEIPT    CR/<FY>    accounting_vouchers type CR: old year-less "CR-nnnn" numbers continue in the FY of the newest
 *   CASH_PAYMENT    CP/<FY>    old-format voucher of that type (seed = highest old number); every other FY seeds from
 *   BANK_DEPOSIT    BD/<FY>    "CR/<FY>/nnnn" etc. (0 if none). BANK_PAYMENT's old code is BP-nnnn (voucher_type BP), its
 *   BANK_PAYMENT    BPV/<FY>   new default series is BPV/<FY> (P-4-3), so it never meets Bid Payments' BP/<FY>.
 *
 * Integrity in the DB: CHECKs on doc_type (fixed list; a new type, e.g. JOURNAL_VOUCHER in phase 6, is a small
 * migration that drops and re-adds the CHECK), fin_year format, series format (R4-5: letters, digits, "/" and "-",
 * not ending in "/" or "-", max 20), last_number >= 0. FK company → companies ON DELETE CASCADE (settings, like
 * payment_accounts). down drops the table: after live use that loses the saved series settings and counters (copy out
 * first, owner approval, DB-7 step 5); the documents and their numbers are not affected.
 */
const TABLE = 'number_series';
const DOC_TYPES = ['MEMBER_RECEIPT', 'BID_PAYMENT', 'BID_ADVANCE', 'OPENING_PAID', 'CASH_RECEIPT', 'CASH_PAYMENT', 'BANK_DEPOSIT', 'BANK_PAYMENT'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tables = (await queryInterface.showAllTables({ transaction })).map((t) => (typeof t === 'string' ? t : t.tableName));
      if (tables.includes(TABLE)) return;

      await queryInterface.createTable(TABLE, {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        company_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'companies', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        doc_type: { type: Sequelize.STRING(20), allowNull: false, comment: `One of ${DOC_TYPES.join(', ')}` },
        fin_year: { type: Sequelize.STRING(7), allowNull: false, comment: "Financial year April–March, '2026-27' (as receipt_sequences)" },
        series: { type: Sequelize.STRING(20), allowNull: false, comment: 'Prefix before the number, e.g. RCT/2026-27 or CR-26; number = series + "/" + padded last_number' },
        last_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0, comment: 'Last number issued in this series (0 = none yet); Next Number = last_number + 1' },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true, comment: 'The one series in use for (company, doc_type, fin_year); older series are kept inactive' },
        seeded_last_number: { type: Sequelize.INTEGER, allowNull: true, comment: 'Highest legacy number found when the issuing code created this row (R4-4); NULL when created on the settings screen' },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      }, { transaction });

      const list = DOC_TYPES.map((t) => `'${t}'`).join(',');
      await queryInterface.sequelize.query(
        `ALTER TABLE ${TABLE}
           ADD CONSTRAINT number_series_doc_type_check CHECK (doc_type IN (${list})),
           ADD CONSTRAINT number_series_fin_year_check CHECK (fin_year ~ '^[0-9]{4}-[0-9]{2}$'),
           ADD CONSTRAINT number_series_series_check CHECK (series ~ '^[A-Za-z0-9/-]*[A-Za-z0-9]$'),
           ADD CONSTRAINT number_series_last_number_check CHECK (last_number >= 0);
         CREATE UNIQUE INDEX number_series_one_active ON ${TABLE} (company_id, doc_type, fin_year) WHERE is_active;
         CREATE UNIQUE INDEX number_series_company_series ON ${TABLE} (company_id, lower(series));
         COMMENT ON TABLE ${TABLE} IS 'Document number series per company, document type and financial year (Transaction Vouchers). Rows are seeded on first use; see migration 20261026100300.';`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS ${TABLE};`);
  },
};
