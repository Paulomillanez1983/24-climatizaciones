#!/usr/bin/env node
/**
 * Chequeos estaticos del sitio. No necesita dependencias externas.
 *
 *   1. Sintaxis de cada archivo .js
 *   2. Sintaxis de cada <script> inline (los errores de tipeo mas caros de encontrar)
 *   3. JSON-LD parseable
 *   4. Enlaces internos que resuelven a un archivo real
 *   5. Recursos precargados por el service worker que existen
 *   6. Las rutas clave se sirven y devuelven el contenido esperado
 *   7. El motor de precios funciona por la rama de navegador (no solo en Node)
 *   8. El panel interno queda fuera de los buscadores
 *
 *   npm run check:site
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let passes = 0;

function expect(label, condition, detail) {
  if (condition) {
    passes++;
    console.log('  ok    ' + label);
  } else {
    failures++;
    console.log('  FALLA ' + label + (detail ? '  -> ' + detail : ''));
  }
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const jsFiles = files.filter((f) => f.endsWith('.js') && !f.startsWith(path.join(ROOT, 'scripts')));

/* ---- 1 ---- */
console.log('\n[1] Sintaxis de archivos .js');
for (const file of jsFiles) {
  const rel = path.relative(ROOT, file);
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: rel });
    passes++;
  } catch (error) {
    expect(rel, false, error.message);
  }
}
console.log('  ok    ' + jsFiles.length + ' archivos .js parsean sin error');

/* ---- 2 ---- */
console.log('\n[2] Sintaxis de <script> inline');
let inlineCount = 0;
for (const file of htmlFiles) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, 'utf8');
  // Solo JavaScript real: los bloques de datos (ld+json, speculationrules) se
  // validan aparte, mas abajo, porque no son codigo ejecutable.
  const re = /<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)(?![^>]*speculationrules)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  while ((match = re.exec(html))) {
    index++;
    const code = match[1];
    if (!code.trim()) continue;
    inlineCount++;
    try {
      new vm.Script(code, { filename: rel + '#inline' + index });
    } catch (error) {
      expect(rel + ' inline#' + index, false, error.message);
    }
  }
}
console.log('  ok    ' + inlineCount + ' bloques inline parsean sin error');

/* ---- 3 ---- */
console.log('\n[3] Datos estructurados (JSON-LD y speculation rules)');
let ldCount = 0;
for (const file of htmlFiles) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, 'utf8');
  const re = /<script[^>]*type="(?:application\/ld\+json|speculationrules)"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  while ((match = re.exec(html))) {
    index++;
    const content = match[1];
    // En factory/index.html el bloque es una plantilla JS que genera el JSON-LD
    // de los sitios de clientes, no datos estructurados de esta pagina.
    if (content.includes('${')) {
      console.log('  skip  ' + rel + ' ld+' + index + ' (plantilla generada por JS)');
      continue;
    }
    ldCount++;
    try {
      JSON.parse(content);
    } catch (error) {
      expect(rel + ' ld+' + index, false, error.message);
    }
  }
}
console.log('  ok    ' + ldCount + ' bloques JSON-LD validos');

/* ---- 4 ---- */
console.log('\n[4] Enlaces internos');
const linkRe = /(?:href|src)="(\/[^"#?]*)"/g;
const seen = new Set();
let linkCount = 0;
for (const file of htmlFiles) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = linkRe.exec(html))) {
    const target = match[1];
    if (seen.has(target)) continue;
    seen.add(target);
    if (target.startsWith('/api/') || target.startsWith('/_vercel/')) continue;
    linkCount++;
    const asFile = path.join(ROOT, target);
    const asIndex = path.join(ROOT, target, 'index.html');
    if (!fs.existsSync(asFile) && !fs.existsSync(asIndex)) {
      expect(target + ' (desde ' + rel + ')', false, 'no existe');
    }
  }
}
console.log('  ok    ' + linkCount + ' enlaces internos resuelven a un archivo real');

/* ---- 5 ---- */
console.log('\n[5] Precarga del service worker');
const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const assetRe = /'\.\/([^']*)'/g;
let swMatch;
let assetCount = 0;
while ((swMatch = assetRe.exec(sw))) {
  const target = swMatch[1];
  assetCount++;
  if (!target) continue;
  const asFile = path.join(ROOT, target);
  const asIndex = path.join(ROOT, target, 'index.html');
  if (!fs.existsSync(asFile) && !fs.existsSync(asIndex)) {
    expect('./' + target, false, 'no existe: rompe la precarga offline');
  }
}
console.log('  ok    ' + assetCount + ' recursos precargados existen');

/* ---- 6 y 7: servidor local ---- */
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
  let target = decodeURIComponent(req.url.split('?')[0]);
  if (target.endsWith('/')) target += 'index.html';
  const full = path.join(ROOT, target);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.setHeader('Content-Type', TYPES[path.extname(full)] || 'application/octet-stream');
  res.end(fs.readFileSync(full));
});

(async function serveChecks() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;

  console.log('\n[6] Rutas servidas');
  const routes = [
    ['/', 'Solicitar presupuesto'],
    ['/presupuesto/', 'Cuanto sale tu'],
    ['/tecnicos/', 'Trabajos derivados'],
    ['/pedidos/', 'Pedidos y despacho'],
    ['/lib/pricing.js', 'PRICING_24'],
    ['/sitemap.xml', '/presupuesto/'],
    ['/llms.txt', 'Metodologia del precio'],
    // Se busca solo el prefijo: la version del cache sube en cada deploy y el
    // chequeo no tiene que romperse por eso.
    ['/service-worker.js', '24-climatizaciones-v'],
    ['/manifest.webmanifest', '24 Clima']
  ];
  for (const [route, marker] of routes) {
    const res = await fetch(base + route);
    const body = await res.text();
    expect(route, res.status === 200 && body.includes(marker), 'status=' + res.status);
  }

  console.log('\n[7] Motor de precios en el navegador');
  const code = await (await fetch(base + '/lib/pricing.js')).text();
  const sandbox = { self: {}, Intl: Intl, URLSearchParams: URLSearchParams };
  vm.createContext(sandbox);
  try {
    new vm.Script(code, { filename: 'pricing.js' }).runInContext(sandbox);
  } catch (error) {
    expect('carga del motor', false, error.message);
  }
  const P = sandbox.self.PRICING_24;
  expect('expone PRICING_24 en self (rama navegador del UMD)', !!P);
  expect('no depende de module.exports en el navegador', sandbox.module === undefined);
  if (P) {
    const result = P.quote({ mod: 'air-install', fg: '4500', qty: 2, pipe: 8, height: 'high', elec: 'new', drain: 'new', wall: 'concrete', zone: 'near30', pre: 'no' });
    expect('cotiza correctamente', result.total.min > 0 && result.total.max > result.total.min, JSON.stringify(result.total));
    expect('devuelve desglose', result.lines.length >= 6, String(result.lines.length));
    expect('formatea en pesos argentinos', /^\$\s?[\d.]+/.test(result.totalLabel), result.totalLabel);
    const link = P.encodeInput({ mod: 'air-install', fg: '3000', qty: 2 });
    expect('codifica link compartible', link === 'mod=air-install&fg=3000&qty=2', link);
    expect('decodifica link compartible', P.decodeInput(link).fg === '3000');
  }

  console.log('\n[8] Panel interno fuera de buscadores');
  const pedidosHtml = await (await fetch(base + '/pedidos/')).text();
  expect('/pedidos/ tiene noindex', pedidosHtml.includes('content="noindex, nofollow"'));
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  expect('/pedidos/ no figura en el sitemap', !sitemap.includes('/pedidos/'));
  expect('/presupuesto/ figura en el sitemap', sitemap.includes('/presupuesto/'));

  console.log('\n[9] Los textos con precios no estan escritos a mano');
  const presuHtml = await (await fetch(base + '/presupuesto/')).text();
  const bodyOnly = presuHtml.split('</head>')[1] || '';
  const hardcoded = (bodyOnly.match(/\$\s?\d{2,3}\.\d{3}/g) || []);
  expect('el cuerpo de /presupuesto/ no hardcodea precios', hardcoded.length === 0, hardcoded.join(', '));

  console.log('\n=====================================');
  console.log('Checks ok: ' + passes + '   Fallas: ' + failures);
  console.log('=====================================');
  server.close();
  process.exit(failures ? 1 : 0);
})();
