#!/usr/bin/env node
/**
 * Guarda contra la desincronizacion de precios.
 *
 * El cuerpo de /presupuesto/ genera los textos desde lib/pricing.js, asi que no
 * puede quedar desactualizado. Pero el JSON-LD (datos estructurados para Google)
 * tiene que estar escrito en el HTML, y ahi los numeros si pueden quedar viejos.
 *
 * Este chequeo compara el JSON-LD contra la configuracion vigente y dice
 * exactamente que numero actualizar. Correlo despues de tocar precios:
 *
 *   npm run check
 */

const fs = require('fs');
const path = require('path');
const pricing = require('../lib/pricing');

const ROOT = path.join(__dirname, '..');
let failures = 0;

// Formato plano, sin espacios raros: es como se escribe el texto del JSON-LD.
function plain(value) {
  return '$' + Math.round(Math.abs(value)).toLocaleString('es-AR');
}

const CONFIG = pricing.CONFIG;
const heightLow = pricing.findOption(CONFIG.components.height, 'low');
const heightHigh = pricing.findOption(CONFIG.components.height, 'high');
const laborFirst = CONFIG.laborAirInstall.tiers[0];
const laborSecond = CONFIG.laborAirInstall.tiers[1];

// Cada entrada: [descripcion, [numeros que DEBEN aparecer en el texto SEO]]
const EXPECTED = [
  ['Instalación estándar (banda típica)', [laborFirst.min, laborSecond.max]],
  ['Metro extra de cañería', [CONFIG.components.pipePerMeter.min, CONFIG.components.pipePerMeter.max]],
  ['Altura 2do o 3er piso', [heightLow.min, heightLow.max]],
  ['Altura por encima del 3er piso', [heightHigh.min, heightHigh.max]],
  ['Carga de gas refrigerante', [CONFIG.components.gasCharge.min, CONFIG.components.gasCharge.max]]
];

const TARGETS = [
  { file: 'presupuesto/index.html', label: 'JSON-LD FAQPage', extract: (html) => {
      const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
      let out = '';
      let match;
      while ((match = re.exec(html))) out += match[1] + '\n';
      return out;
    } }
];

console.log('Chequeo de precios · configuracion ' + CONFIG.version + ' (' + CONFIG.currency + ')');
console.log('Ultima revision recomendada: ' + CONFIG.reviewAfter + '\n');

for (const target of TARGETS) {
  const full = path.join(ROOT, target.file);
  if (!fs.existsSync(full)) {
    failures++;
    console.log('  FALLA  no existe ' + target.file);
    continue;
  }
  const text = target.extract(fs.readFileSync(full, 'utf8'));
  console.log(target.file + ' → ' + target.label);
  for (const [label, numbers] of EXPECTED) {
    const missing = numbers.map(plain).filter((formatted) => !text.includes(formatted));
    if (missing.length) {
      failures++;
      console.log('  FALLA  ' + label + ': falta ' + missing.join(', ') + ' en el texto');
    } else {
      console.log('  ok     ' + label + ': ' + numbers.map(plain).join(' y '));
    }
  }
  console.log('');
}

if (failures) {
  console.log('Hay ' + failures + ' numero(s) desactualizado(s).');
  console.log('Corregilos en el JSON-LD de presupuesto/index.html.');
  console.log('El cuerpo de la pagina y el resto del sitio ya se actualizan solos desde lib/pricing.js.');
} else {
  console.log('Todo en sincronia: el texto SEO coincide con el motor de precios.');
}

process.exit(failures ? 1 : 0);
