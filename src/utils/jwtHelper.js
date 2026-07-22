const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET or JWT_REFRESH_SECRET is not defined in the environment.");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'; // 1 hour for access token
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'; // 7 days for refresh token

/**
 * Generates an Access Token and a Refresh Token for a given payload
 * @param {Object} payload The user/company data to sign
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });

  return { accessToken, refreshToken };
};

/**
 * Generates a short-lived reset token for password resets
 */
const generateResetToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
};

/**
 * Verifies the Reset Token
 */
const verifyResetToken = (reset_token) => {
  return jwt.verify(reset_token, JWT_SECRET);
};

/**
 * Verifies the Refresh Token
 * @param {string} refresh_token 
 * @returns {Object} decoded payload or throws an error
 */
const verifyRefreshToken = (refresh_token) => {
  return jwt.verify(refresh_token, JWT_REFRESH_SECRET);
};

/**
 * Verifies the Access Token
 * @param {string} access_token 
 * @returns {Object} decoded payload or throws an error
 */
const verifyAccessToken = (access_token) => {
  return jwt.verify(access_token, JWT_SECRET);
};

module.exports = {
  generateTokens,
  generateResetToken,
  verifyResetToken,
  verifyRefreshToken,
  verifyAccessToken
};
