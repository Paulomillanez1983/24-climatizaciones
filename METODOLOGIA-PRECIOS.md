# Metodología de presupuestos

Cómo se pasa de "no sé cuánto cobrar" a un precio concreto que se puede defender.

## El problema, en orden

**Primero:** no existe "el precio de instalar un aire". Dos instalaciones del mismo equipo de 3.000 frigorías pueden salir muy distinto según los metros de cañería, el piso, el tipo de pared, si hay toma eléctrica o la distancia. Una lista de precios fija no sirve.

**Segundo, y más importante:** un rango ancho tampoco sirve. Si a un cliente le decís "$141.000 a $311.000", no le dijiste nada. Un rango que abarca el triple es una forma elegante de no comprometerse.

Entonces el objetivo no es "dar un rango" sino **dar un precio con un margen chico y honesto**.

## Cómo se arma el precio

El precio se construye sumando componentes medibles:

```text
trabajo    = mano_de_obra(frigorías) × cantidad
cañería    = (metros_reales − 3) × precio_por_metro
altura     = según piso y tipo de acceso
instalación= eléctrico + desagüe + perforación de pared
traslado   = según distancia desde la base
descuentos = preinstalación existente + cantidad de equipos
─────────────────────────────────────────────────────────────
precio     = trabajo + cañería + altura + instalación + traslado − descuentos
```

Cada concepto cumple dos condiciones: **es medible** (el técnico lo mide, o el cliente lo responde con una pregunta cerrada) y **es editable** (cambiar un valor no rompe nada más).

## Por qué el margen es chico (el cambio de fondo)

La versión anterior sumaba todos los mínimos por un lado y todos los máximos por el otro. Ese método **compone** la incertidumbre en lugar de resolverla: si cada concepto varía un 15%, el rango resultante varía un 35% o más. Es matemáticamente incorrecto y producía presupuestos inútiles.

Ahora cada concepto es un **valor central** con una **dispersión relativa**, y las dispersiones se combinan como varianzas:

$$\sigma_{total} = \sqrt{\sum_i (valor_i \times dispersión_i)^2}$$

Es la fórmula correcta cuando las fuentes de variación son independientes, que es el caso: que la cañería salga más larga no tiene nada que ver con que el tablero esté lejos.

El resultado es un precio central con un margen acotado.

### El cambio, medido

Mismo trabajo, mismo equipo, con todos los datos respondidos:

| | Antes | Ahora |
|---|---|---|
| Instalación simple (3 m, planta baja) | $141.000 a $311.000 — **±38%** | **$200.000 ± 10,5%** |
| Instalación con 6 m, 2º piso, línea nueva | $222.000 a $466.000 — **±35%** | **$305.000 ± 7,9%** |

El precio central subió respecto del mínimo anterior porque antes se usaban los mínimos de mercado, que eran optimistas. Ahora se usa el valor típico real.

## El margen es información, no un colchón

El margen que ve el cliente es la incertidumbre real de ese trabajo. Hay dos fuentes:

**1. Dispersión propia de cada concepto.** Materiales, altura y eléctrico varían más que la mano de obra. Cada uno tiene su dispersión declarada en la configuración.

**2. Datos que faltan.** Es la fuente grande. Cuando el cliente no responde algo, el motor asume el caso típico con una dispersión mucho mayor y **lo informa**. Por eso el margen se achica a medida que se responde: se ve en la página, en el medidor de precisión.

| Situación | Margen |
|---|---|
| Todas las preguntas respondidas | menos del 12% |
| Falta la potencia del equipo | ~15% |
| No respondió nada | ~21% |

El nivel se informa con una etiqueta que distingue dos casos que no son lo mismo:

- **"Presupuesto preciso"** — margen chico.
- **"Presupuesto orientativo"** — margen medio.
- **"Responde y lo afinamos"** — margen ancho *porque falta un dato*. Es accionable.
- **"Valor orientativo"** — margen ancho porque el trabajo es intrínsecamente incierto. No se arregla respondiendo más.

Esa última distinción importa: un service de caldera tiene margen ancho aunque el cliente responda todo, porque los valores están en calibración. Decirle "faltan datos" sería mentir.

## Los precios se actualizan solos por inflación

Los valores base están expresados a una fecha. El motor los ajusta con el **Índice de Precios al Consumidor Nacional (INDEC, base dic-2016)**, que se consulta desde la API de series de tiempo de `datos.gob.ar`:

```text
GET https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&format=json&last=2
```

Ese pedido lo hace `/api/pricing-index`, que lo cachea 6 horas en el borde (el dato es mensual, no hace falta más) y devuelve el índice, la fecha y la variación mensual.

```text
precio_actual = valor_base × (indice_actual / indice_base)
```

Lo importante son los tres resguardos:

1. **Si la API no responde, el sitio no se queda sin precios.** El motor tiene guardado el último valor conocido y arranca con él.
2. **Hay un techo de seguridad.** Un error de la fuente no puede multiplicar los precios por diez: el factor se topa en 2,5.
3. **La fecha del dato se muestra.** Abajo del precio figura "Actualizado por inflación · INDEC, agosto de 2026". El cliente sabe con qué valor se calculó, y vos también.

Consecuencia práctica: **no hay que tocar el archivo todos los meses**. Solo cuando quieras ajustar el margen comercial o calibrar con trabajos reales.

## Dónde se editan los precios

**Un solo archivo: `lib/pricing.js`**, en el objeto `CONFIG`.

Cada ítem declara:

```js
{ key: '3000', label: '3.000 a 3.500 frigorias', value: 140000, spread: 0.13 }
```

- `value` — pesos a la fecha base (`CONFIG.inflation.baseDate`)
- `spread` — dispersión esperada en un trabajo concreto (0,13 = ±13%)

Ese archivo se usa igual en el navegador y en el servidor. No hay copias.

### Ajustar el margen comercial

Si querés ganar más o menos, cambiá los `value`. Si querés un margen más apretado porque conocés bien tus costos, bajá los `spread`.

Los valores por defecto son **de mercado**, no tuyos: son un punto de partida. Los de caldera están marcados `estimado` porque no hay fuente verificada.

### Calibrar con trabajos reales

Es el paso que hace que el sistema sirva de verdad:

1. Cerrá 5 o 6 trabajos con el flujo nuevo.
2. En cada uno, mirá cuánto había estimado el motor y cuánto cobraste.
3. Si el motor queda corto o largo **siempre en el mismo concepto**, corregí ese `value`. Si varía mucho de un trabajo a otro, subí ese `spread`.
4. `npm run check:prices` para verificar que todo siga coherente.

Con 5 trabajos reales la precisión mejora muchísimo, porque el error suele concentrarse en un concepto (normalmente altura o metros de cañería).

## Las reparaciones son un caso aparte

Sin ver el equipo, nadie puede saber qué tiene. Dar un precio exacto de reparación por teléfono es adivinar.

Por eso, en reparaciones:

- El número grande es la **visita de diagnóstico**, que sí se puede cotizar con precisión.
- El **trabajo probable** se informa aparte, según el síntoma, con su margen ancho y explícito.
- El presupuesto cerrado se pasa **antes** de reparar. Nunca después.

Lo mismo con la carga de gas: no se suma automáticamente, se avisa aparte, porque solo aplica si el diagnóstico detecta falta de refrigerante. Y si hay fuga, primero se repara la fuga: cargar gas sin arreglar la pérdida es tirar plata.

## El flujo operativo completo

```text
1. Entra el pedido
   ├─ el cliente completa el flujo guiado de la web  → se registra solo
   └─ el cliente usa la calculadora                  → se registra solo

2. El motor arma el presupuesto
   (se calcula en el servidor, no depende del navegador del cliente)

3. Vos lo revisás en /pedidos/
   └─ corregís cada concepto con el precio real de tu trabajo: el margen
      deja de tener sentido y el número pasa a ser tu precio

4. Se lo enviás por WhatsApp con un clic
   (va el desglose completo, no un total suelto)

5. Si el cliente acepta
   ├─ marcás "Aceptado"
   ├─ elegís el técnico de la red
   └─ el pedido pasa a "Derivado" automáticamente

6. Cerrás el trabajo
   └─ marcás "Realizado" y comparás estimado vs real → calibrás
```

## Por qué esto también ayuda a vender

Un precio concreto con desglose **baja la negociación al detalle**: el cliente discute los metros de cañería o el adicional de altura, no el total. Y deja de comparar contra el número más bajo del mercado, porque entiende qué está pagando.

El descuento por cantidad es una razón concreta para sumar un segundo equipo en la misma visita: el traslado y la puesta a punto se comparten.

## Fuentes

| Fuente | Fecha | Aporte |
|---|---|---|
| [Solvit — Instalación de split en Córdoba](https://solvitapp.com.ar/cuanto-cuesta/instalar-aire-acondicionado/cordoba) | jun 2026 | Mano de obra, metro de cañería, altura, gas, materiales |
| [Tegu — Aire acondicionado en Córdoba 2026](https://tegu.ar/blog/cuanto-cuesta-instalar-aire-acondicionado-cordoba-2026) | feb 2026 | Mano de obra por tramo de frigorías |
| [TodoResuelto — Instalar aire 2026](https://todoresuelto.com/cuanto-cuesta/instalar-aire-acondicionado) | jul 2026 | Banda de instalación estándar |
| [Muovi — Argentina 2026](https://www.muovi.com.ar/blog/cuanto-sale-instalar-aire-acondicionado-argentina-2026/) | jun 2026 | Frío/calor vs solo frío |
| [INDEC — IPC Nacional](https://datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26) | mensual | Actualización por inflación |

## Verificación

```bash
npm run verify
```

- `check:site` — sintaxis de todo el JS incluidos los scripts inline, datos estructurados, enlaces internos, service worker, rutas servidas y el motor corriendo por la rama del navegador.
- `check:prices` — coherencia de la configuración y, sobre todo, que **ningún importe quede escrito a mano** en el HTML: un precio fijo en el texto SEO queda viejo al mes siguiente.
- `test` — APIs y motor con almacenamiento en memoria, sin red ni credenciales.

Son 95 verificaciones.
