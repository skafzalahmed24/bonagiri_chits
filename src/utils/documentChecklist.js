/**
 * The document checklist collected in the field, and the review states used for sureties.
 *
 * The list is the same one the collection agent sees for members
 * (userService.getMemberDocumentsService / adminService.getMemberDocumentsAdminService keep
 * their own copy; keep these in step if the client changes the list).
 *
 * Surety document states are separate from member documents on purpose: there, 1 means
 * "submitted" to the agent app but "verified" to the office panel.
 */
const DOCUMENT_TYPES = [
  { key: 'aadhar', title: 'Aadhaar Card _ (Both sides)' },
  { key: 'pan_card', title: 'PAN Card' },
  { key: 'bank_statement', title: 'Bank Statement' },
  { key: 'photos', title: "Photo's" },
  { key: 'bond_paper_100', title: '100 ruppees Bond Paper' },
  { key: 'pay_slips', title: 'Pay Slips' },
  { key: 'id_cards', title: 'ID Cards (Employee Card)' },
  { key: 'property_documents', title: 'Property Dcoments Zerox' },
  { key: 'cheques', title: "Cheque's" },
];
const DOCUMENT_KEYS = DOCUMENT_TYPES.map((d) => d.key);

const DOC_STATUS = { NOT_SUBMITTED: 0, SUBMITTED: 1, REJECTED: 2, VERIFIED: 3 };

/** Stored JSON → the full checklist, one entry per document type, in display order. */
const checklist = (documents) => {
  const stored = documents && typeof documents === 'object' ? documents : {};
  return DOCUMENT_TYPES.map((d) => {
    const s = stored[d.key] || {};
    return {
      document_type: d.key,
      document_title: d.title,
      status: Number.isInteger(s.status) ? s.status : DOC_STATUS.NOT_SUBMITTED,
      rejection_reason: s.rejection_reason || null,
      updated_at: s.updated_at || null,
    };
  });
};

/**
 * Counts plus one overall state for a checklist:
 *   not_started    — nothing submitted
 *   pending_review — something submitted and waiting for the office
 *   rejected       — the office rejected at least one document
 *   verified       — every submitted document is verified (and at least one is)
 */
const checklistSummary = (items) => {
  const count = (st) => items.filter((i) => i.status === st).length;
  const submitted = count(DOC_STATUS.SUBMITTED);
  const rejected = count(DOC_STATUS.REJECTED);
  const verified = count(DOC_STATUS.VERIFIED);
  let review_status = 'not_started';
  if (rejected > 0) review_status = 'rejected';
  else if (submitted > 0) review_status = 'pending_review';
  else if (verified > 0) review_status = 'verified';
  return {
    total: items.length,
    submitted_count: submitted + verified, // handed over, whether or not reviewed yet
    awaiting_review_count: submitted,
    verified_count: verified,
    rejected_count: rejected,
    review_status,
  };
};

module.exports = { DOCUMENT_TYPES, DOCUMENT_KEYS, DOC_STATUS, checklist, checklistSummary };
