'use strict';

/**
 * Which rows of the sent-notification history a caller may read (bug 2026-11-03, review CR-7, owner decision).
 * 'manual' = only sends typed in the Push Notifications screen. 'all' also lists the automatic notifications, whose text
 * carries payment amounts and receipt numbers of members. Only the company admin token may ask for 'all'; a staff user who
 * holds just the Notifications permission is always held to 'manual' (receipt data stays behind the Receipts permission).
 * No dependencies, so a test can require it directly.
 */
const effectiveSentSource = (userPayload, requested) => {
  if (userPayload && userPayload.role === 'company' && requested === 'all') return 'all';
  return 'manual';
};

module.exports = { effectiveSentSource };
