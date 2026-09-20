# Metodología de presupuestos

Cómo se resuelve el problema de "no sé cuánto cobrar una instalación de aire".

## El problema real

No existe "el precio de instalar un aire". Dos instalaciones del mismo equipo de 3.000 frigorías pueden salir $150.000 o $400.000 según:

- cuántos metros hay entre la unidad de adentro y la de afuera,
- en qué piso va la de afuera y si hace falta arnés,
- si hay que hacer la línea eléctrica o ya hay toma,
- de qué es la pared,
- si el cliente vive a 5 km o a 40 km.

Por eso una **lista de precios fija no funciona** y por eso cualquier número único que des sin ver el lugar es un problema: o cobrás de menos y perdés plata, o cotizás alto y perdés el trabajo.

## La solución: precio por componentes, no por servicio

En vez de buscar un precio, se **arma**. El motor suma componentes medibles:

```text
trabajo    = mano_de_obra(frigorías) × cantidad
cañería    = (metros_reales − 3) × precio_por_metro
altura     = según piso y tipo de acceso
instalación= eléctrico + desagüe + perforación de pared
traslado   = según distancia desde la base
descuentos = preinstalación existente + cantidad de equipos
─────────────────────────────────────────────────────────────
total      = trabajo + cañería + altura + instalación + traslado − descuentos
```

Cada término cumple dos condiciones:

1. **Es medible.** El técnico lo mide, o el cliente lo responde con una pregunta cerrada ("¿en qué piso va la unidad de afuera?", no "¿es difícil?").
2. **Es editable.** Cambiar un valor no rompe nada más.

## Por qué devuelve un rango y no un número

Siempre hay variables que no se conocen antes de la visita: los metros reales, el estado del tablero, si el desagüe es viable.

El motor devuelve **mínimo y máximo** más un nivel de confianza:

| Confianza | Significa |
|---|---|
| Presupuesto bien encaminado | Se respondieron casi todas las variables. |
| Buen avance | Falta alguna variable que mueve el precio. |
| Falta contexto | Faltan varias, el rango se abre y se avisa cuáles. |

Cuando faltan variables, el máximo se amplía un 12%: es preferible un rango ancho y honesto que un número lindo y falso.

## Las variables, una por una

### Aire acondicionado — instalación

| Variable | Pregunta al cliente | Efecto |
|---|---|---|
| `fg` frigorías | ¿Qué equipo es? | Fija la mano de obra base. Incluye hasta 3 m de cañería. |
| `qty` cantidad | ¿Cuántos equipos? | Multiplica la mano de obra y aplica descuento por visita compartida. |
| `pipe` metros extra | ¿A qué distancia quedan las unidades? | Cada metro sobre 3 suma. |
| `pre` preinstalación | ¿Ya hay cañería y cable pasados? | Descuenta materiales y parte del trabajo. Se descuenta **una sola vez**, no por equipo. |
| `height` altura/acceso | ¿En qué piso va la unidad de afuera? | Planta baja sin cargo. 2º–3º piso suma. Más de 3º con arnés suma más. Rappel es el caso tope. |
| `elec` eléctrico | ¿Hay toma cerca? | Toma existente sin cargo. Línea nueva con térmica suma. Tablero lejos suma más. |
| `drain` desagüe | ¿Tiene desagüe? | Si hay que hacerlo, suma. |
| `wall` pared | ¿De qué es la pared? | Durlock casi nada. Ladrillo suma. Losa u hormigón suma más. Por equipo. |
| `zone` zona | ¿Dónde estás? | Traslado desde la base. |

### Reparación

No se puede presupuestar sin ver el equipo. El motor da la visita de diagnóstico más un rango orientativo **según el síntoma** (no enfría, pierde agua, hace ruido, no enciende, da error).

La carga de gas **no se suma automáticamente**: se informa aparte ($48.000 a $110.000) porque sólo aplica si el diagnóstico detecta falta de refrigerante. Y si hay fuga, primero se repara la fuga: cargar gas sin arreglar la pérdida es tirar plata.

### Mantenimiento

Precio por equipo, más traslado. Es el servicio más fácil de fijar porque el trabajo es estandarizado.

### Caldera y calefacción

La estructura está lista pero **sin referencia de mercado verificada**: los valores están marcados como `estimado` y hay que cargarlos con tus trabajos reales.

## De dónde salen los valores actuales

Los valores marcados como `referencia` salen de precios publicados del mercado de Córdoba:

| Fuente | Fecha | Aporte |
|---|---|---|
| [Solvit — Precios de instalación de split en Córdoba](https://solvitapp.com.ar/cuanto-cuesta/instalar-aire-acondicionado/cordoba) | jun 2026 | Mano de obra, metro de cañería, altura, carga de gas, materiales |
| [Tegu — Aire acondicionado en Córdoba 2026](https://tegu.ar/blog/cuanto-cuesta-instalar-aire-acondicionado-cordoba-2026) | feb 2026 | Mano de obra por tramo de frigorías |
| [TodoResuelto — Instalar aire acondicionado 2026](https://todoresuelto.com/cuanto-cuesta/instalar-aire-acondicionado) | jul 2026 | Banda de instalación estándar |
| [Muovi — Argentina 2026](https://www.muovi.com.ar/blog/cuanto-sale-instalar-aire-acondicionado-argentina-2026/) | jun 2026 | Frío/calor vs solo frío |

Son un **punto de partida**, no tu lista de precios. En Argentina, además, hay que revisarlos por inflación: la configuración declara `reviewAfter: 2026-12-31`.

## Cómo calibrar con trabajos reales

Es el paso que hace que el sistema sirva de verdad:

1. Cerrá 5 o 6 trabajos con el flujo nuevo.
2. En cada uno, mirá en el panel cuánto había estimado el motor y cuánto cobraste.
3. Si el motor queda corto o largo siempre en el mismo concepto, corregí **ese** número.
4. `npm run check:prices` para verificar que el texto SEO siguió el cambio.

No hace falta calibrar todo de una. Con 5 trabajos reales la precisión mejora muchísimo, porque el error suele concentrarse en un concepto (normalmente altura o metros de cañería).

## Dónde se editan los precios

**Un solo archivo: `lib/pricing.js`**, en el objeto `CONFIG`.

Ese archivo se usa igual en el navegador (calculadora, panel) y en el servidor (al registrar el pedido). No hay copias. El cuerpo de la calculadora arma sus textos desde ahí, así que no puede quedar desactualizado.

La única excepción son los datos estructurados para Google (JSON-LD), que tienen que estar escritos en el HTML. Para eso existe el chequeo:

```bash
npm run check:prices
```

Si un número del texto SEO no coincide con el motor, te dice exactamente cuál y dónde.

## El flujo operativo completo

```text
1. Entra el pedido
   ├─ el cliente completa el flujo guiado de la web  → se registra solo
   └─ el cliente usa la calculadora                  → se registra solo

2. El motor arma un borrador de presupuesto
   (se calcula en el servidor, no depende del navegador del cliente)

3. Vos lo revisás en /pedidos/
   └─ corregís cada línea con el precio real de tu trabajo

4. Se lo enviás por WhatsApp con un clic
   (va el desglose completo, no un número suelto)

5. Si el cliente acepta
   ├─ marcás "Aceptado"
   ├─ elegís el técnico de la red
   └─ el pedido pasa a "Derivado" automáticamente

6. Cerrás el trabajo
   └─ marcás "Realizado" y comparás estimado vs real → calibrás
```

## Por qué esto también ayuda a vender

Un presupuesto con desglose **reduce la negociación sobre el total** y la mueve a las líneas: el cliente discute los metros de cañería o el adicional de altura, no el precio entero. Y cuando entiende qué está pagando, deja de comparar contra el número más bajo del mercado.

El descuento por cantidad, además, es una razón concreta para que el cliente sume un segundo equipo en la misma visita: el traslado y la puesta a punto se comparten.

## Verificación

```bash
npm run verify
```

Corre los chequeos estáticos del sitio, la sincronización de precios y las pruebas funcionales de las APIs (70 verificaciones).
