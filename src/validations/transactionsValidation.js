'use strict';
// Validators for the Transactions ChitCare-parity program (lane L-BE). Kept in their own file so the
// shared adminValidation.js only gets one-line additions. Everything here is additive: new optional
// keys, or whole schemas for new routes. Old callers that do not send the new keys are not affected.
const Joi = require('joi');

const pad2 = (n) => String(n).padStart(2, '0');

/** A real calendar date as 'yyyy-mm-dd' (Postgres would reject 2026-02-31 with a 500). '' and null mean "not sent". */
const dateOnly = () => Joi.string().allow('', null).optional().custom((value, helpers) => {
  if (value === '' || value === null) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return helpers.message('{{#label}} must be a date as yyyy-mm-dd');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || pad2(d.getUTCMonth() + 1) !== m[2] || pad2(d.getUTCDate()) !== m[3]) {
    return helpers.message('{{#label}} must be a real date');
  }
  return value;
});

const sent = (v) => v !== undefined && v !== null && v !== '';

/**
 * Object-level rule for a list route that gained optional keys (AR-15, L24):
 *  - date_from must not be after date_to;
 *  - `max` is capped at `cap` ONLY when one of the new keys is sent (old callers keep no ceiling).
 */
const newListKeysRule = (newKeys, cap) => (value, helpers) => {
  if (sent(value.date_from) && sent(value.date_to) && value.date_from > value.date_to) {
    return helpers.message('date_from must not be after date_to');
  }
  if (newKeys.some((k) => sent(value[k])) && Number(value.max) > cap) {
    return helpers.message(`max can be at most ${cap} when date_from, date_to or sort is sent`);
  }
  return value;
};

/** Receipt From / To only make sense with a series, and From must not exceed To (spec 4 R4-11). */
const receiptNumberRule = (value, helpers) => {
  const hasFrom = sent(value.receipt_from);
  const hasTo = sent(value.receipt_to);
  const hasSeries = sent(value.receipt_series) && String(value.receipt_series).trim() !== '';
  if ((hasFrom || hasTo) && !hasSeries) return helpers.message('Enter a receipt series to filter by number.');
  if (hasFrom && hasTo && Number(value.receipt_from) > Number(value.receipt_to)) {
    return helpers.message('Receipt From must not be more than Receipt To.');
  }
  return value;
};

const sortDirection = () => Joi.string().lowercase().valid('asc', 'desc').allow('', null).optional();

module.exports = { dateOnly, sortDirection, newListKeysRule, receiptNumberRule, sent };
