/**
 * 24 Climatizaciones - Motor de presupuesto parametrico
 * =====================================================
 *
 * PROBLEMA QUE RESUELVE
 * No existe "el precio de instalar un aire". Existe un precio que se ARMA
 * sumando componentes medibles. Este motor reemplaza la idea de "lista de
 * precios fija" por una FORMULA con variables que el tecnico puede medir o
 * preguntar con una pregunta cerrada.
 *
 *   precio = mano de obra(potencia) x cantidad
 *          + cañeria(metros reales)
 *          + altura/acceso
 *          + electrico
 *          + desague
 *          + tipo de pared
 *          - preinstalacion existente
 *          + zona/traslado
 *
 * Cada linea se devuelve desglosada, con minimo y maximo. Nunca un numero
 * unico: un rango es honesto, un numero exacto sin ver el lugar es mentira.
 *
 * CALIBRACION
 * El archivo entero es el unico lugar donde se editan los precios.
 * Cada grupo declara su `source` y su `status`:
 *   status: 'referencia' -> valor tomado de mercado publicado (ver SOURCES)
 *   status: 'estimado'   -> valor estructural sin fuente verificada, CALIBRAR
 * Cuando cierres trabajos reales, corregi los numeros aca. El motor mejora solo.
 *
 * Compatibilidad: se usa igual en Node (require) y en el navegador (script).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PRICING_24 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. FUENTES DE REFERENCIA
   * ------------------------------------------------------------------ */

  var SOURCES = [
    {
      id: 'solvit-2026',
      label: 'Solvit - Precios de instalacion de split en Cordoba',
      url: 'https://solvitapp.com.ar/cuanto-cuesta/instalar-aire-acondicionado/cordoba',
      updated: '2026-06-02'
    },
    {
      id: 'tegu-2026',
      label: 'Tegu - Aire acondicionado en Cordoba 2026',
      url: 'https://tegu.ar/blog/cuanto-cuesta-instalar-aire-acondicionado-cordoba-2026',
      updated: '2026-02-05'
    },
    {
      id: 'todoresuelto-2026',
      label: 'TodoResuelto - Cuanto cuesta instalar un aire acondicionado 2026',
      url: 'https://todoresuelto.com/cuanto-cuesta/instalar-aire-acondicionado',
      updated: '2026-07-27'
    },
    {
      id: 'muovi-2026',
      label: 'Muovi - Instalacion de aire acondicionado en Argentina 2026',
      url: 'https://www.muovi.com.ar/blog/cuanto-sale-instalar-aire-acondicionado-argentina-2026/',
      updated: '2026-06-14'
    }
  ];

  /* ------------------------------------------------------------------ *
   * 2. CONFIGURACION DE PRECIOS  (UNICO LUGAR A EDITAR)
   * ------------------------------------------------------------------ */

  var CONFIG = {
    version: '2026.09',
    currency: 'ARS',
    reviewAfter: '2026-12-31',
    note: 'Precios en pesos argentinos. Referencia Cordoba Capital y alrededores. Ajustar por inflacion y por cierre de trabajos reales.',

    // ---- AIRE ACONDICIONADO: INSTALACION ----
    laborAirInstall: {
      status: 'referencia',
      source: ['solvit-2026', 'tegu-2026', 'todoresuelto-2026'],
      label: 'Mano de obra de instalacion (incluye hasta 3 m de recorrido)',
      tiers: [
        { key: '2200', label: 'Hasta 2.200 frigorias', min: 90000, max: 175000 },
        { key: '3000', label: '3.000 a 3.500 frigorias', min: 110000, max: 195000 },
        { key: '4500', label: '4.500 a 5.500 frigorias', min: 135000, max: 225000 },
        { key: '6000', label: '6.000 o mas / piso-techo / cassette', min: 180000, max: 320000 }
      ]
    },

    // ---- AIRE ACONDICIONADO: REPARACION ----
    repairAir: {
      status: 'estimado',
      source: ['solvit-2026'],
      label: 'Reparacion segun sintoma (requiere diagnostico presencial)',
      symptoms: [
        { key: 'nofrio', label: 'No enfria / no calienta', min: 48000, max: 150000 },
        { key: 'agua', label: 'Pierde agua o gotea', min: 35000, max: 110000 },
        { key: 'ruido', label: 'Hace ruido o vibra', min: 40000, max: 140000 },
        { key: 'noenciende', label: 'No enciende o se apaga solo', min: 45000, max: 160000 },
        { key: 'error', label: 'Muestra codigo de error', min: 40000, max: 180000 },
        { key: 'nose', label: 'No se que tiene', min: 30000, max: 90000 }
      ]
    },

    // ---- AIRE ACONDICIONADO: MANTENIMIENTO ----
    serviceAir: {
      status: 'estimado',
      source: ['solvit-2026'],
      label: 'Mantenimiento preventivo por equipo',
      min: 31000,
      max: 75000
    },

    // ---- CALDERA Y CALEFACCION ----
    boiler: {
      status: 'estimado',
      source: [],
      label: 'Caldera y calefaccion',
      note: 'Sin fuente de mercado verificada para Cordoba. Estructura lista: cargar precios reales de tus trabajos.',
      jobs: [
        { key: 'service', label: 'Service anual de caldera', min: 45000, max: 95000 },
        { key: 'repair', label: 'Reparacion de caldera', min: 60000, max: 180000 },
        { key: 'pressure', label: 'Pierde presion / carga del circuito', min: 40000, max: 120000 },
        { key: 'radiators', label: 'Radiadores frios / purgado', min: 35000, max: 90000 },
        { key: 'nocold', label: 'No calienta / no da agua caliente', min: 50000, max: 160000 }
      ]
    },

    // ---- VISITA / DIAGNOSTICO ----
    diagnosis: {
      status: 'estimado',
      source: ['solvit-2026'],
      label: 'Visita de diagnostico',
      min: 28000,
      max: 60000
    },

    // ---- COMPONENTES ADICIONALES ----
    components: {
      pipePerMeter: {
        status: 'referencia',
        source: ['solvit-2026'],
        label: 'Metro extra de cañeria de cobre (sobre 3 m incluidos)',
        min: 5200,
        max: 10000
      },
      materialsKit: {
        status: 'referencia',
        source: ['solvit-2026'],
        label: 'Kit de materiales (ménsula, aislante, cable, cinta)',
        min: 31000,
        max: 83000
      },
      electrical: {
        status: 'estimado',
        source: [],
        label: 'Conexion electrica',
        options: [
          { key: 'ok', label: 'Toma existente y funcional', min: 0, max: 0 },
          { key: 'new', label: 'Hacer linea nueva + térmica', min: 25000, max: 60000 },
          { key: 'far', label: 'Tablero lejos / acometida nueva', min: 50000, max: 120000 }
        ]
      },
      drain: {
        status: 'estimado',
        source: [],
        label: 'Desague del equipo',
        options: [
          { key: 'ok', label: 'Ya tiene desague', min: 0, max: 0 },
          { key: 'new', label: 'Hay que hacer el desague', min: 8000, max: 25000 }
        ]
      },
      wall: {
        status: 'estimado',
        source: [],
        label: 'Perforacion segun pared',
        options: [
          { key: 'dry', label: 'Durlock o madera', min: 0, max: 8000 },
          { key: 'brick', label: 'Ladrillo / mamposteria', min: 5000, max: 18000 },
          { key: 'concrete', label: 'Losa, hormigon o piedra', min: 15000, max: 45000 }
        ]
      },
      height: {
        status: 'referencia',
        source: ['solvit-2026'],
        label: 'Altura y acceso de la unidad exterior',
        options: [
          { key: 'ground', label: 'Planta baja o patio (sin riesgo)', min: 0, max: 0 },
          { key: 'low', label: '2do o 3er piso', min: 20000, max: 50000 },
          { key: 'high', label: 'Mas de 3er piso (arnés o andamio)', min: 52000, max: 105000 },
          { key: 'rappel', label: 'Rappel / fachada compleja', min: 90000, max: 180000 }
        ]
      },
      zone: {
        status: 'estimado',
        source: [],
        label: 'Zona y traslado',
        options: [
          { key: 'cap10', label: 'Cordoba Capital (hasta 10 km)', min: 0, max: 0 },
          { key: 'cap20', label: 'Cordoba Capital (mas de 10 km)', min: 7000, max: 18000 },
          { key: 'near30', label: 'Alrededores (hasta 30 km)', min: 12000, max: 30000 },
          { key: 'far', label: 'Mas de 30 km', min: 25000, max: 60000 }
        ]
      },
      preinstall: {
        status: 'estimado',
        source: [],
        label: 'Preinstalacion existente (descuenta materiales y parte del trabajo)',
        options: [
          { key: 'no', label: 'Instalacion desde cero', min: 0, max: 0 },
          { key: 'yes', label: 'Ya hay cañeria y cable pasados', min: -70000, max: -30000 }
        ]
      },
      gasCharge: {
        status: 'referencia',
        source: ['solvit-2026'],
        label: 'Carga de gas refrigerante (solo si el diagnostico lo requiere)',
        min: 48000,
        max: 110000
      }
    },

    // ---- AJUSTES ----
    rules: {
      // Descuento por cantidad de equipos en la misma visita (traslado y puesta a punto se comparten).
      volumeDiscount: { 1: 1, 2: 0.92, 3: 0.88, 4: 0.85, 5: 0.83, 6: 0.82 },
      maxQty: 6,
      // Margen de incertidumbre del rango si faltan variables clave.
      uncertaintyPenalty: 0.12,
      // Piso: ningun descuento puede bajar el presupuesto por debajo de este % del trabajo base.
      minFloorRatio: 0.45
    }
  };

  /* ------------------------------------------------------------------ *
   * 3. DEFINICION DE MODULOS E INPUTS
   * ------------------------------------------------------------------ */

  var MODULES = {
    'air-install': {
      label: 'Instalacion de aire acondicionado',
      short: 'Instalacion de aire',
      icon: 'air',
      confirmWith: 'fotos del lugar, ubicacion de las unidades y distancia real entre ellas',
      inputs: ['fg', 'qty', 'pipe', 'pre', 'height', 'elec', 'drain', 'wall', 'zone']
    },
    'air-repair': {
      label: 'Reparacion de aire acondicionado',
      short: 'Reparacion de aire',
      icon: 'wrench',
      confirmWith: 'diagnostico presencial: el sintoma no alcanza para cerrar el precio',
      inputs: ['symptom', 'qty', 'height', 'zone']
    },
    'air-service': {
      label: 'Mantenimiento de aire acondicionado',
      short: 'Mantenimiento de aire',
      icon: 'broom',
      confirmWith: 'cantidad y estado real de los equipos',
      inputs: ['qty', 'height', 'zone']
    },
    'boiler': {
      label: 'Caldera y calefaccion',
      short: 'Caldera',
      icon: 'flame',
      confirmWith: 'marca, modelo y codigo de error del equipo',
      inputs: ['job', 'qty', 'zone']
    }
  };

  /* ------------------------------------------------------------------ *
   * 4. UTILIDADES
   * ------------------------------------------------------------------ */

  var CURRENCY_FORMAT = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  });

  function formatMoney(value) {
    var safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    return CURRENCY_FORMAT.format(Math.round(safe));
  }

  function clampQty(value) {
    var n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    return Math.min(n, CONFIG.rules.maxQty);
  }

  function findOption(group, key) {
    var list = (group && group.options) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return list[0] || { key: '', label: '', min: 0, max: 0 };
  }

  function findTier(key) {
    var tiers = CONFIG.laborAirInstall.tiers;
    for (var i = 0; i < tiers.length; i++) {
      if (tiers[i].key === key) return tiers[i];
    }
    return tiers[1];
  }

  function findJob(key) {
    var jobs = CONFIG.boiler.jobs;
    for (var i = 0; i < jobs.length; i++) {
      if (jobs[i].key === key) return jobs[i];
    }
    return jobs[0];
  }

  function findSymptom(key) {
    var list = CONFIG.repairAir.symptoms;
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return list[list.length - 1];
  }

  function volumeFactor(qty) {
    var table = CONFIG.rules.volumeDiscount;
    return table[qty] || table[table.maxQty] || 1;
  }

  function line(label, detail, min, max, extra) {
    var item = {
      label: label,
      detail: detail || '',
      min: Math.round(min),
      max: Math.round(max)
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) item[k] = extra[k];
      }
    }
    return item;
  }

  /* ------------------------------------------------------------------ *
   * 5. MOTOR
   * ------------------------------------------------------------------ */

  function quote(input) {
    var data = input || {};
    var moduleKey = MODULES[data.mod] ? data.mod : 'air-install';
    var module = MODULES[moduleKey];

    var qty = clampQty(data.qty);
    var vFactor = volumeFactor(qty);
    var lines = [];
    var unsure = [];
    var notes = [];
    var jobs = [];

    if (moduleKey === 'air-install') {
      var tier = findTier(data.fg);
      lines.push(line('Mano de obra', tier.label + ' · ' + qty + (qty === 1 ? ' equipo' : ' equipos'), tier.min * qty, tier.max * qty, { group: 'laborAirInstall' }));

      var pipeMeters = Math.max(0, Math.min(40, parseInt(data.pipe, 10) || 0));
      if (pipeMeters > 0) {
        var p = CONFIG.components.pipePerMeter;
        lines.push(line('Metro extra de cañeria', pipeMeters + ' m sobre los 3 m incluidos', p.min * pipeMeters, p.max * pipeMeters, { group: 'components.pipePerMeter' }));
      } else {
        unsure.push('metros reales de cañeria');
      }

      var kit = CONFIG.components.materialsKit;
      lines.push(line('Kit de materiales', kit.label, kit.min * qty, kit.max * qty, { group: 'components.materialsKit' }));

      var height = findOption(CONFIG.components.height, data.height);
      if (height.min || height.max) {
        lines.push(line('Altura y acceso', height.label, height.min, height.max, { group: 'components.height' }));
      }
      if (!data.height) unsure.push('piso y tipo de acceso al exterior');

      var elec = findOption(CONFIG.components.electrical, data.elec);
      if (elec.min || elec.max) {
        lines.push(line('Conexion electrica', elec.label, elec.min, elec.max, { group: 'components.electrical' }));
      }
      if (!data.elec) unsure.push('estado de la instalacion electrica');

      var drain = findOption(CONFIG.components.drain, data.drain);
      if (drain.min || drain.max) {
        lines.push(line('Desague', drain.label, drain.min, drain.max, { group: 'components.drain' }));
      }

      var wall = findOption(CONFIG.components.wall, data.wall);
      if (data.wall && (wall.min || wall.max)) {
        lines.push(line('Perforacion', wall.label, wall.min * qty, wall.max * qty, { group: 'components.wall' }));
      }
      if (!data.wall) unsure.push('tipo de pared');

      var pre = findOption(CONFIG.components.preinstall, data.pre);
      if (data.pre && (pre.min || pre.max)) {
        // Se descuenta una sola vez: la preinstalacion es del lugar, no de cada equipo.
        lines.push(line('Preinstalacion existente', pre.label, pre.min, pre.max, { group: 'components.preinstall' }));
      }
      if (!data.pre) unsure.push('si ya hay preinstalacion');

      notes.push('Precio de referencia con hasta 3 m de recorrido incluidos.');
      notes.push('No incluye el equipo ni repuestos.');
      if (data.inverter === 'yes') notes.push('Equipo inverter: el mayor costo es del equipo, no de la instalacion.');
    }

    if (moduleKey === 'air-repair') {
      var sym = findSymptom(data.symptom);
      var diag = CONFIG.diagnosis;
      lines.push(line('Visita de diagnostico', diag.label, diag.min, diag.max, { group: 'diagnosis' }));
      lines.push(line('Reparacion estimada', sym.label + ' · ' + qty + (qty === 1 ? ' equipo' : ' equipos'), sym.min * qty, sym.max * qty, { group: 'repairAir' }));
      if (!data.symptom) unsure.push('sintoma principal');
      var gas = CONFIG.components.gasCharge;
      notes.push('Si el diagnostico detecta falta de gas, la carga se cotiza aparte: ' + formatMoney(gas.min) + ' a ' + formatMoney(gas.max) + '.');
      notes.push('La reparacion se confirma recien despues del diagnostico. El rango es orientativo.');
      notes.push('Si hay fuga, primero se repara la fuga y recien despues se carga el gas.');
      jobs = ['Visita de diagnostico', 'Control de presion y fugas', 'Prueba de funcionamiento'];
    }

    if (moduleKey === 'air-service') {
      var svc = CONFIG.serviceAir;
      lines.push(line('Mantenimiento preventivo', svc.label, svc.min * qty, svc.max * qty, { group: 'serviceAir' }));
      notes.push('Incluye limpieza de filtros, serpentina y control de funcionamiento.');
      notes.push('No incluye carga de gas ni repuestos.');
      jobs = ['Retiro y lavado de filtros', 'Limpieza de serpentina', 'Control electrico y de presion'];
    }

    if (moduleKey === 'boiler') {
      var boilerJob = findJob(data.job);
      lines.push(line('Caldera y calefaccion', boilerJob.label, boilerJob.min, boilerJob.max, { group: 'boiler' }));
      if (qty > 1) {
        lines.push(line('Equipos adicionales', qty + ' equipos en la misma visita', boilerJob.min * (qty - 1) * 0.8, boilerJob.max * (qty - 1) * 0.8, { group: 'boiler' }));
      }
      notes.push('Rango estructural: sin referencia de mercado verificada. Se calibra con tus trabajos reales.');
      notes.push('Los repuestos de caldera se cotizan aparte segun marca y modelo.');
      unsure.push('marca, modelo y codigo de error');
      jobs = ['Diagnostico de caldera', 'Control de presion y circulacion', 'Prueba de encendido y agua caliente'];
    }

    var zone = findOption(CONFIG.components.zone, data.zone);
    if (zone.min || zone.max) {
      lines.push(line('Zona y traslado', zone.label, zone.min, zone.max, { group: 'components.zone' }));
    }
    if (!data.zone) unsure.push('zona o barrio');

    // Descuesto por volumen: se aplica solo a mano de obra y kit, no al traslado ni a los materiales por metro.
    if (qty > 1) {
      var discountBase = 0;
      var discountMin = 0;
      var discountMax = 0;
      for (var i = 0; i < lines.length; i++) {
        var g = lines[i].group || '';
        if (g.indexOf('laborAirInstall') === 0 || g.indexOf('serviceAir') === 0 || g.indexOf('components.materialsKit') === 0 || g.indexOf('boiler') === 0) {
          discountMin += lines[i].min;
          discountMax += lines[i].max;
          discountBase += 1;
        }
      }
      if (discountBase > 0 && vFactor < 1) {
        var offMin = discountMin * (1 - vFactor);
        var offMax = discountMax * (1 - vFactor);
        lines.push(line('Descuento por cantidad', qty + ' equipos en la misma visita', -offMin, -offMax, { group: 'rules.volumeDiscount' }));
        notes.push('El descuento por cantidad aplica al compartir la misma visita.');
      }
    }

    var totalMin = 0;
    var totalMax = 0;
    var coreMin = 0;
    var coreGroups = ['laborAirInstall', 'repairAir', 'serviceAir', 'diagnosis', 'boiler', 'components.materialsKit', 'components.wall', 'components.electrical', 'components.drain', 'components.height'];
    for (var j = 0; j < lines.length; j++) {
      totalMin += lines[j].min;
      totalMax += lines[j].max;
      var group = lines[j].group || '';
      for (var c = 0; c < coreGroups.length; c++) {
        if (group === coreGroups[c] && lines[j].min > 0) coreMin += lines[j].min;
      }
    }

    // Piso de seguridad: ningun descuento (preinstalacion o volumen) puede
    // dejar el presupuesto por debajo de una fraccion del trabajo base.
    var floor = Math.round(coreMin * CONFIG.rules.minFloorRatio);
    if (totalMin < floor) totalMin = floor;
    if (totalMax < totalMin) totalMax = totalMin;

    // Confianza: cuantas variables clave faltan.
    var totalInputs = module.inputs.length;
    var answered = totalInputs - unsure.length;
    var ratio = totalInputs > 0 ? answered / totalInputs : 1;
    var level = ratio >= 0.9 ? 'alta' : ratio >= 0.65 ? 'media' : 'baja';
    var levelLabel = level === 'alta' ? 'Presupuesto bien encaminado' : level === 'media' ? 'Buen avance' : 'Falta contexto';

    if (level !== 'alta') {
      var widen = CONFIG.rules.uncertaintyPenalty;
      totalMax = Math.round(totalMax * (1 + widen));
    }

    return {
      ok: true,
      id: buildQuoteId(moduleKey),
      module: moduleKey,
      moduleLabel: module.label,
      moduleShort: module.short,
      icon: module.icon,
      input: data,
      qty: qty,
      currency: CONFIG.currency,
      version: CONFIG.version,
      lines: lines,
      jobs: jobs,
      total: { min: totalMin, max: totalMax },
      totalLabel: formatMoney(totalMin) + ' a ' + formatMoney(totalMax),
      simpleLabel: qty > 1 ? 'Total estimado para ' + qty + ' equipos' : 'Total estimado',
      confidence: { level: level, label: levelLabel, missing: unsure },
      confirmWith: module.confirmWith,
      notes: notes,
      disclaimer: 'Presupuesto estimado y orientativo. Se confirma despues de ver el lugar o el equipo.'
    };
  }

  function buildQuoteId(moduleKey) {
    var now = new Date();
    var stamp = [
      String(now.getFullYear()).slice(-2),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('');
    var suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    return 'P-' + moduleKey.replace('air-', 'A').replace('boiler', 'C').toUpperCase().slice(0, 4) + '-' + stamp + '-' + suffix;
  }

  /* ------------------------------------------------------------------ *
   * 6. SHARE / DEEP LINK
   * ------------------------------------------------------------------ */

  function encodeInput(input) {
    var params = new URLSearchParams();
    var keys = Object.keys(input || {});
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = input[k];
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    return params.toString();
  }

  function decodeInput(search) {
    var params = new URLSearchParams(search || '');
    var out = {};
    params.forEach(function (value, key) {
      out[key] = value;
    });
    return out;
  }

  return {
    CONFIG: CONFIG,
    SOURCES: SOURCES,
    MODULES: MODULES,
    quote: quote,
    formatMoney: formatMoney,
    encodeInput: encodeInput,
    decodeInput: decodeInput,
    findOption: findOption,
    findTier: findTier,
    findJob: findJob,
    findSymptom: findSymptom
  };
});
