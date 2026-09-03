/**
 * Normalizes platform_type values across the backend:
 * 1 | '1' | 'android' -> 'android'
 * 2 | '2' | 'ios'     -> 'ios'
 * 3 | '3' | 'web'     -> 'web'
 * other -> 'other' or sanitized string / null
 */
const normalizePlatformType = (platform) => {
  if (platform === null || platform === undefined || platform === '') return null;
  const p = String(platform).toLowerCase().trim();
  if (p === '1' || p === 'android') return 'android';
  if (p === '2' || p === 'ios') return 'ios';
  if (p === '3' || p === 'web') return 'web';
  return p;
};

module.exports = {
  normalizePlatformType
};
