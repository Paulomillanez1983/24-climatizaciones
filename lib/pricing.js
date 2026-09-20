/**
 * 24 Climatizaciones - Motor de presupuesto parametrico
 * =====================================================
 *
 * POR QUE NO HAY UNA LISTA DE PRECIOS FIJA
 * No existe "el precio de instalar un aire". Existe un precio que se ARMA
 * sumando componentes medibles. Dos instalaciones del mismo equipo de 3.000
 * frigorias pueden costar muy distinto segun los metros de cañeria, el piso,
 * la pared, si hay toma electrica o la distancia.
 *
 * POR QUE DEVUELVE UN PRECIO Y NO UN RANGO ANCHO
 * La version anterior sumaba todos los minimos por un lado y todos los maximos
 * por el otro. Eso COMPONE la incertidumbre en vez de resolverla, y producia
 * rangos inutiles (por ejemplo "$141.000 a $311.000" para un mismo trabajo).
 *
 * Ahora cada componente es un VALOR CENTRAL con una dispersion relativa, y las
 * dispersiones se combinan como varianzas (en cuadratura):
 *
 *     sigma_total = raiz( suma( (valor_i * dispersion_i)^2 ) )
 *
 * Es el resultado correcto cuando las fuentes de variacion son independientes.
 * Da un precio concreto con un margen chico y creible.
 *
 * PRECISION
 * La incertidumbre baja cuando el cliente contesta las variables. Cada variable
 * sin responder se asume con un valor tipico y una dispersion mucho mayor, y se
 * informa cual falta. Por eso el margen se achica a medida que se responde.
 *
 * INFLACION
 * Los precios estan expresados a una fecha base. El indice IPC Nacional (INDEC)
 * se aplica como factor, asi que los valores se actualizan solos sin editar el
 * archivo. Ver /api/pricing-index.
 *
 * CALIBRACION
 * Cada item declara `value` (pesos a la fecha base) y `spread` (dispersion
 * relativa). Es el unico lugar a editar: se usa igual en Node y en el navegador.
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
    },
    {
      id: 'indec-ipc',
      label: 'INDEC - Indice de Precios al Consumidor Nacional (base dic 2016)',
      url: 'https://datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26',
      updated: '2026-08-01'
    }
  ];

  /* ------------------------------------------------------------------ *
   * 2. CONFIGURACION  (UNICO LUGAR A EDITAR)
   *
   * value  : pesos a la fecha base, con el margen de la empresa incluido
   * spread : dispersion relativa esperada en un trabajo concreto
   *          (0.12 = +/-12%). No es "cuanto varia el mercado" sino
   *          "cuanto puede variar este trabajo puntual".
   * ------------------------------------------------------------------ */

  var CONFIG = {
    version: '2026.10',
    currency: 'ARS',
    reviewAfter: '2027-03-31',

    // Los precios de abajo estan a esta fecha. El factor de inflacion se aplica
    // sobre esta base (ver seccion 4).
    inflation: {
      baseDate: '2026-07-01',
      baseIndex: 12076.3937,
      seriesId: '148.3_INIVELNAL_DICI_M_26',
      // Ultimo valor conocido, por si la API no responde. Se actualiza a mano
      // cuando se toca este archivo, para que el sitio nunca quede sin precio.
      fallbackDate: '2026-08-01',
      fallbackIndex: 12276.766,
      // Techo de seguridad: un error de la API no puede multiplicar los precios.
      maxFactor: 2.5
    },

    // --- AIRE ACONDICIONADO: INSTALACION ---
    laborAir: {
      status: 'referencia',
      source: ['solvit-2026', 'tegu-2026', 'todoresuelto-2026'],
      label: 'Mano de obra de instalacion',
      detail: 'Incluye hasta 3 m de recorrido y la puesta en marcha.',
      tiers: [
        { key: '2200', label: 'Hasta 2.200 frigorias', value: 110000, spread: 0.12 },
        { key: '3000', label: '3.000 a 3.500 frigorias', value: 140000, spread: 0.13 },
        { key: '4500', label: '4.500 a 5.500 frigorias', value: 170000, spread: 0.14 },
        { key: '6000', label: '6.000 o mas / piso-techo / cassette', value: 240000, spread: 0.16 }
      ]
    },

    // --- AIRE ACONDICIONADO: REPARACION ---
    // Aca la honestidad manda: sin diagnostico presencial no hay precision
    // posible. Se informa la visita con precision y el valor probable aparte.
    repairAir: {
      status: 'estimado',
      source: ['solvit-2026'],
      label: 'Reparacion segun sintoma',
      symptoms: [
        { key: 'nofrio', label: 'No enfria / no calienta', value: 90000, spread: 0.32 },
        { key: 'agua', label: 'Pierde agua o gotea', value: 68000, spread: 0.30 },
        { key: 'ruido', label: 'Hace ruido o vibra', value: 85000, spread: 0.32 },
        { key: 'noenciende', label: 'No enciende o se apaga solo', value: 95000, spread: 0.33 },
        { key: 'error', label: 'Muestra codigo de error', value: 100000, spread: 0.35 },
        { key: 'nose', label: 'No se que tiene', value: 58000, spread: 0.35 }
      ]
    },

    serviceAir: {
      status: 'estimado',
      source: ['solvit-2026'],
      label: 'Mantenimiento preventivo por equipo',
      detail: 'Limpieza de filtros y serpentina, control electrico y de presion.',
      value: 50000,
      spread: 0.15
    },

    diagnosis: {
      status: 'estimado',
      source: ['solvit-2026'],
      label: 'Visita de diagnostico',
      detail: 'Se descuenta del trabajo si aceptas la reparacion.',
      value: 42000,
      spread: 0.18
    },

    boiler: {
      status: 'estimado',
      source: [],
      label: 'Caldera y calefaccion',
      note: 'Sin fuente de mercado verificada para Cordoba. Calibrar con trabajos reales.',
      jobs: [
        { key: 'service', label: 'Service anual de caldera', value: 68000, spread: 0.22 },
        { key: 'repair', label: 'Reparacion de caldera', value: 110000, spread: 0.30 },
        { key: 'pressure', label: 'Pierde presion / carga del circuito', value: 75000, spread: 0.28 },
        { key: 'radiators', label: 'Radiadores frios / purgado', value: 60000, spread: 0.25 },
        { key: 'nocold', label: 'No calienta / no da agua caliente', value: 100000, spread: 0.30 }
      ]
    },

    // --- COMPONENTES ---
    components: {
      pipePerMeter: {
        status: 'referencia',
        source: ['solvit-2026'],
        label: 'Metro extra de cañeria',
        value: 7500,
        spread: 0.15
      },
      materialsKit: {
        status: 'referencia',
        source: ['solvit-2026'],
        label: 'Kit de materiales',
        detail: 'Ménsula, aislante, cable, cinta y conectores.',
        value: 52000,
        spread: 0.18
      },
      gasCharge: {
        status: 'referencia',
        source: ['solvit-2026'],
        label: 'Carga de gas refrigerante',
        detail: 'Se cotiza aparte, solo si el diagnostico detecta falta de refrigerante.',
        value: 76000,
        spread: 0.20
      },
      height: {
        status: 'referencia',
        source: ['solvit-2026'],
        label: 'Altura y acceso de la unidad exterior',
        options: [
          { key: 'ground', label: 'Planta baja o patio', detail: 'Sin riesgo', value: 0, spread: 0 },
          { key: 'low', label: '2do o 3er piso', detail: 'Escalera o balcon', value: 34000, spread: 0.20 },
          { key: 'high', label: 'Mas de 3er piso', detail: 'Requiere arnés o andamio', value: 75000, spread: 0.20 },
          { key: 'rappel', label: 'Rappel / fachada compleja', detail: 'Trabajo vertical', value: 130000, spread: 0.22 }
        ]
      },
      electrical: {
        status: 'estimado',
        source: [],
        label: 'Conexion electrica',
        options: [
          { key: 'ok', label: 'Toma existente', detail: 'Ya hay linea y térmica', value: 0, spread: 0 },
          { key: 'new', label: 'Linea nueva + térmica', detail: 'Hay que hacerla', value: 40000, spread: 0.20 },
          { key: 'far', label: 'Tablero lejos', detail: 'Acometida nueva', value: 80000, spread: 0.22 }
        ]
      },
      drain: {
        status: 'estimado',
        source: [],
        label: 'Desague',
        options: [
          { key: 'ok', label: 'Ya tiene desague', value: 0, spread: 0 },
          { key: 'new', label: 'Hay que hacerlo', value: 15000, spread: 0.22 }
        ]
      },
      wall: {
        status: 'estimado',
        source: [],
        label: 'Perforacion segun pared',
        options: [
          { key: 'dry', label: 'Durlock o madera', value: 4000, spread: 0.40 },
          { key: 'brick', label: 'Ladrillo', value: 11000, spread: 0.25 },
          { key: 'concrete', label: 'Losa u hormigon', value: 28000, spread: 0.25 }
        ]
      },
      zone: {
        status: 'estimado',
        source: [],
        label: 'Zona y traslado',
        options: [
          { key: 'cap10', label: 'Cordoba Capital, hasta 10 km', value: 0, spread: 0 },
          { key: 'cap20', label: 'Cordoba Capital, mas de 10 km', value: 12000, spread: 0.20 },
          { key: 'near30', label: 'Alrededores hasta 30 km', value: 20000, spread: 0.22 },
          { key: 'far', label: 'Mas de 30 km', value: 40000, spread: 0.25 }
        ]
      },
      preinstall: {
        status: 'estimado',
        source: [],
        label: 'Preinstalacion existente',
        detail: 'Descuenta materiales y parte del trabajo de cañeria. Se descuenta una sola vez.',
        options: [
          { key: 'no', label: 'Instalacion desde cero', value: 0, spread: 0 },
          { key: 'yes', label: 'Ya hay cañeria y cable', value: -50000, spread: 0.20 }
        ]
      }
    },

    // --- AJUSTES ---
    rules: {
      volumeDiscount: { 1: 1, 2: 0.93, 3: 0.89, 4: 0.86, 5: 0.84, 6: 0.83 },
      maxQty: 6,
      // El margen nunca baja de estos pisos: reclamar precision absoluta
      // seria vender algo que no se puede sostener.
      minSpreadPercent: 0.04,
      minSpreadAmount: 8000,
      // Variables sin responder: se asume el caso tipico y el margen se amplia.
      assumed: {
        pipe: { value: 5, spreadBoost: 0.55 },
        height: { key: 'low', spreadBoost: 0.50 },
        elec: { key: 'ok', spreadBoost: 0.75 },
        drain: { key: 'ok', spreadBoost: 0.70 },
        wall: { key: 'brick', spreadBoost: 0.50 },
        zone: { key: 'cap10', spreadBoost: 0.60 },
        pre: { key: 'no', spreadBoost: 0.50 },
        fg: { spreadBoost: 0.20 }
      }
    }
  };

  /* ------------------------------------------------------------------ *
   * 3. MODULOS
   * ------------------------------------------------------------------ */

  var MODULES = {
    'air-install': {
      label: 'Instalacion de aire acondicionado',
      short: 'Instalacion de aire',
      icon: 'air',
      confirmWith: 'las fotos del lugar y la distancia real entre las unidades',
      inputs: ['fg', 'qty', 'pipe', 'pre', 'height', 'elec', 'drain', 'wall', 'zone']
    },
    'air-repair': {
      label: 'Reparacion de aire acondicionado',
      short: 'Reparacion de aire',
      icon: 'wrench',
      confirmWith: 'el diagnostico presencial',
      inputs: ['symptom', 'qty', 'height', 'zone']
    },
    'air-service': {
      label: 'Mantenimiento de aire acondicionado',
      short: 'Mantenimiento de aire',
      icon: 'broom',
      confirmWith: 'la cantidad y el estado real de los equipos',
      inputs: ['qty', 'height', 'zone']
    },
    'boiler': {
      label: 'Caldera y calefaccion',
      short: 'Caldera',
      icon: 'flame',
      confirmWith: 'la marca, el modelo y el codigo de error',
      inputs: ['job', 'qty', 'zone']
    }
  };

  /* ------------------------------------------------------------------ *
   * 4. INFLACION (INDEC - IPC Nacional)
   * ------------------------------------------------------------------ */

  var inflation = { index: 0, date: '', factor: 1, source: 'fallback' };

  function computeFactor(index) {
    var base = CONFIG.inflation.baseIndex;
    if (!Number.isFinite(index) || index <= 0 || !Number.isFinite(base) || base <= 0) return 1;
    var factor = index / base;
    if (factor < 0.5) return 0.5;
    return Math.min(factor, CONFIG.inflation.maxFactor);
  }

  function setInflation(payload) {
    var index = payload && Number(payload.index);
    if (Number.isFinite(index) && index > 0) {
      inflation.index = index;
      inflation.date = payload.date || inflation.date;
      inflation.factor = computeFactor(index);
      inflation.source = 'live';
      return inflation;
    }
    return resetInflation();
  }

  function resetInflation() {
    inflation.index = CONFIG.inflation.fallbackIndex;
    inflation.date = CONFIG.inflation.fallbackDate;
    inflation.factor = computeFactor(CONFIG.inflation.fallbackIndex);
    inflation.source = 'fallback';
    return inflation;
  }

  resetInflation();

  function getInflation() {
    return {
      factor: inflation.factor,
      index: inflation.index,
      date: inflation.date,
      source: inflation.source,
      baseDate: CONFIG.inflation.baseDate,
      baseIndex: CONFIG.inflation.baseIndex,
      percent: Math.round((inflation.factor - 1) * 1000) / 10,
      seriesId: CONFIG.inflation.seriesId
    };
  }

  // Aplica inflacion a un valor en pesos.
  function money(value) {
    return Math.round((Number(value) || 0) * inflation.factor);
  }

  /* ------------------------------------------------------------------ *
   * 5. UTILIDADES
   * ------------------------------------------------------------------ */

  var CURRENCY = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  });

  var NUMBER = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

  function formatMoney(value) {
    var safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    return CURRENCY.format(Math.round(safe));
  }

  function formatNumber(value) {
    return NUMBER.format(Math.round(Number(value) || 0));
  }

  // Redondeo comercial a la centena: un precio de $186.347 se lee como
  // calculadora; $186.000 se lee como presupuesto.
  function roundTo(value, step) {
    var unit = step || 1000;
    return Math.round(Number(value) / unit) * unit;
  }

  function clampQty(value) {
    var n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    return Math.min(n, CONFIG.rules.maxQty);
  }

  function findIn(list, key) {
    if (!Array.isArray(list)) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return null;
  }

  function findOption(group, key) {
    var list = (group && group.options) || [];
    return findIn(list, key) || list[0] || null;
  }

  function findTier(key) {
    return findIn(CONFIG.laborAir.tiers, key) || CONFIG.laborAir.tiers[1];
  }

  function findSymptom(key) {
    var list = CONFIG.repairAir.symptoms;
    return findIn(list, key) || list[list.length - 1];
  }

  function findJob(key) {
    var list = CONFIG.boiler.jobs;
    return findIn(list, key) || list[0];
  }

  function volumeFactor(qty) {
    var table = CONFIG.rules.volumeDiscount;
    return table[qty] || table[1] || 1;
  }

  /* ------------------------------------------------------------------ *
   * 6. MOTOR
   *
   * Cada linea aporta un valor central y una varianza. El total suma los
   * valores; el margen sale de la raiz de la suma de varianzas.
   * ------------------------------------------------------------------ */

  function quote(input) {
    var data = input || {};
    var moduleKey = MODULES[data.mod] ? data.mod : 'air-install';
    var module = MODULES[moduleKey];
    var qty = clampQty(data.qty);
    var vFactor = volumeFactor(qty);

    var lines = [];
    var variance = 0;
    var missing = [];
    var assumptions = [];
    var notes = [];
    var tasks = [];
    var repairEstimate = null;

    function addLine(label, detail, rawValue, spread, extra) {
      // Se redondea cada concepto a la centena mas cercana: un presupuesto con
      // "$142.323" se lee como calculadora, no como presupuesto.
      var value = roundTo(money(rawValue), 500);
      var sigma = Math.abs(value) * (Number(spread) || 0);
      variance += sigma * sigma;
      var item = { label: label, detail: detail || '', value: value };
      if (extra) {
        for (var k in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, k)) item[k] = extra[k];
        }
      }
      lines.push(item);
      return item;
    }

    // Resuelve una variable de opcion. Si el cliente no la contesto, se usa el
    // caso tipico con margen ampliado y queda anotada como supuesto.
    function resolveOption(groupName, answerKey, question) {
      var group = CONFIG.components[groupName];
      var answered = !!data[answerKey];
      var assumed = CONFIG.rules.assumed[answerKey];
      var key = answered ? data[answerKey] : assumed.key;
      var option = findOption(group, key);
      if (!answered) {
        missing.push(question);
        assumptions.push(option.label.toLowerCase());
      }
      var spread = answered ? option.spread : Math.max(option.spread, assumed.spreadBoost);
      return { option: option, answered: answered, spread: spread };
    }

    if (moduleKey === 'air-install') {
      var tierAnswered = !!data.fg;
      var tier = findTier(data.fg);
      if (!tierAnswered) missing.push('la potencia del equipo');
      addLine('Mano de obra', tier.label + ' · ' + qty + (qty === 1 ? ' equipo' : ' equipos'),
        tier.value * qty,
        tierAnswered ? tier.spread : tier.spread + CONFIG.rules.assumed.fg.spreadBoost,
        { group: 'labor', base: true });

      // Los 3 primeros metros de cañeria van incluidos en la mano de obra.
      var pipeAnswered = data.pipe !== undefined && data.pipe !== '' && data.pipe !== null;
      var pipeMeters = pipeAnswered ? Math.max(0, Math.min(40, parseInt(data.pipe, 10) || 0)) : CONFIG.rules.assumed.pipe.value;
      var extraMeters = Math.max(0, pipeMeters - 3);
      var pipe = CONFIG.components.pipePerMeter;
      if (extraMeters > 0) {
        addLine('Cañeria extra', extraMeters + ' m sobre los 3 m incluidos',
          pipe.value * extraMeters,
          pipeAnswered ? pipe.spread : pipe.spread + CONFIG.rules.assumed.pipe.spreadBoost,
          { group: 'pipe' });
      }
      if (!pipeAnswered) {
        missing.push('los metros entre las dos unidades');
        assumptions.push('asumimos ' + pipeMeters + ' m de recorrido');
      }

      var kit = CONFIG.components.materialsKit;
      addLine(kit.label, kit.detail, kit.value * qty, kit.spread, { group: 'kit', base: true });

      var height = resolveOption('height', 'height', 'el piso de la unidad exterior');
      if (height.option.value) {
        addLine('Altura y acceso', height.option.label, height.option.value, height.spread, { group: 'height' });
      }

      var elec = resolveOption('electrical', 'elec', 'si hay toma electrica cerca');
      if (elec.option.value) {
        addLine('Conexion electrica', elec.option.label, elec.option.value, elec.spread, { group: 'electrical' });
      }

      var drain = resolveOption('drain', 'drain', 'si hace falta desague');
      if (drain.option.value) {
        addLine('Desague', drain.option.label, drain.option.value, drain.spread, { group: 'drain' });
      }

      var wall = resolveOption('wall', 'wall', 'de que es la pared');
      if (wall.option.value) {
        addLine('Perforacion', wall.option.label, wall.option.value * qty, wall.spread, { group: 'wall' });
      }

      var pre = resolveOption('preinstall', 'pre', 'si ya hay preinstalacion');
      if (pre.option.value) {
        addLine('Preinstalacion existente', pre.option.label, pre.option.value, pre.spread, { group: 'preinstall' });
      }

      notes.push('Incluye hasta 3 m de recorrido y la puesta en marcha.');
      notes.push('No incluye el equipo ni repuestos.');
      tasks = ['Replanteo y ubicacion de las unidades', 'Perforacion y tendido de cañeria', 'Vacio, conexion y puesta en marcha', 'Prueba de funcionamiento'];
    }

    if (moduleKey === 'air-repair') {
      var diag = CONFIG.diagnosis;
      addLine(diag.label, diag.detail, diag.value, diag.spread, { group: 'diagnosis', base: true });

      var symptomAnswered = !!data.symptom;
      var sym = findSymptom(data.symptom);
      if (!symptomAnswered) missing.push('que le pasa al equipo');
      var symSpread = symptomAnswered ? sym.spread : sym.spread + 0.1;
      repairEstimate = {
        label: sym.label,
        low: roundTo(money(sym.value * (1 - symSpread)), 500),
        high: roundTo(money(sym.value * (1 + symSpread)), 500),
        value: roundTo(money(sym.value * qty), 500)
      };

      var gas = CONFIG.components.gasCharge;
      notes.push('El trabajo se cierra en el diagnostico: segun el sintoma, lo probable es ' + formatMoney(repairEstimate.low) + ' a ' + formatMoney(repairEstimate.high) + '.');
      notes.push('Si falta gas, la carga se cotiza aparte: alrededor de ' + formatMoney(money(gas.value)) + '.');
      notes.push('Se te pasa el presupuesto cerrado antes de tocar nada.');
      tasks = ['Visita de diagnostico', 'Control de presion y deteccion de fugas', 'Presupuesto cerrado antes de reparar'];
    }

    if (moduleKey === 'air-service') {
      var svc = CONFIG.serviceAir;
      addLine(svc.label, qty + (qty === 1 ? ' equipo' : ' equipos'), svc.value * qty, svc.spread, { group: 'service', base: true });
      notes.push('Incluye limpieza de filtros y serpentina, y control de funcionamiento.');
      notes.push('No incluye carga de gas ni repuestos.');
      tasks = ['Retiro y lavado de filtros', 'Limpieza de serpentina', 'Control electrico y de presion'];
    }

    if (moduleKey === 'boiler') {
      var jobAnswered = !!data.job;
      var job = findJob(data.job);
      if (!jobAnswered) missing.push('que necesita la caldera');
      addLine(job.label, qty + (qty === 1 ? ' equipo' : ' equipos'), job.value,
        jobAnswered ? job.spread : job.spread + 0.15, { group: 'boiler', base: true });
      if (qty > 1) {
        addLine('Equipos adicionales', (qty - 1) + ' en la misma visita', job.value * (qty - 1) * 0.8, job.spread + 0.1, { group: 'boiler' });
      }
      notes.push('Los repuestos de caldera se cotizan aparte segun marca y modelo.');
      if (!CONFIG.boiler.source.length) notes.push('Valor en calibracion: se ajusta con los trabajos reales.');
      tasks = ['Diagnostico de caldera', 'Control de presion y circulacion', 'Prueba de encendido y agua caliente'];
    }

    // Traslado (todos los modulos).
    var zone = resolveOption('zone', 'zone', 'la zona o el barrio');
    if (zone.option.value) {
      addLine('Zona y traslado', zone.option.label, zone.option.value, zone.spread, { group: 'zone' });
    }

    // Descuento por cantidad: se aplica a los conceptos que se comparten.
    var discount = 0;
    if (qty > 1 && vFactor < 1) {
      var shared = 0;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].base) shared += lines[i].value;
      }
      discount = Math.round(shared * (1 - vFactor));
      if (discount > 0) {
        // El descuento tambien achica la varianza de los conceptos compartidos.
        variance *= vFactor * vFactor;
        lines.push({ label: 'Descuento por cantidad', detail: qty + ' equipos en la misma visita', value: -discount, group: 'discount' });
        notes.push('El descuento por cantidad aplica a los equipos que comparten la misma visita.');
      }
    }

    // --- Total y margen ---
    var total = 0;
    var biggest = -1;
    var biggestAbs = 0;
    for (var j = 0; j < lines.length; j++) {
      total += lines[j].value;
      if (Math.abs(lines[j].value) > biggestAbs) {
        biggestAbs = Math.abs(lines[j].value);
        biggest = j;
      }
    }

    // El desglose tiene que sumar exactamente el total mostrado: si el cliente
    // suma las lineas y no le da, pierde la confianza en todo el presupuesto.
    // El ajuste de redondeo se absorbe en el concepto mas grande.
    var estimate = roundTo(total, 1000);
    if (biggest >= 0 && estimate !== total) {
      lines[biggest].value += estimate - total;
      total = estimate;
    }

    var sigma = Math.sqrt(variance);
    var minHalf = Math.max(total * CONFIG.rules.minSpreadPercent, CONFIG.rules.minSpreadAmount);
    var half = Math.max(sigma, minHalf);
    half = Math.ceil(half / 1000) * 1000;

    var low = Math.max(0, estimate - half);
    var high = estimate + half;
    var percent = estimate > 0 ? (half / estimate) * 100 : 0;

    // El nivel no depende solo del margen: un margen ancho porque falta un dato
    // es accionable ("responde y se afina"); un margen ancho porque el trabajo
    // es intrinsecamente incierto (una reparacion sin diagnostico) no lo es.
    var improvable = missing.length > 0;
    var level = percent <= 12 ? 'alta' : percent <= 20 ? 'media' : 'baja';
    var levelLabel = level === 'alta' ? 'Presupuesto preciso'
      : level === 'media' ? 'Presupuesto orientativo'
        : improvable ? 'Responde y lo afinamos' : 'Valor orientativo';

    for (var k = 0; k < lines.length; k++) {
      lines[k].share = total > 0 ? Math.abs(lines[k].value) / total : 0;
    }

    return {
      ok: true,
      id: buildQuoteId(moduleKey),
      module: moduleKey,
      moduleLabel: module.label,
      moduleShort: module.short,
      icon: module.icon,
      qty: qty,
      currency: CONFIG.currency,
      version: CONFIG.version,
      lines: lines,
      tasks: tasks,
      discount: discount,

      // El numero que se muestra grande.
      estimate: estimate,
      estimateLabel: formatMoney(estimate),

      // El margen, en pesos y en porcentaje.
      margin: {
        low: low,
        high: high,
        half: half,
        percent: Math.round(percent * 10) / 10,
        label: formatMoney(low) + ' a ' + formatMoney(high),
        shortLabel: '+/- ' + formatMoney(half)
      },

      precision: {
        level: level,
        label: levelLabel,
        percent: Math.round(percent * 10) / 10,
        missing: missing.slice(0, 5),
        improvable: improvable
      },

      // En reparaciones el precio del trabajo se cierra en el diagnostico.
      repairEstimate: repairEstimate,

      inflation: getInflation(),
      assumptions: assumptions,
      confirmWith: module.confirmWith,
      notes: notes,
      disclaimer: 'Precio estimado para tu caso. Se confirma con el tecnico antes de empezar.'
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
    var prefix = moduleKey === 'air-install' ? 'AI' : moduleKey === 'air-repair' ? 'AR' : moduleKey === 'air-service' ? 'AM' : 'CA';
    return 'P-' + prefix + '-' + stamp + '-' + suffix;
  }

  /* ------------------------------------------------------------------ *
   * 7. LINK COMPARTIBLE
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
    params.forEach(function (value, key) { out[key] = value; });
    return out;
  }

  return {
    CONFIG: CONFIG,
    SOURCES: SOURCES,
    MODULES: MODULES,
    quote: quote,
    formatMoney: formatMoney,
    formatNumber: formatNumber,
    setInflation: setInflation,
    resetInflation: resetInflation,
    getInflation: getInflation,
    encodeInput: encodeInput,
    decodeInput: decodeInput,
    findOption: findOption,
    findTier: findTier,
    findJob: findJob,
    findSymptom: findSymptom
  };
});
