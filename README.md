# 24 Climatizaciones

Sitio/PWA de climatización para Córdoba: capta el pedido, **estima el presupuesto con un motor paramétrico**, y deriva el trabajo al técnico que corresponde.

## El flujo, de punta a punta

```text
cliente                     sistema                      vos                    técnico
   │                           │                          │                       │
   ├─ usa la calculadora ─────►│                          │                       │
   │  o el flujo de 5 pasos    │                          │                       │
   │                           ├─ arma el presupuesto ──►│                       │
   │                           │  (desglose por línea)    │                       │
   │                           │                          ├─ lo ajusta y lo envía │
   │◄──────────────────────────┼──────────────────────────┤  por WhatsApp         │
   ├─ acepta ─────────────────►│                          │                       │
   │                           │                          ├─ elige el técnico ───►│
   │                           │                          │  (pasa a "Derivado")  │
   │                           │                          │                       ├─ hace
   │                           │                          │◄──────────────────────┤  el trabajo
```

El cliente **no elige al técnico**: entra el pedido, se presupuesta de forma centralizada, y cuando el cliente acepta se deriva al técnico de la red según zona y especialidad.

## Qué incluye

### Web pública

| Ruta | Estado | Qué es |
|---|---|---|
| `/` | existente | Flujo guiado de 5 pasos → mensaje de WhatsApp con ubicación, respuestas y fotos sugeridas. |
| `/presupuesto/` | **nuevo** | Calculadora de presupuesto estimado. Rango y desglose en 30 segundos, sin registro. Es el gancho compartible: el resultado viaja por link. |
| `/tecnicos/` | **nuevo** | Postulación de técnicos a la red. |

### Paneles internos

| Ruta | Estado | Qué es |
|---|---|---|
| `/pedidos/` | **nuevo** | Bandeja de pedidos, editor del presupuesto con desglose, envío por WhatsApp, estados y derivación. También gestiona la red de técnicos y muestra los precios vigentes. |
| `/admin/` | existente | Galería de fotos de trabajos. |
| `/clients/`, `/factory/`, `/portal/` | existente | Pipeline de entregas y generador de webs para clientes. |

### APIs

| Endpoint | Auth | Qué hace |
|---|---|---|
| `POST /api/leads` | pública | Alta del pedido. Calcula el presupuesto en el servidor y devuelve `id` + clave de seguimiento. |
| `GET /api/leads?id=&key=` | pública | El cliente ve su propio pedido. La clave se guarda hasheada. |
| `GET /api/leads?admin=1` | admin | Listado completo, con filtro por estado. |
| `PATCH /api/leads` | admin | Estado, técnico asignado, presupuesto ajustado línea por línea, precio final y notas. |
| `POST /api/technicians` | pública | Postulación. Si el WhatsApp ya existe, actualiza en vez de duplicar. |
| `GET /api/technicians?count=1` | pública | Sólo el conteo, sin datos personales. |
| `GET /api/technicians` | admin | Listado de la red. |
| `PATCH /api/technicians` | admin | Estado, rating y notas internas. |
| `GET /api/pricing-index` | pública | Último índice del IPC Nacional (INDEC) para actualizar los precios por inflación. Cacheado 6 h. |

## Motor de precios

Está en **`lib/pricing.js`** y se usa igual en el navegador y en el servidor (módulo UMD, sin dependencias ni build step).

El precio se **arma sumando componentes medibles** en vez de salir de una lista fija. El resultado es **un precio concreto con un margen chico y explícito**, no un rango ancho: las dispersiones de cada concepto se combinan como varianzas en lugar de sumar mínimos por un lado y máximos por el otro.

Dos propiedades que importan:

- **El margen se achica a medida que el cliente responde.** Cada dato que falta amplía el margen y se informa cuál es. Con todo respondido queda por debajo del 12%.
- **Los precios se actualizan solos por inflación**, con el IPC Nacional del INDEC vía `/api/pricing-index`. Si la fuente falla, el motor usa su último valor conocido y el sitio nunca se queda sin precios.

La lógica completa, las variables, las fuentes, los resguardos de la inflación y cómo calibrarlo están en **[METODOLOGIA-PRECIOS.md](METODOLOGIA-PRECIOS.md)**.

Los precios se editan en un solo lugar: el objeto `CONFIG` de `lib/pricing.js` (cada ítem declara `value` y `spread`). Ningún importe está escrito a mano en el HTML — un precio fijo en el texto SEO queda viejo al mes siguiente —, y `check:prices` lo verifica.

## Uso local

Abrir `index.html` directamente alcanza para revisar la interfaz, pero la calculadora y los paneles necesitan servirse desde la raíz (usan rutas absolutas como `/lib/pricing.js`). Para probar todo, incluido PWA y service worker, servir la carpeta:

```bash
npx serve .
```

## Verificación

```bash
npm install
npm run verify
```

- `npm run check:site` — sintaxis de todos los JS y de cada `<script>` inline, datos estructurados, enlaces internos, recursos del service worker, rutas servidas y el motor corriendo por la rama del navegador.
- `npm run check:prices` — coherencia de la configuración de precios y que ningún importe quede escrito a mano en el HTML. Informa los valores vigentes ya ajustados por inflación.
- `npm test` — pruebas funcionales de las APIs y del motor con almacenamiento en memoria (sin red ni credenciales): alta, deduplicación de teléfonos, seguimiento con clave, ajuste del presupuesto, derivación, combinación de márgenes, topes de inflación y el endpoint del IPC con fuente simulada.

Son 95 verificaciones.

## Variables de entorno

### Paneles internos y pedidos

- `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD_SALT`, `ADMIN_SESSION_SECRET` — sesión de `/pedidos/`, `/admin/` y `/clients/`.

### Almacenamiento

- `BLOB_READ_WRITE_TOKEN` — Vercel Blob. Guarda galería, pedidos y técnicos.

### Opiniones de Google

La sección de opiniones funciona con fallback honesto: si no hay credenciales, envía a la ficha oficial.

- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACE_ID` (opcional; si falta, busca `24 Climatizaciones Cordoba Argentina` con Places Text Search)
- `GOOGLE_PLACE_QUERY` (opcional, para ajustar la búsqueda)

### Otros

- `PUBLIC_SUPPORT_WHATSAPP` — número de soporte del portal (por defecto `+5493513266650`).
- `PORTAL_LINK_SECRET` — firma de los links del portal de clientes.
- `FACTORY_GITHUB_TOKEN`, `VERCEL_TOKEN`, `VERCEL_TEAM_ID` — publicación de sitios desde el generador.

## Límites conocidos

- Las colecciones de pedidos y técnicos se guardan en un único objeto JSON en Vercel Blob, con tope de 500 registros cada una. Alcanza para el volumen de un negocio chico; si supera eso, corresponde mover a una base de datos.
- Los valores de caldera y calefacción no tienen fuente de mercado verificada: están marcados como `estimado` y hay que cargarlos con trabajos reales.
