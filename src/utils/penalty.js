/**
 * Penalty and date-only helpers shared by the penalty scheduler, instalment
 * generation and the late-join preview, so all three agree on the rate and on
 * what "a day overdue" means.
 *
 * Dates are handled as 'YYYY-MM-DD' strings and counted with Date.UTC, never with
 * local midnights: mixing local time with toISOString() shifts dates by a day in IST.
 */

/**
 * One day's penalty on an overdue instalment, in rupees (rounded to the paisa).
 * The group's rate — penality_for_nps, or penality_for_ps once the ticket has won —
 * is a percentage of the instalment amount per day (owner decision P1, 27 Sep 2026).
 * A blank or zero rate means no penalty.
 */
const penaltyPercentFor = (group, isPrized) => (isPrized
  ? (parseFloat(group.penality_for_ps) || 0)
  : (parseFloat(group.penality_for_nps) || 0));

const dailyPenaltyFor = (group, isPrized, dueAmount) =>
  Math.round((parseFloat(dueAmount) || 0) * penaltyPercentFor(group, isPrized)) / 100;

/** Any date value (DATEONLY string, timestamp string or Date) → 'YYYY-MM-DD'. */
const toDateStr = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const toUTC = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole days from a to b ('YYYY-MM-DD'); negative when b is earlier. */
const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);

/** 'YYYY-MM-DD' plus n days. */
const addDays = (dateStr, n) => new Date(toUTC(dateStr) + n * 86400000).toISOString().slice(0, 10);

module.exports = { dailyPenaltyFor, penaltyPercentFor, toDateStr, daysBetween, addDays };
