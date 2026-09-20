/**
 * /api/technicians
 *
 * Red de tecnicos que se postulan para recibir trabajos derivados.
 *
 *   POST   (publico)  alta de postulacion. Si el WhatsApp ya existe, actualiza.
 *   GET    (?count=1) publico: solo el conteo total, para mostrar en la web.
 *   GET    (admin=1)  listado completo.
 *   PATCH  (admin)    estado, rating y notas internas.
 *
 * Almacenamiento: objeto JSON en Vercel Blob (admin/technicians.json).
 */

const {
  sendJson,
  readJsonBody,
  sanitizeText,
  sanitizePhone,
  phoneKey,
  sanitizeList,
  hasStorage,
  requireAdmin,
  readCollection,
  writeCollection,
  makeId,
  normalize
} = require('../lib/store');

const PATH = 'admin/technicians.json';

const STATUSES = ['nuevo', 'contactado', 'activo', 'pausado', 'rechazado'];

function sanitizeTechnician(input, existing) {
  const now = new Date().toISOString();
  const base = existing || {};
  return {
    id: base.id || makeId('TEC'),
    name: sanitizeText(input.name, 80),
    phone: sanitizePhone(input.phone),
    phoneKey: phoneKey(input.phone),
    zone: sanitizeText(input.zone, 60),
    experience: sanitizeText(input.experience, 30),
    specialties: sanitizeList(input.specialties, 12, 60),
    heightWork: sanitizeText(input.heightWork, 40),
    matricula: sanitizeText(input.matricula, 80),
    mobility: sanitizeText(input.mobility, 60),
    documents: sanitizeText(input.documents, 60),
    availability: sanitizeText(input.availability, 40),
    tools: sanitizeText(input.tools, 400),
    references: sanitizeText(input.references, 400),
    notes: sanitizeText(input.notes, 400),
    status: STATUSES.includes(base.status) ? base.status : 'nuevo',
    rating: Number.isFinite(Number(base.rating)) ? Number(base.rating) : null,
    jobsAssigned: Number.isFinite(Number(base.jobsAssigned)) ? Number(base.jobsAssigned) : 0,
    createdAt: base.createdAt || now,
    updatedAt: now
  };
}

function validate(input) {
  if (!input.name || input.name.length < 3) return 'missing_name';
  const digits = String(input.phone || '').replace(/\D/g, '');
  if (digits.length < 8) return 'invalid_phone';
  if (!input.zone) return 'missing_zone';
  if (!input.experience) return 'missing_experience';
  if (!Array.isArray(input.specialties) || !input.specialties.length) return 'missing_specialties';
  return '';
}

module.exports = async function technicians(request, response) {
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
      // Conteo publico: no expone datos personales.
      if (url.searchParams.get('count') === '1') {
        const items = await readCollection(PATH);
        sendJson(response, 200, { configured: true, total: items.length, active: items.filter((t) => t.status === 'activo').length }, 300);
        return;
      }

      if (!requireAdmin(request, response)) return;
      const items = await readCollection(PATH);
      sendJson(response, 200, { configured: true, total: items.length, items });
      return;
    }

    if (request.method === 'POST') {
      const body = await readJsonBody(request);
      const input = {
        name: sanitizeText(body.name, 80),
        phone: sanitizePhone(body.phone),
        zone: sanitizeText(body.zone, 60),
        experience: sanitizeText(body.experience, 30),
        specialties: sanitizeList(body.specialties, 12, 60),
        heightWork: sanitizeText(body.heightWork, 40),
        matricula: sanitizeText(body.matricula, 80),
        mobility: sanitizeText(body.mobility, 60),
        documents: sanitizeText(body.documents, 60),
        availability: sanitizeText(body.availability, 40),
        tools: sanitizeText(body.tools, 400),
        references: sanitizeText(body.references, 400),
        notes: sanitizeText(body.notes, 400)
      };

      const problem = validate(input);
      if (problem) {
        sendJson(response, 400, { ok: false, error: problem });
        return;
      }

      const items = await readCollection(PATH);
      // Misma persona cargando dos veces (aunque escriba el telefono distinto):
      // se actualiza, no se duplica.
      const incomingKey = phoneKey(input.phone);
      const existing = items.find((item) => item.id && incomingKey && (item.phoneKey === incomingKey || phoneKey(item.phone) === incomingKey));
      const technician = sanitizeTechnician(input, existing);
      const next = existing
        ? items.map((item) => (item.id === existing.id ? technician : item))
        : items.concat(technician);
      await writeCollection(PATH, next);

      sendJson(response, existing ? 200 : 201, {
        ok: true,
        duplicate: Boolean(existing),
        technician: { id: technician.id, name: technician.name, createdAt: technician.createdAt }
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
      if (body.rating !== undefined) {
        const rating = Number(body.rating);
        updated.rating = Number.isFinite(rating) ? Math.max(1, Math.min(5, Math.round(rating))) : null;
      }
      if (body.internalNotes !== undefined) updated.internalNotes = sanitizeText(body.internalNotes, 400);
      if (body.notes !== undefined) updated.notes = sanitizeText(body.notes, 400);

      const next = items.map((item) => (item.id === id ? updated : item));
      await writeCollection(PATH, next);
      sendJson(response, 200, { ok: true, technician: updated });
      return;
    }

    response.setHeader('Allow', 'GET, POST, PATCH');
    sendJson(response, 405, { error: 'method_not_allowed' });
  } catch (error) {
    sendJson(response, 500, { error: 'technicians_request_failed' });
  }
};

// Exportado para test y reuso desde el panel de despacho.
module.exports.STATUSES = STATUSES;
module.exports.PATH = PATH;
module.exports._normalize = normalize;
