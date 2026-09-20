/**
 * Helpers compartidos para las APIs que guardan colecciones en Vercel Blob.
 *
 * Antes cada endpoint repetia su propio sendJson / readJsonBody / requireAdmin.
 * Centralizarlos evita que las reglas de seguridad se desincronicen entre rutas.
 *
 * Requiere las mismas variables de entorno que el resto del proyecto:
 *   BLOB_READ_WRITE_TOKEN, ADMIN_PASSWORD_HASH, ADMIN_PASSWORD_SALT, ADMIN_SESSION_SECRET
 */

const crypto = require('crypto');
const { put, list } = require('@vercel/blob');
const { hasAuthConfig, verifySession } = require('./admin-auth');

// Limite de registros por coleccion. Un solo objeto JSON alcanza para el volumen
// de un negocio chico. Si algun dia supera esto, mover a base de datos.
const MAX_RECORDS = 500;

function sendJson(response, statusCode, body, maxAge = 0) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', maxAge > 0 ? `s-maxage=${maxAge}, stale-while-revalidate=300` : 'no-store');
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') {
    try {
      return JSON.parse(request.body || '{}');
    } catch (error) {
      return {};
    }
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function sanitizeText(value, limit) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function sanitizePhone(value) {
  const raw = String(value || '').trim();
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '').slice(0, 15);
  return digits ? (hasPlus ? `+${digits}` : digits) : '';
}

// Clave canonica para comparar telefonos. El mismo numero escrito como
// "351 555 1234", "0351 555-1234" o "+54 9 351 555 1234" tiene que dar igual,
// si no la misma persona se guarda dos veces.
function phoneKey(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('54') && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith('9') && digits.length >= 10) digits = digits.slice(1);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

function sanitizeList(value, limit, itemLimit) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const clean = sanitizeText(item, itemLimit);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function hasStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function requireAdmin(request, response) {
  if (!hasAuthConfig()) {
    sendJson(response, 503, { error: 'admin_auth_missing' });
    return false;
  }
  if (!verifySession(request)) {
    sendJson(response, 401, { error: 'unauthorized' });
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Almacenamiento
 * ------------------------------------------------------------------ */

async function readJsonBlob(path) {
  if (!hasStorage()) return null;
  const result = await list({ prefix: path, limit: 1 });
  const meta = (result.blobs || []).find((blob) => blob.pathname === path);
  if (!meta || !meta.url) return null;
  const response = await fetch(meta.url, { cache: 'no-store' });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function writeJsonBlob(path, payload) {
  await put(path, JSON.stringify(payload, null, 2), {
    access: 'public',
    contentType: 'application/json; charset=utf-8',
    allowOverwrite: true
  });
}

async function readCollection(path) {
  const payload = await readJsonBlob(path);
  return payload && Array.isArray(payload.items) ? payload.items : [];
}

async function writeCollection(path, items) {
  const trimmed = items.slice(-MAX_RECORDS);
  await writeJsonBlob(path, { updatedAt: new Date().toISOString(), items: trimmed });
  return trimmed;
}

/* ------------------------------------------------------------------ *
 * Identificadores
 * ------------------------------------------------------------------ */

function makeId(prefix) {
  const now = new Date();
  const stamp = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('');
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}

// Clave publica de seguimiento: se guarda hasheada, nunca en claro.
function makePublicKey() {
  return crypto.randomBytes(18).toString('base64url');
}

function hashPublicKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

function safeEqualHex(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

module.exports = {
  MAX_RECORDS,
  sendJson,
  readJsonBody,
  sanitizeText,
  sanitizePhone,
  phoneKey,
  sanitizeList,
  hasStorage,
  requireAdmin,
  readJsonBlob,
  writeJsonBlob,
  readCollection,
  writeCollection,
  makeId,
  makePublicKey,
  hashPublicKey,
  safeEqualHex,
  normalize
};
