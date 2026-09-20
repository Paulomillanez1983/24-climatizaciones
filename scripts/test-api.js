#!/usr/bin/env node
/**
 * Pruebas funcionales de las APIs de pedidos y tecnicos.
 *
 * Corren sin red y sin credenciales: reemplazan @vercel/blob por un
 * almacenamiento en memoria y firman una sesion de admin valida. Asi se verifica
 * el ciclo completo (alta, deduplicacion, seguimiento, ajuste del presupuesto y
 * derivacion) antes de subir nada.
 *
 *   npm test
 */

// --- entorno y almacenamiento simulado (antes de cargar los modulos) ---
process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_TESTTOKEN';
process.env.ADMIN_PASSWORD_SALT = 'test-salt';
process.env.ADMIN_PASSWORD_HASH = 'deadbeef';
process.env.ADMIN_SESSION_SECRET = 'test-session-secret';

const store = {};
const blobPath = require.resolve('@vercel/blob');
require.cache[blobPath] = {
  id: blobPath,
  filename: blobPath,
  loaded: true,
  exports: {
    put: async (pathname, data) => {
      store[pathname] = String(data);
      return { url: 'mem://' + pathname, pathname };
    },
    list: async ({ prefix } = {}) => ({
      blobs: Object.keys(store)
        .filter((key) => !prefix || key.startsWith(prefix))
        .map((key) => ({ pathname: key, url: 'mem://' + key }))
    }),
    del: async (pathname) => { delete store[pathname]; }
  }
};

const realFetch = global.fetch;
global.fetch = async (url, options) => {
  const target = String(url);
  if (target.startsWith('mem://')) {
    const key = target.slice('mem://'.length);
    const content = store[key];
    if (content === undefined) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => JSON.parse(content) };
  }
  return realFetch(url, options);
};

const leads = require('../api/leads.js');
const technicians = require('../api/technicians.js');
const { createSessionCookie } = require('../lib/admin-auth');

const session = createSessionCookie({ headers: { host: 'localhost:3000' } });

// --- helpers de request/response ---
function mockReq(method, url, body, { auth = false } = {}) {
  const headers = { host: 'localhost:3000' };
  if (auth) headers.cookie = session.cookie;
  return { method, url, headers, body };
}

function mockRes() {
  const res = { statusCode: 200, headers: {}, payload: null };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (chunk) => { res.payload = chunk ? JSON.parse(chunk) : null; };
  return res;
}

async function call(handler, method, url, body, opts) {
  const res = mockRes();
  await handler(mockReq(method, url, body, opts), res);
  return res;
}

let failures = 0;
let passes = 0;

function expect(label, condition, detail) {
  if (condition) { passes++; console.log('  ok    ' + label); }
  else { failures++; console.log('  FAIL  ' + label + (detail ? '  -> ' + JSON.stringify(detail) : '')); }
}

(async function run() {
  const HOST = 'localhost:3000';

  console.log('\n[TECNICOS]');
  let res = await call(technicians, 'POST', HOST + '/api/technicians', {
    name: 'Juan Perez',
    phone: '351 555 1234',
    zone: 'Córdoba Capital — Norte',
    experience: '4 a 8 años',
    specialties: ['Instalación de split', 'Reparación de aire'],
    heightWork: 'Hasta 3er piso',
    mobility: 'Sí, vehículo propio con herramientas',
    availability: 'Full time'
  });
  expect('POST valido -> 201', res.statusCode === 201, res.payload);
  expect('devuelve id TEC-', res.payload && res.payload.technician && /^TEC-/.test(res.payload.technician.id), res.payload);
  const techId = res.payload && res.payload.technician && res.payload.technician.id;

  res = await call(technicians, 'POST', HOST + '/api/technicians', {
    name: 'Juan Perez', phone: '+54 9 351 555 1234', zone: 'Córdoba Capital — Norte',
    experience: '4 a 8 años', specialties: ['Instalación de split']
  });
  expect('mismo telefono -> 200 duplicate (no duplica)', res.statusCode === 200 && res.payload.duplicate === true, res.payload);

  res = await call(technicians, 'POST', HOST + '/api/technicians', { name: 'X', phone: '1' });
  expect('POST invalido -> 400', res.statusCode === 400, res.payload);

  res = await call(technicians, 'GET', HOST + '/api/technicians?count=1');
  expect('GET count publico -> 1 tecnico', res.payload && res.payload.total === 1, res.payload);
  expect('GET count no expone datos personales', res.payload && res.payload.items === undefined, res.payload);

  res = await call(technicians, 'GET', HOST + '/api/technicians');
  expect('GET sin sesion -> 401', res.statusCode === 401, res.payload);

  res = await call(technicians, 'GET', HOST + '/api/technicians', null, { auth: true });
  expect('GET con sesion -> lista', res.statusCode === 200 && res.payload.items.length === 1, res.payload);

  res = await call(technicians, 'PATCH', HOST + '/api/technicians', { id: techId, status: 'activo' }, { auth: true });
  expect('PATCH status activo -> ok', res.statusCode === 200 && res.payload.technician.status === 'activo', res.payload);

  res = await call(technicians, 'PATCH', HOST + '/api/technicians', { id: techId, status: 'inventado' }, { auth: true });
  expect('PATCH status invalido -> 400', res.statusCode === 400, res.payload);

  res = await call(technicians, 'GET', HOST + '/api/technicians?count=1');
  expect('conteo de activos correcto', res.payload && res.payload.active === 1, res.payload);

  console.log('\n[PEDIDOS]');
  res = await call(leads, 'POST', HOST + '/api/leads', {
    name: 'Maria Lopez',
    phone: '3514448899',
    address: 'Av. Colón 1234, Córdoba',
    coords: { lat: -31.4201, lng: -64.1888 },
    module: 'air-install',
    answers: { fg: '3000', qty: 1, pipe: 6, height: 'low', elec: 'new', drain: 'ok', wall: 'brick', zone: 'cap10', pre: 'no' },
    problem: 'Quiero instalar un split en el living',
    photos: 2,
    source: 'web'
  });
  expect('POST pedido -> 201', res.statusCode === 201, res.payload);
  expect('devuelve id PED-', res.payload && /^PED-/.test(res.payload.lead.id), res.payload);
  expect('devuelve key de seguimiento', res.payload && typeof res.payload.lead.key === 'string' && res.payload.lead.key.length > 10, res.payload);
  expect('presupuesto calculado en el servidor', res.payload && res.payload.lead.quote && res.payload.lead.quote.min > 0, res.payload);
  expect('desglose presente', res.payload && res.payload.lead.quote.lines.length >= 5, res.payload);
  const leadId = res.payload.lead.id;
  const leadKey = res.payload.lead.key;
  const serverQuote = res.payload.lead.quote;

  res = await call(leads, 'POST', HOST + '/api/leads', { name: 'Sin domicilio', phone: '3514448899' });
  expect('POST sin domicilio -> 400', res.statusCode === 400, res.payload);

  res = await call(leads, 'POST', HOST + '/api/leads', {
    name: 'Pedido web', address: 'Bv. San Juan 500, Córdoba', module: 'air-service', source: 'web'
  });
  expect('POST sin telefono -> 201 (flujo web WhatsApp-first)', res.statusCode === 201, res.payload);
  const webLeadId = res.payload.lead.id;

  res = await call(leads, 'GET', HOST + '/api/leads?id=' + leadId + '&key=' + leadKey);
  expect('GET seguimiento con key correcta -> ok', res.statusCode === 200 && res.payload.lead.id === leadId, res.payload);
  expect('seguimiento publico no filtra hash de la clave', res.payload && res.payload.lead.keyHash === undefined, res.payload);

  res = await call(leads, 'GET', HOST + '/api/leads?id=' + leadId + '&key=claveFalsa');
  expect('GET con key incorrecta -> 404', res.statusCode === 404, res.payload);

  res = await call(leads, 'GET', HOST + '/api/leads?admin=1');
  expect('GET admin sin sesion -> 401', res.statusCode === 401, res.payload);

  res = await call(leads, 'GET', HOST + '/api/leads?admin=1', null, { auth: true });
  expect('GET admin -> 2 pedidos', res.statusCode === 200 && res.payload.items.length === 2, res.payload);
  expect('listado admin incluye etiquetas de estado', res.payload && res.payload.statuses && !!res.payload.statuses.nuevo, res.payload);

  res = await call(leads, 'PATCH', HOST + '/api/leads', {
    id: leadId,
    quoteOverride: { min: 200000, max: 260000, lines: [{ label: 'Mano de obra', detail: '3.000 a 3.500 frigorias', min: 150000, max: 195000 }] },
    finalPrice: 240000,
    assignedTo: techId,
    assignedToName: 'Juan Perez',
    scheduledFor: 'Martes a la mañana',
    status: 'aceptado',
    internalNotes: 'Cliente confirmo por telefono'
  }, { auth: true });
  expect('PATCH presupuesto ajustado -> ok', res.statusCode === 200, res.payload);
  expect('total ajustado guardado', res.payload && res.payload.lead.quote.min === 200000 && res.payload.lead.quote.max === 260000, res.payload && res.payload.lead.quote);
  expect('desglose ajustado guardado', res.payload && res.payload.lead.quote.lines.length === 1, res.payload && res.payload.lead.quote);
  expect('marca adjusted', res.payload && res.payload.lead.quote.adjusted === true, res.payload && res.payload.lead.quote);
  expect('precio final guardado', res.payload && res.payload.lead.finalPrice === 240000, res.payload);
  expect('origen del presupuesto preservado', res.payload && res.payload.lead.quote.moduleLabel === serverQuote.moduleLabel, res.payload && res.payload.lead.quote);
  expect('aceptado + tecnico asignado deriva automaticamente', res.payload && res.payload.lead.status === 'derivado', res.payload && res.payload.lead.status);

  res = await call(leads, 'PATCH', HOST + '/api/leads', { id: leadId, status: 'perdido' }, { auth: true });
  expect('PATCH status perdido -> ok', res.statusCode === 200 && res.payload.lead.status === 'perdido', res.payload);

  res = await call(leads, 'PATCH', HOST + '/api/leads', { id: 'PED-INEXISTENTE', status: 'nuevo' }, { auth: true });
  expect('PATCH id inexistente -> 404', res.statusCode === 404, res.payload);

  res = await call(leads, 'PATCH', HOST + '/api/leads', { id: webLeadId, status: 'nope' }, { auth: true });
  expect('PATCH status invalido -> 400', res.statusCode === 400, res.payload);

  res = await call(leads, 'GET', HOST + '/api/leads?admin=1&status=perdido', null, { auth: true });
  expect('filtro por estado funciona', res.statusCode === 200 && res.payload.items.length === 1, res.payload);

  res = await call(leads, 'DELETE', HOST + '/api/leads', null, { auth: true });
  expect('metodo no permitido -> 405', res.statusCode === 405, res.payload);

  console.log('\n[ALMACENAMIENTO]');
  expect('se escribieron las dos colecciones', Object.keys(store).sort().join(',') === 'admin/leads.json,admin/technicians.json', Object.keys(store));
  expect('ningun archivo guarda la clave en claro', !JSON.stringify(store).includes(leadKey), 'la clave aparece en texto plano');
  expect('ningun archivo guarda el telefono sin sanear', !JSON.stringify(store).includes('"351 555 1234"'), 'telefono sin sanear');

  console.log('\n=====================================');
  console.log('Pruebas ok: ' + passes + '   Fallas: ' + failures);
  console.log('=====================================');
  process.exit(failures ? 1 : 0);
})();
