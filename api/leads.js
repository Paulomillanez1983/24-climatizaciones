/**
 * /api/leads
 *
 * Pedidos de presupuesto. Es el pegamento del flujo:
 *
 *   entra el pedido  ->  se calcula el presupuesto con el motor  ->
 *   el negocio lo revisa y lo envia  ->  el cliente acepta  ->
 *   se deriva a un tecnico de la red.
 *
 *   POST              (publico) alta del pedido. Devuelve id + key de seguimiento.
 *   GET ?id&key       (publico) el cliente ve su propio pedido.
 *   GET ?stats=1      (publico) conteos, sin datos personales.
 *   GET ?admin=1      (admin)   listado completo.
 *   PATCH             (admin)   estado, tecnico asignado, precio final, notas.
 *
 * Almacenamiento: objeto JSON en Vercel Blob (admin/leads.json).
 */

const pricing = require('../lib/pricing');
const {
  sendJson,
  readJsonBody,
  sanitizeText,
  sanitizePhone,
  phoneKey,
  hasStorage,
  requireAdmin,
  readCollection,
  writeCollection,
  makeId,
  makePublicKey,
  hashPublicKey,
  safeEqualHex
} = require('../lib/store');

const PATH = 'admin/leads.json';

const STATUSES = ['nuevo', 'presupuestado', 'enviado', 'aceptado', 'derivado', 'hecho', 'perdido'];
const STATUS_LABELS = {
  nuevo: 'Pedido nuevo',
  presupuestado: 'Presupuesto armado',
  enviado: 'Enviado al cliente',
  aceptado: 'Aceptado por el cliente',
  derivado: 'Derivado a un técnico',
  hecho: 'Trabajo realizado',
  perdido: 'No avanzó'
};

function cleanAnswers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).slice(0, 20).forEach((key) => {
    const cleanKey = sanitizeText(key, 24).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanKey) return;
    const raw = value[key];
    if (raw === undefined || raw === null) return;
    out[cleanKey] = sanitizeText(raw, 40);
  });
  return out;
}

function cleanCoords(value) {
  if (!value || typeof value !== 'object') return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

// El presupuesto guardado lo calcula el servidor: el numero no depende de lo
// que el navegador del cliente haya querido mandar.
function computeQuote(answers) {
  try {
    const result = pricing.quote(answers);
    return {
      module: result.module,
      moduleLabel: result.moduleLabel,
      qty: result.qty,
      // Precio central estimado y su margen.
      estimate: result.estimate,
      low: result.margin.low,
      high: result.margin.high,
      label: result.estimateLabel,
      marginLabel: result.margin.shortLabel,
      marginPercent: result.precision.percent,
      precision: result.precision.level,
      missing: result.precision.missing.slice(0, 6),
      lines: result.lines.map((line) => ({ label: line.label, detail: line.detail, value: line.value })),
      // En reparaciones el precio del trabajo se cierra en el diagnostico.
      repairEstimate: result.repairEstimate || null,
      // Queda registrado con que valor del indice se calculo.
      inflation: { date: result.inflation.date, factor: result.inflation.factor },
      pricingVersion: result.version
    };
  } catch (error) {
    return null;
  }
}

function publicLead(lead) {
  return {
    id: lead.id,
    status: lead.status,
    statusLabel: STATUS_LABELS[lead.status] || 'Pedido',
    name: lead.name,
    moduleLabel: lead.quote ? lead.quote.moduleLabel : '',
    address: lead.address,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    technician: lead.assignedToName || '',
    finalPrice: lead.finalPrice || null,
    quote: lead.quote
      ? {
          label: lead.quote.label,
          estimate: lead.quote.estimate,
          low: lead.quote.low,
          high: lead.quote.high,
          marginLabel: lead.quote.marginLabel,
          precision: lead.quote.precision,
          lines: lead.quote.lines,
          repairEstimate: lead.quote.repairEstimate || null
        }
      : null,
    scheduledFor: lead.scheduledFor || ''
  };
}

function sanitizeLead(input, existing) {
  const now = new Date().toISOString();
  const base = existing || {};
  return {
    id: base.id || makeId('PED'),
    keyHash: base.keyHash || '',
    name: sanitizeText(input.name, 80),
    phone: sanitizePhone(input.phone),
    phoneKey: base.phoneKey || phoneKey(input.phone),
    address: sanitizeText(input.address, 240),
    coords: cleanCoords(input.coords) || base.coords || null,
    module: sanitizeText(input.module, 30) || 'air-install',
    answers: cleanAnswers(input.answers),
    problem: sanitizeText(input.problem, 600),
    photos: Number.isFinite(Number(input.photos)) ? Number(input.photos) : 0,
    source: sanitizeText(input.source, 30) || 'web',
    quote: base.quote || computeQuote(Object.assign({ mod: input.module || base.module || 'air-install' }, cleanAnswers(input.answers) || (base.answers || {}))),
    status: STATUSES.includes(base.status) ? base.status : 'nuevo',
    assignedTo: base.assignedTo || '',
    assignedToName: sanitizeText(base.assignedToName, 80),
    finalPrice: Number.isFinite(Number(base.finalPrice)) ? Number(base.finalPrice) : null,
    scheduledFor: sanitizeText(base.scheduledFor, 40),
    internalNotes: sanitizeText(base.internalNotes, 600),
    createdAt: base.createdAt || now,
    updatedAt: now
  };
}

function validate(input) {
  if (!input.name || input.name.length < 2) return 'missing_name';
  if (!input.address || input.address.length < 5) return 'missing_address';
  // El WhatsApp es opcional: el flujo principal de la web es WhatsApp-first y
  // no siempre lo pide. Si viene, tiene que ser valido.
  const rawPhone = String(input.phone || '').replace(/\D/g, '');
  if (rawPhone && rawPhone.length < 8) return 'invalid_phone';
  return '';
}

module.exports = async function leads(request, response) {
  if (!hasStorage()) {
    sendJson(response, request.method === 'GET' ? 200 : 503, {
      configured: false,
      error: 'blob_token_missing',
      items: [],
      total: 0
    }, request.method === 'GET' ? 60 : 0);
    return;
  }

  try {
    const url = new URL(request.url || '/', `https://${(request.headers && request.headers.host) || 'localhost'}`);

    if (request.method === 'GET') {
      const id = sanitizeText(url.searchParams.get('id'), 40);
      const key = String(url.searchParams.get('key') || '');

      // Seguimiento publico: el cliente ve solo su pedido, con su clave.
      if (id && key) {
        const items = await readCollection(PATH);
        const lead = items.find((item) => item.id === id);
        if (!lead || !lead.keyHash || !safeEqualHex(hashPublicKey(key), lead.keyHash)) {
          sendJson(response, 404, { ok: false, error: 'not_found' });
          return;
        }
        sendJson(response, 200, { ok: true, lead: publicLead(lead) });
        return;
      }

      if (url.searchParams.get('stats') === '1') {
        const items = await readCollection(PATH);
        sendJson(response, 200, { configured: true, total: items.length }, 300);
        return;
      }

      if (!requireAdmin(request, response)) return;
      const items = await readCollection(PATH);
      const status = sanitizeText(url.searchParams.get('status'), 20);
      const filtered = status && STATUSES.includes(status) ? items.filter((item) => item.status === status) : items;
      sendJson(response, 200, {
        configured: true,
        total: items.length,
        statuses: STATUS_LABELS,
        items: filtered.slice().reverse()
      });
      return;
    }

    if (request.method === 'POST') {
      const body = await readJsonBody(request);
      const input = {
        name: sanitizeText(body.name, 80),
        phone: sanitizePhone(body.phone),
        address: sanitizeText(body.address, 240),
        coords: cleanCoords(body.coords),
        module: sanitizeText(body.module, 30),
        answers: cleanAnswers(body.answers),
        problem: sanitizeText(body.problem, 600),
        photos: Number(body.photos) || 0,
        source: sanitizeText(body.source, 30)
      };

      const problem = validate(input);
      if (problem) {
        sendJson(response, 400, { ok: false, error: problem });
        return;
      }

      const items = await readCollection(PATH);
      const key = makePublicKey();
      const lead = sanitizeLead(input, null);
      lead.keyHash = hashPublicKey(key);
      await writeCollection(PATH, items.concat(lead));

      sendJson(response, 201, {
        ok: true,
        lead: { id: lead.id, key, status: lead.status, quote: lead.quote }
      });
      return;
    }

    if (request.method === 'PATCH') {
      if (!requireAdmin(request, response)) return;
      const body = await readJsonBody(request);
      const id = sanitizeText(body.id, 40);
      if (!id) {
        sendJson(response, 400, { ok: false, error: 'missing_id' });
        return;
      }

      const items = await readCollection(PATH);
      const current = items.find((item) => item.id === id);
      if (!current) {
        sendJson(response, 404, { ok: false, error: 'not_found' });
        return;
      }

      const updated = Object.assign({}, current, { updatedAt: new Date().toISOString() });

      if (body.status !== undefined) {
        const status = sanitizeText(body.status, 20);
        if (!STATUSES.includes(status)) {
          sendJson(response, 400, { ok: false, error: 'invalid_status' });
          return;
        }
        updated.status = status;
      }
      if (body.assignedTo !== undefined) {
        const techId = sanitizeText(body.assignedTo, 40);
        updated.assignedTo = techId;
        updated.assignedToName = sanitizeText(body.assignedToName, 80);
        if (techId && updated.status === 'aceptado') updated.status = 'derivado';
      }
      if (body.finalPrice !== undefined) {
        const price = Number(body.finalPrice);
        updated.finalPrice = Number.isFinite(price) && price >= 0 ? price : null;
      }
      if (body.scheduledFor !== undefined) updated.scheduledFor = sanitizeText(body.scheduledFor, 40);
      if (body.internalNotes !== undefined) updated.internalNotes = sanitizeText(body.internalNotes, 600);
      if (body.quoteOverride !== undefined && body.quoteOverride) {
        // El operador reemplaza el precio estimado por el precio real de su
        // trabajo. A partir de ahi el margen deja de tener sentido: el numero
        // pasa a ser el precio que se le envio al cliente.
        const estimate = Number(body.quoteOverride.estimate);
        const half = Number(body.quoteOverride.half);
        if (updated.quote && Number.isFinite(estimate) && estimate >= 0) {
          const safeHalf = Number.isFinite(half) && half >= 0 ? Math.round(half) : 0;
          updated.quote = Object.assign({}, updated.quote, {
            estimate: Math.round(estimate),
            low: Math.max(0, Math.round(estimate - safeHalf)),
            high: Math.round(estimate + safeHalf),
            label: pricing.formatMoney(estimate),
            marginLabel: safeHalf ? '+/- ' + pricing.formatMoney(safeHalf) : '',
            adjusted: true
          });
          // El desglose ajustado a mano se guarda tal cual: es el presupuesto
          // que realmente se le envio al cliente.
          if (Array.isArray(body.quoteOverride.lines)) {
            const lines = body.quoteOverride.lines.slice(0, 20).map((line) => ({
              label: sanitizeText(line && line.label, 80),
              detail: sanitizeText(line && line.detail, 120),
              value: Math.round(Number(line && line.value) || 0)
            })).filter((line) => line.label);
            if (lines.length) updated.quote = Object.assign({}, updated.quote, { lines });
          }
        }
      }

      const next = items.map((item) => (item.id === id ? updated : item));
      await writeCollection(PATH, next);
      sendJson(response, 200, { ok: true, lead: updated });
      return;
    }

    response.setHeader('Allow', 'GET, POST, PATCH');
    sendJson(response, 405, { error: 'method_not_allowed' });
  } catch (error) {
    sendJson(response, 500, { error: 'leads_request_failed' });
  }
};

module.exports.STATUSES = STATUSES;
module.exports.STATUS_LABELS = STATUS_LABELS;
module.exports.PATH = PATH;
