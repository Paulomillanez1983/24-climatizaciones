const crypto = require('crypto');
const { put, list, del } = require('@vercel/blob');

const META_PATH = 'admin/gallery.json';
const IMAGE_PREFIX = 'admin/gallery/';
const MAX_IMAGE_BYTES = 1400 * 1024;
const MAX_ITEMS = 80;

function sendJson(response, statusCode, body, maxAge = 0) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', maxAge > 0 ? `s-maxage=${maxAge}, stale-while-revalidate=300` : 'no-store');
  response.end(JSON.stringify(body));
}

function hasStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function isAdmin(request) {
  const token = process.env.ADMIN_TOKEN;
  const header = request.headers['x-admin-token'] || request.headers['authorization'] || '';
  const value = String(header).replace(/^Bearer\s+/i, '').trim();
  if (!token || !value || value.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(token));
}

function requireAdmin(request, response) {
  if (!process.env.ADMIN_TOKEN) {
    sendJson(response, 503, { error: 'admin_token_missing' });
    return false;
  }
  if (!isAdmin(request)) {
    sendJson(response, 401, { error: 'unauthorized' });
    return false;
  }
  return true;
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sanitizeText(value, limit) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function sanitizeItem(item, index = 0) {
  const id = sanitizeText(item.id, 80) || crypto.randomUUID();
  return {
    id,
    title: sanitizeText(item.title, 84) || 'Trabajo real',
    category: sanitizeText(item.category, 34) || 'Trabajo real',
    description: sanitizeText(item.description, 180),
    imageUrl: sanitizeText(item.imageUrl, 700),
    pathname: sanitizeText(item.pathname, 240),
    active: item.active !== false,
    featured: Boolean(item.featured),
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    createdAt: sanitizeText(item.createdAt, 40) || new Date().toISOString(),
    updatedAt: sanitizeText(item.updatedAt, 40) || new Date().toISOString()
  };
}

async function readGallery() {
  if (!hasStorage()) return [];
  const result = await list({ prefix: META_PATH, limit: 1 });
  const meta = (result.blobs || []).find((blob) => blob.pathname === META_PATH);
  if (!meta || !meta.url) return [];
  const response = await fetch(meta.url, { cache: 'no-store' });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload.items) ? payload.items.map(sanitizeItem).sort(sortItems) : [];
}

async function writeGallery(items) {
  const cleaned = items.slice(0, MAX_ITEMS).map(sanitizeItem).sort(sortItems);
  await put(META_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), items: cleaned }, null, 2), {
    access: 'public',
    contentType: 'application/json; charset=utf-8',
    allowOverwrite: true
  });
  return cleaned;
}

function sortItems(a, b) {
  if (Number(a.order) !== Number(b.order)) return Number(a.order) - Number(b.order);
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

function publicItems(items) {
  return items
    .filter((item) => item.active && item.imageUrl)
    .sort(sortItems)
    .slice(0, 12)
    .map(({ id, title, category, description, imageUrl, featured, order }) => ({
      id,
      title,
      category,
      description,
      imageUrl,
      featured,
      order
    }));
}

function parseImageData(image) {
  const dataUrl = String((image && image.dataUrl) || '');
  const match = dataUrl.match(/^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  return buffer;
}

async function createItem(body, items) {
  const imageBuffer = parseImageData(body.image);
  if (!imageBuffer) {
    return { status: 400, body: { error: 'invalid_image' } };
  }

  const id = crypto.randomUUID();
  const pathname = `${IMAGE_PREFIX}${id}.webp`;
  const blob = await put(pathname, imageBuffer, {
    access: 'public',
    contentType: 'image/webp',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60 * 60 * 24 * 30
  });

  const item = sanitizeItem({
    id,
    title: body.title,
    category: body.category,
    description: body.description,
    imageUrl: blob.url,
    pathname: blob.pathname || pathname,
    active: body.active !== false,
    featured: Boolean(body.featured),
    order: Number.isFinite(Number(body.order)) ? Number(body.order) : items.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, items.length);

  let nextItems = items;
  if (item.featured) {
    nextItems = nextItems.map((current) => ({ ...current, featured: false }));
  }
  nextItems = await writeGallery([...nextItems, item]);
  return { status: 201, body: { ok: true, item, items: nextItems } };
}

async function updateItems(body, items) {
  if (!Array.isArray(body.items)) {
    return { status: 400, body: { error: 'invalid_items' } };
  }
  const updates = new Map(body.items.map((item) => [String(item.id), item]));
  let featuredSeen = false;
  const nextItems = items.map((item, index) => {
    const update = updates.get(String(item.id));
    if (!update) return item;
    const next = sanitizeItem({ ...item, ...update, updatedAt: new Date().toISOString() }, index);
    if (next.featured && !featuredSeen) {
      featuredSeen = true;
      return next;
    }
    if (next.featured && featuredSeen) {
      return { ...next, featured: false };
    }
    return next;
  }).map((item) => (featuredSeen && item.featured && !updates.has(String(item.id)) ? { ...item, featured: false } : item));

  const saved = await writeGallery(nextItems);
  return { status: 200, body: { ok: true, items: saved } };
}

async function deleteItem(body, items) {
  const id = sanitizeText(body.id, 80);
  if (!id) return { status: 400, body: { error: 'missing_id' } };
  const item = items.find((current) => current.id === id);
  const nextItems = items.filter((current) => current.id !== id);
  if (item && item.pathname) {
    await del(item.pathname).catch(() => null);
  }
  const saved = await writeGallery(nextItems);
  return { status: 200, body: { ok: true, items: saved } };
}

module.exports = async function adminGallery(request, response) {
  if (!hasStorage()) {
    sendJson(response, request.method === 'GET' ? 200 : 503, {
      configured: false,
      error: 'blob_token_missing',
      items: []
    }, request.method === 'GET' ? 60 : 0);
    return;
  }

  try {
    if (request.method === 'GET') {
      const adminView = String(request.url || '').includes('admin=1');
      if (adminView && !requireAdmin(request, response)) return;
      const items = await readGallery();
      sendJson(response, 200, {
        configured: true,
        admin: adminView,
        items: adminView ? items : publicItems(items)
      }, adminView ? 0 : 60);
      return;
    }

    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) {
      response.setHeader('Allow', 'GET, POST, PATCH, DELETE');
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }

    if (!requireAdmin(request, response)) return;
    const items = await readGallery();
    const body = await readJsonBody(request);
    const result = request.method === 'POST'
      ? await createItem(body, items)
      : request.method === 'PATCH'
        ? await updateItems(body, items)
        : await deleteItem(body, items);
    sendJson(response, result.status, { configured: true, ...result.body });
  } catch (error) {
    sendJson(response, 500, { configured: true, error: 'gallery_request_failed' });
  }
};
