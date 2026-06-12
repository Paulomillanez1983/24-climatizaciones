# 24 Climatizaciones

Sitio/PWA estático para solicitar presupuestos de climatización por WhatsApp.

## Qué incluye

- Marca `24 Climatizaciones` con logo SVG y logo animado en la interfaz.
- Flujo guiado de 5 pasos para detectar equipo, servicio, urgencia, domicilio y datos útiles.
- Mensaje final armado para WhatsApp con ubicación, respuestas y fotos sugeridas.
- Manifest PWA, service worker y favicon SVG.
- Mapa con MapLibre GL JS y búsqueda de direcciones mediante OpenStreetMap/Nominatim.

## Uso local

Abrir `index.html` directamente alcanza para revisar la interfaz. Para probar PWA, manifest y service worker conviene servir la carpeta con un servidor local o publicarla en HTTPS.

## Calificaciones de Google

La seccion de opiniones funciona con fallback honesto: si no hay credenciales, envia a la ficha oficial de Google. Para mostrar rating real en Vercel, configurar estas variables:

- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACE_ID`
