#!/usr/bin/env node
/**
 * Chequeo del motor de precios.
 *
 * Desde que los valores se actualizan solos por inflacion, la regla cambio:
 * ningun importe puede quedar escrito a mano en el HTML. Un precio fijo en el
 * texto SEO queda viejo al mes siguiente, y un numero viejo publicado en Google
 * es peor que no publicar ningun numero.
 *
 * Este chequeo verifica:
 *   1. Que la configuracion sea coherente (indices, dispersiones, valores).
 *   2. Que ningun importe este hardcodeado en el HTML publico ni en los datos
 *      estructurados.
 *   3. Informa los valores que el cliente esta viendo hoy, ya ajustados por
 *      inflacion, para poder revisarlos de un vistazo.
 *
 *   npm run check:prices
 */

const fs = require('fs');
const path = require('path');
const pricing = require('../lib/pricing');

const ROOT = path.join(__dirname, '..');
let failures = 0;

function ok(label, detail) {
  console.log('  ok     ' + label + (detail ? '  ' + detail : ''));
}

function fail(label, detail) {
  failures++;
  console.log('  FALLA  ' + label + (detail ? '  -> ' + detail : ''));
}

const CONFIG = pricing.CONFIG;
const money = pricing.formatMoney;

/* ---- 1. Coherencia de la configuracion ---- */
console.log('\n[1] Configuracion');

if (!(CONFIG.inflation.baseIndex > 0)) fail('indice base valido', String(CONFIG.inflation.baseIndex));
else ok('indice base', CONFIG.inflation.baseIndex + ' (' + CONFIG.inflation.baseDate + ')');

if (!(CONFIG.inflation.fallbackIndex > 0)) fail('indice de respaldo valido', String(CONFIG.inflation.fallbackIndex));
else ok('indice de respaldo', CONFIG.inflation.fallbackIndex + ' (' + CONFIG.inflation.fallbackDate + ')');

if (!(CONFIG.inflation.maxFactor > 1 && CONFIG.inflation.maxFactor <= 5)) {
  fail('techo de seguridad razonable', String(CONFIG.inflation.maxFactor));
} else ok('techo de seguridad', 'x' + CONFIG.inflation.maxFactor);

// Recorre todos los items con precio y valida valor y dispersion.
const items = [];
function collect(node, trail) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => collect(child, trail + '[' + i + ']'));
    return;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'value') && Object.prototype.hasOwnProperty.call(node, 'spread')) {
    items.push({ trail: trail + ' · ' + (node.label || node.key || ''), value: node.value, spread: node.spread });
    return;
  }
  Object.keys(node).forEach((key) => collect(node[key], trail ? trail + '.' + key : key));
}
collect(CONFIG.laborAir, 'laborAir');
collect(CONFIG.repairAir, 'repairAir');
collect(CONFIG.serviceAir, 'serviceAir');
collect(CONFIG.diagnosis, 'diagnosis');
collect(CONFIG.boiler, 'boiler');
collect(CONFIG.components, 'components');

if (!items.length) fail('se encontraron items de precio', '0');
else ok('items de precio con valor y dispersion', String(items.length));

const badValue = items.filter((it) => !Number.isFinite(Number(it.value)));
const badSpread = items.filter((it) => !(Number(it.spread) >= 0 && Number(it.spread) <= 0.8));
if (badValue.length) fail('todos los valores son numericos', badValue.map((i) => i.trail).join(', '));
else ok('todos los valores son numericos');
if (badSpread.length) fail('todas las dispersiones estan entre 0 y 0,8', badSpread.map((i) => i.trail + '=' + i.spread).join(', '));
else ok('todas las dispersiones estan entre 0 y 0,8');

/* ---- 2. Ningun importe escrito a mano ---- */
console.log('\n[2] Importes hardcodeados en el HTML');

const PUBLICS = ['index.html', 'presupuesto/index.html', 'tecnicos/index.html'];
// Detecta montos en pesos: "$ 123.456", "$123.456", "$ 12345".
const MONEY = /\$\s?\d{1,3}(?:\.\d{3})+(?!\d)|\$\s?\d{4,}/g;

for (const rel of PUBLICS) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    fail(rel + ' existe', 'no encontrado');
    continue;
  }
  const html = fs.readFileSync(full, 'utf8');
  // Se sacan los bloques de codigo: ahi si puede haber montos (formulas, tests).
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const found = visible.match(MONEY) || [];
  if (found.length) {
    fail(rel + ' no tiene importes escritos a mano', [...new Set(found)].slice(0, 6).join(', '));
  } else {
    ok(rel + ' sin importes escritos a mano');
  }

  // Los datos estructurados se revisan aparte: Google los lee directo.
  const ld = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const ldMoney = ld.join(' ').match(MONEY) || [];
  if (ldMoney.length) fail(rel + ' sin importes en los datos estructurados', [...new Set(ldMoney)].join(', '));
  else ok(rel + ' sin importes en los datos estructurados');
}

/* ---- 3. Valores vigentes frente al cliente ---- */
console.log('\n[3] Valores que ve el cliente hoy (ya ajustados por inflacion)');
const inf = pricing.getInflation();
console.log('  Indice aplicado: ' + inf.index + ' (' + inf.date + ') · factor ' + inf.factor.toFixed(4) +
  ' · +' + inf.percent + '% desde ' + inf.baseDate + ' · origen: ' + inf.source + '\n');

const samples = [
  ['Instalacion simple (3.000 fg, 3 m, planta baja)', { mod: 'air-install', fg: '3000', qty: 1, pipe: 0, height: 'ground', elec: 'ok', drain: 'ok', wall: 'dry', zone: 'cap10', pre: 'no' }],
  ['Instalacion con 6 m, 2do piso y linea nueva', { mod: 'air-install', fg: '3000', qty: 1, pipe: 6, height: 'low', elec: 'new', drain: 'ok', wall: 'brick', zone: 'cap10', pre: 'no' }],
  ['Mantenimiento de 1 equipo', { mod: 'air-service', qty: 1, height: 'ground', zone: 'cap10' }],
  ['Visita de diagnostico', { mod: 'air-repair', symptom: 'nofrio', qty: 1, height: 'low', zone: 'cap10' }],
  ['Service de caldera', { mod: 'boiler', job: 'service', qty: 1, zone: 'cap10' }]
];

for (const [label, input] of samples) {
  const result = pricing.quote(input);
  const pad = ' '.repeat(Math.max(0, 48 - label.length));
  console.log('  ' + label + pad + result.estimateLabel.padStart(13) + '   ± ' +
    String(result.precision.percent).padStart(5) + '%   ' + result.precision.label);
}

const wide = samples
  .map(([label, input]) => ({ label, result: pricing.quote(input) }))
  .filter((s) => s.result.precision.percent > 20);
if (wide.length) {
  console.log('\n  Aviso: hay casos con margen mayor al 20%: ' + wide.map((w) => w.label).join(', '));
  console.log('  Es esperable en calibracion o en trabajos intrinsecamente inciertos.');
}

console.log('\n=====================================');
if (failures) {
  console.log('Fallas: ' + failures + '  (importes hardcodeados o configuracion incoherente)');
} else {
  console.log('OK: configuracion coherente y sin importes escritos a mano.');
}
console.log('=====================================');

process.exit(failures ? 1 : 0);
