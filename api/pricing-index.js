/**
 * /api/pricing-index
 *
 * Devuelve el ultimo valor del Indice de Precios al Consumidor Nacional (INDEC)
 * para que el motor de presupuestos actualice sus valores por inflacion sin que
 * nadie edite un archivo.
 *
 *   GET  ->  { ok, index, date, monthly, series }
 *
 * Fuente: API de series de tiempo de datos.gob.ar (INDEC, IPC base dic 2016).
 * El resultado se cachea 6 horas en el borde: el dato es mensual, no hace falta
 * consultarlo mas seguido.
 *
 * Si la fuente falla, responde igual con ok:false. El motor tiene su ultimo
 * valor conocido guardado, asi que el sitio nunca se queda sin precios.
 */

const SERIES_ID = '148.3_INIVELNAL_DICI_M_26';
const API_URL = 'https://apis.datos.gob.ar/series/api/series/';
const CACHE_SECONDS = 6 * 60 * 60;
const TIMEOUT_MS = 8000;

function sendJson(response, statusCode, body, maxAge) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', maxAge > 0 ? `s-maxage=${maxAge}, stale-while-revalidate=${maxAge}` : 'no-store');
  response.end(JSON.stringify(body));
}

module.exports = async function pricingIndex(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { ok: false, error: 'method_not_allowed' }, 0);
    return;
  }

  const url = `${API_URL}?ids=${SERIES_ID}&format=json&last=2`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      sendJson(response, 200, { ok: false, error: 'upstream_status_' + upstream.status, series: SERIES_ID }, 600);
      return;
    }

    const payload = await upstream.json();
    const rows = Array.isArray(payload && payload.data) ? payload.data : [];
    // Cada fila es [fecha, valor]. Se toma la ultima con valor numerico.
    const valid = rows.filter((row) => Array.isArray(row) && Number.isFinite(Number(row[1])));
    if (!valid.length) {
      sendJson(response, 200, { ok: false, error: 'empty_series', series: SERIES_ID }, 600);
      return;
    }

    const last = valid[valid.length - 1];
    const previous = valid.length > 1 ? valid[valid.length - 2] : null;
    const index = Number(last[1]);
    const monthly = previous ? ((index / Number(previous[1])) - 1) * 100 : null;

    sendJson(response, 200, {
      ok: true,
      index: index,
      date: String(last[0]).slice(0, 10),
      previousIndex: previous ? Number(previous[1]) : null,
      previousDate: previous ? String(previous[0]).slice(0, 10) : null,
      monthly: monthly === null ? null : Math.round(monthly * 100) / 100,
      source: 'INDEC',
      series: SERIES_ID,
      seriesTitle: 'IPC. Nivel General Nacional. Base dic 2016. Mensual.'
    }, CACHE_SECONDS);
  } catch (error) {
    clearTimeout(timer);
    // No es un error para el usuario: el motor tiene su valor de respaldo.
    sendJson(response, 200, {
      ok: false,
      error: error && error.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      series: SERIES_ID
    }, 300);
  }
};

module.exports.SERIES_ID = SERIES_ID;
