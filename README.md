# Tour 360 · Fiesta Americana Hacienda San Antonio El Puente

Recorrido virtual 360° del hotel: 309 escenas fotografiadas en sitio, organizadas en 40 áreas del mapa del hotel.

**Demo:** https://jesusfernandopch.github.io/CTuristico/

## Correr en local

Los navegadores bloquean `file://`, así que se necesita un servidor estático:

```bash
python -m http.server 8000
# abrir http://localhost:8000
```

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Página: menú lateral, modales (Información, Ubicación, Mapa) y controles |
| `index.js` | Visor Marzipano, lista de escenas, hotspots y modales |
| `data.js` | Escenas del tour (generado con [Marzipano Tool](https://www.marzipano.net), nombres corregidos a mano) |
| `data/hotel.json` | Fuente de verdad del hotel: áreas, contacto, horarios e historia |
| `tiles/` | Imágenes de las panorámicas por escena |
| `scripts/check-data.js` | Valida que escenas, áreas, enlaces e imágenes sean consistentes |

Los ids de escena siguen el formato `<índice>-<área>-<slug>`; el número de área enlaza cada escena con `data/hotel.json`.

## Validar los datos

```bash
node scripts/check-data.js
```
