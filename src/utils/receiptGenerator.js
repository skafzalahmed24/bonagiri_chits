const { sequelize } = require('../models');

/**
 * Next receipt number for a company, per financial year (April–March):
 * RCT/{FY}/{6-digit sequence}, e.g. RCT/2026-27/000001 (docs/MONEY_FLOW_BATCH2_3.md §2.5).
 *
 * The counter lives in receipt_sequences and is incremented with one upsert inside the
 * caller's transaction. The row stays locked until that transaction ends, so concurrent
 * receipts queue rather than collide, and a rolled-back receipt gives its number back.
 * Receipts issued before this scheme keep their old RCT-YYYY-NNNNNN numbers.
 */
const financialYear = (date = new Date()) => {
  const ist = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const y = ist.getFullYear();
  const start = ist.getMonth() >= 3 ? y : y - 1; // April is month 3
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

const generateReceiptNumber = async (companyId, transaction) => {
  if (!companyId) throw new Error('Receipt number needs the company.');
  if (!transaction) throw new Error('Receipt number must be issued inside a transaction.');
  const finYear = financialYear();
  const [rows] = await sequelize.query(
    `INSERT INTO receipt_sequences (company_id, fin_year, last_number, "createdAt", "updatedAt")
     VALUES (:companyId, :finYear, 1, now(), now())
     ON CONFLICT (company_id, fin_year)
     DO UPDATE SET last_number = receipt_sequences.last_number + 1, "updatedAt" = now()
     RETURNING last_number`,
    { replacements: { companyId, finYear }, transaction }
  );
  return `RCT/${finYear}/${String(rows[0].last_number).padStart(6, '0')}`;
};

module.exports = { generateReceiptNumber, financialYear };
