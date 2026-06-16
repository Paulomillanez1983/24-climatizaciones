const crypto = require('crypto');

const COOKIE_NAME = 'admin_session_24';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const HASH_ITERATIONS = 210000;
const HASH_BYTES = 32;
const HASH_DIGEST = 'sha256';

function hasAuthConfig() {
  return Boolean(
    process.env.ADMIN_PASSWORD_HASH &&
    process.env.ADMIN_PASSWORD_SALT &&
    process.env.ADMIN_SESSION_SECRET
  );
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');
  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashPassword(password) {
  return crypto
    .pbkdf2Sync(
      String(password || ''),
      String(process.env.ADMIN_PASSWORD_SALT || ''),
      HASH_ITERATIONS,
      HASH_BYTES,
      HASH_DIGEST
    )
    .toString('hex');
}

function verifyPassword(password) {
  if (!hasAuthConfig() || !String(password || '').trim()) return false;
  return safeEqual(hashPassword(password), process.env.ADMIN_PASSWORD_HASH);
}

function parseCookies(request) {
  const header = String((request.headers && request.headers.cookie) || '');
  return header.split(';').reduce((cookies, entry) => {
    const index = entry.indexOf('=');
    if (index === -1) return cookies;
    const name = entry.slice(0, index).trim();
    const value = entry.slice(index + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function sign(value) {
  return crypto
    .createHmac('sha256', String(process.env.ADMIN_SESSION_SECRET || ''))
    .update(value)
    .digest('base64url');
}

function buildCookie(request, value, maxAgeSeconds) {
  const host = String((request.headers && request.headers.host) || '');
  const secure = host.includes('localhost') || host.startsWith('127.') ? '' : '; Secure';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function createSessionCookie(request) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const nonce = crypto.randomBytes(18).toString('base64url');
  const payload = `${expiresAt}.${nonce}`;
  return {
    cookie: buildCookie(request, `${payload}.${sign(payload)}`, SESSION_MAX_AGE_SECONDS),
    expiresAt
  };
}

function clearSessionCookie(request) {
  return buildCookie(request, '', 0);
}

function verifySession(request) {
  if (!hasAuthConfig()) return false;
  const value = parseCookies(request)[COOKIE_NAME];
  if (!value) return false;
  const parts = String(value).split('.');
  if (parts.length !== 3) return false;
  const [expiresAt, nonce, signature] = parts;
  const expires = Number(expiresAt);
  if (!Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) return false;
  const expected = sign(`${expiresAt}.${nonce}`);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  hasAuthConfig,
  verifyPassword,
  verifySession,
  createSessionCookie,
  clearSessionCookie
};
