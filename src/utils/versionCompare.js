/**
 * App version helpers for the force-update check.
 * Versions look like '1.2.3', '1.2', or '1.2.3+45' (a build suffix is ignored).
 */

const VERSION_PATTERN = /^\d+(\.\d+){0,3}$/;

const normalizeVersion = (value) => String(value == null ? '' : value).trim().split(/[+-]/)[0];

const isValidVersion = (value) => VERSION_PATTERN.test(normalizeVersion(value));

/** -1 when a < b, 0 when equal, 1 when a > b. Missing segments count as 0 ('1.2' == '1.2.0'). */
const compareVersions = (a, b) => {
  const pa = normalizeVersion(a).split('.').map(Number);
  const pb = normalizeVersion(b).split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

module.exports = { isValidVersion, compareVersions, normalizeVersion };
