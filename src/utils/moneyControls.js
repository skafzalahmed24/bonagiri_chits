/**
 * The three controls every money entry follows (docs/MONEY_FLOW_BATCH2_3.md §2.1–2.3):
 * only the company admin edits or cancels; nothing older than Transaction Lock Days
 * changes except by the admin with a written reason; and who did it is recorded.
 */
const DEFAULT_LOCK_DAYS = 3;

class MoneyRuleError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // 'ADMIN_ONLY' | 'LOCKED' | 'LOCK_OVERRIDE_REQUIRED' | 'REASON_REQUIRED'
  }
}

const isCompanyAdmin = (user) => user?.role === 'company';

/** Staff may add and view; editing or cancelling a money entry is for the company admin. */
const assertAdmin = (user, what = 'change this entry') => {
  if (!isCompanyAdmin(user)) throw new MoneyRuleError(`Only the company admin can ${what}.`, 'ADMIN_ONLY');
};

const assertReason = (reason, label = 'a reason') => {
  const r = String(reason || '').trim();
  if (r.length < 3) throw new MoneyRuleError(`Give ${label} (at least 3 characters).`, 'REASON_REQUIRED');
  return r;
};

/** The user's display name: company name, or staff first + last name. */
const actorName = async (user) => {
  const { Company, StaffUser } = require('../models');
  if (!user) return null;
  if (user.role === 'company') return (await Company.findByPk(user.id, { attributes: ['company_name'] }))?.company_name || 'Company Admin';
  const s = await StaffUser.findByPk(user.id, { attributes: ['first_name', 'last_name'] }).catch(() => null);
  return s ? [s.first_name, s.last_name].filter(Boolean).join(' ') : 'Staff';
};

const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const ddmmyyyy = (ymd) => ymd.split('-').reverse().join('/');

/** Lock Days for a company: empty means the default (3), 0 means no lock. */
const lockDaysFor = async (companyId, transaction) => {
  const { Company } = require('../models');
  const c = await Company.findByPk(companyId, { attributes: ['transaction_lock_days'], transaction });
  const v = c?.transaction_lock_days;
  return v === null || v === undefined || v === '' ? DEFAULT_LOCK_DAYS : Math.max(0, parseInt(v, 10) || 0);
};

/**
 * Refuses changes to entries dated before today − Lock Days. `dates` are every date the
 * change touches (the old date and the new one on an edit). Staff are refused; the
 * admin needs `overrideReason`, recorded in money_lock_overrides.
 */
const enforceLock = async ({ companyId, user, entity, entityId = null, action, dates, overrideReason, transaction }) => {
  const days = await lockDaysFor(companyId, transaction);
  if (days === 0) return;
  const cutoff = addDays(todayIST(), -days);
  // Dates arrive as 'YYYY-MM-DD' strings or as Date objects (Joi.date() converts them); read both in IST.
  const asYmd = (d) => (d instanceof Date ? d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : String(d).slice(0, 10));
  const locked = (dates || []).filter(Boolean).map(asYmd).filter((d) => d < cutoff);
  if (!locked.length) return;
  const oldest = locked.sort()[0];
  if (!isCompanyAdmin(user)) {
    throw new MoneyRuleError(`Entries dated before ${ddmmyyyy(cutoff)} are locked (Transaction Lock Days: ${days}). Ask the company admin.`, 'LOCKED');
  }
  if (String(overrideReason || '').trim().length < 3) {
    throw new MoneyRuleError(`This entry is dated ${ddmmyyyy(oldest)}, older than the ${days}-day lock. Give an override reason to continue.`, 'LOCK_OVERRIDE_REQUIRED');
  }
  const { MoneyLockOverride } = require('../models');
  await MoneyLockOverride.create({
    company_id: companyId,
    entity,
    entity_id: entityId != null ? String(entityId) : null,
    action,
    entry_date: oldest,
    reason: String(overrideReason).trim(),
    user_id: user ? String(user.id) : null,
    user_name: await actorName(user),
  }, { transaction });
};

module.exports = { MoneyRuleError, isCompanyAdmin, assertAdmin, assertReason, actorName, enforceLock, lockDaysFor, todayIST, DEFAULT_LOCK_DAYS };
