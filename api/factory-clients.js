const crypto = require('crypto');
const { put, list } = require('@vercel/blob');
const { hasAuthConfig, verifySession } = require('../lib/admin-auth');

const META_PATH = 'admin/factory-clients.json';
const MAX_CLIENTS = 140;

const STATUS = {
  lead: 'Nuevo contacto',
  brief: 'Datos recibidos',
  design: 'Web en armado',
  review: 'Lista para revisar',
  published: 'Publicada',
  handoff: 'Entregada',
  paused: 'Pausada'
};

const CHECKS = {
  brief: 'Datos del negocio',
  assets: 'Logo e imagenes',
  copy: 'Textos principales',
  prototype: 'Vista previa',
  publish: 'Web publicada',
  analytics: 'Metricas conectadas',
  handoff: 'Entrega final'
};

function sendJson(response, statusCode, body, maxAge = 0) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', maxAge > 0 ? `s-maxage=${maxAge}, stale-while-revalidate=120` : 'no-store');
  response.end(JSON.stringify(body));
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

async function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function cleanText(value, limit = 160) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function cleanMultiline(value, limit = 1200) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, limit);
}

function slugify(value) {
  return cleanText(value, 90)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80) || 'cliente-web';
}

function cleanUrl(value) {
  const text = cleanText(value, 600);
  if (!text) return '';
  try {
    const parsed = new URL(text.startsWith('http') ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch (error) {
    return '';
  }
}

function defaultChecklist() {
  return Object.fromEntries(Object.keys(CHECKS).map((key) => [key, false]));
}

function cleanChecklist(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.keys(CHECKS).map((key) => [key, Boolean(source[key])]));
}

function sanitizeClient(value, index = 0) {
  const now = new Date().toISOString();
  const businessName = cleanText(value.businessName || value.name, 100) || 'Cliente web';
  const createdAt = cleanText(value.createdAt, 40) || now;
  return {
    id: cleanText(value.id, 80) || crypto.randomUUID(),
    businessName,
    clientName: cleanText(value.clientName, 100) || businessName,
    slug: slugify(value.slug || businessName),
    status: STATUS[value.status] ? value.status : 'brief',
    plan: cleanText(value.plan, 80) || 'Landing comercial',
    contactName: cleanText(value.contactName, 100),
    whatsapp: cleanText(value.whatsapp, 48),
    email: cleanText(value.email, 140),
    domain: cleanUrl(value.domain),
    projectUrl: cleanUrl(value.projectUrl || value.domain),
    repoUrl: cleanUrl(value.repoUrl || value.githubUrl),
    vercelUrl: cleanUrl(value.vercelUrl),
    dashboardUrl: cleanUrl(value.dashboardUrl || value.lookerUrl),
    analyticsUrl: cleanUrl(value.analyticsUrl),
    clarityUrl: cleanUrl(value.clarityUrl),
    searchConsoleUrl: cleanUrl(value.searchConsoleUrl),
    notes: cleanMultiline(value.notes, 1200),
    publicNote: cleanText(value.publicNote, 240),
    checklist: cleanChecklist(value.checklist),
    order: Number.isFinite(Number(value.order)) ? Number(value.order) : index,
    createdAt,
    updatedAt: cleanText(value.updatedAt, 40) || now
  };
}

function sortClients(a, b) {
  if (a.status !== b.status && a.status === 'handoff') return 1;
  if (a.status !== b.status && b.status === 'handoff') return -1;
  return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
}

async function readClients() {
  if (!hasStorage()) return [];
  const result = await list({ prefix: META_PATH, limit: 1 });
  const meta = (result.blobs || []).find((blob) => blob.pathname === META_PATH);
  if (!meta || !meta.url) return [];
  const response = await fetch(meta.url, { cache: 'no-store' });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload.clients) ? payload.clients.map(sanitizeClient).sort(sortClients) : [];
}

async function writeClients(clients) {
  const cleaned = clients.slice(0, MAX_CLIENTS).map(sanitizeClient).sort(sortClients);
  await put(META_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), clients: cleaned }, null, 2), {
    access: 'public',
    contentType: 'application/json; charset=utf-8',
    allowOverwrite: true
  });
  return cleaned;
}

function portalSecret() {
  return String(process.env.PORTAL_LINK_SECRET || process.env.ADMIN_SESSION_SECRET || '');
}

function portalKey(client) {
  const secret = portalSecret();
  if (!secret) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(`${client.id}.${client.slug}.${client.createdAt}`)
    .digest('base64url');
}

function originFromRequest(request) {
  const protocol = request.headers['x-forwarded-proto'] || 'https';
  const host = request.headers['x-forwarded-host'] || request.headers.host || '24-climatizaciones.vercel.app';
  return `${protocol}://${host}`;
}

function withPortalUrl(request, client) {
  const key = portalKey(client);
  const origin = originFromRequest(request);
  return {
    ...client,
    statusLabel: STATUS[client.status] || STATUS.brief,
    portalUrl: key ? `${origin}/portal/?id=${encodeURIComponent(client.id)}&key=${encodeURIComponent(key)}` : ''
  };
}

function portalView(client) {
  const checklist = Object.entries(CHECKS).map(([key, label]) => ({
    key,
    label,
    done: Boolean(client.checklist[key])
  }));
  const completed = checklist.filter((item) => item.done).length;
  const links = [
    client.projectUrl ? { label: 'Abrir web', url: client.projectUrl, primary: true } : null,
    client.dashboardUrl ? { label: 'Metricas', url: client.dashboardUrl } : null,
    client.vercelUrl ? { label: 'Deploy', url: client.vercelUrl } : null
  ].filter(Boolean);
  return {
    id: client.id,
    businessName: client.businessName,
    clientName: client.clientName,
    status: client.status,
    statusLabel: STATUS[client.status] || STATUS.brief,
    plan: client.plan,
    publicNote: client.publicNote,
    checklist,
    completed,
    total: checklist.length,
    progress: Math.round((completed / checklist.length) * 100),
    links,
    updatedAt: client.updatedAt,
    supportWhatsapp: process.env.PUBLIC_SUPPORT_WHATSAPP || '+5493513266650'
  };
}

function mergeClient(current, update) {
  return sanitizeClient({
    ...current,
    ...update,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  });
}

async function handlePortal(request, response) {
  const url = new URL(request.url, originFromRequest(request));
  const id = cleanText(url.searchParams.get('id'), 80);
  const key = cleanText(url.searchParams.get('key'), 140);
  if (!id || !key || !portalSecret()) {
    sendJson(response, 401, { error: 'invalid_portal_link' });
    return;
  }
  const clients = await readClients();
  const client = clients.find((item) => item.id === id);
  if (!client || key !== portalKey(client)) {
    sendJson(response, 404, { error: 'portal_not_found' });
    return;
  }
  sendJson(response, 200, { ok: true, client: portalView(client) }, 60);
}

module.exports = async function factoryClients(request, response) {
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url, originFromRequest(request));
      if (url.searchParams.get('portal') === '1') {
        await handlePortal(request, response);
        return;
      }
      if (!requireAdmin(request, response)) return;
      if (!hasStorage()) {
        sendJson(response, 200, { configured: false, error: 'blob_token_missing', clients: [] });
        return;
      }
      const clients = await readClients();
      sendJson(response, 200, {
        configured: true,
        statuses: STATUS,
        checks: CHECKS,
        clients: clients.map((client) => withPortalUrl(request, client))
      });
      return;
    }

    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) {
      response.setHeader('Allow', 'GET, POST, PATCH, DELETE');
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }

    if (!requireAdmin(request, response)) return;
    if (!hasStorage()) {
      sendJson(response, 503, { configured: false, error: 'blob_token_missing', clients: [] });
      return;
    }

    const body = await readJsonBody(request);
    const clients = await readClients();

    if (request.method === 'POST') {
      const client = sanitizeClient({ ...body, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, clients.length);
      const saved = await writeClients([client, ...clients]);
      sendJson(response, 201, {
        ok: true,
        configured: true,
        client: withPortalUrl(request, saved.find((item) => item.id === client.id) || client),
        clients: saved.map((item) => withPortalUrl(request, item))
      });
      return;
    }

    const id = cleanText(body.id, 80);
    if (!id) {
      sendJson(response, 400, { error: 'missing_id' });
      return;
    }

    if (request.method === 'DELETE') {
      const saved = await writeClients(clients.filter((client) => client.id !== id));
      sendJson(response, 200, { ok: true, configured: true, clients: saved.map((item) => withPortalUrl(request, item)) });
      return;
    }

    const found = clients.find((client) => client.id === id);
    if (!found) {
      sendJson(response, 404, { error: 'client_not_found' });
      return;
    }
    const updated = mergeClient(found, body);
    const saved = await writeClients(clients.map((client) => (client.id === id ? updated : client)));
    sendJson(response, 200, {
      ok: true,
      configured: true,
      client: withPortalUrl(request, updated),
      clients: saved.map((item) => withPortalUrl(request, item))
    });
  } catch (error) {
    sendJson(response, Number(error.statusCode) || 500, { ok: false, error: cleanText(error.message || 'factory_clients_failed', 120) });
  }
};
