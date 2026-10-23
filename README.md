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
| `data/hotel.json` | Fuente de verdad del hotel: áreas (la lista de lugares del tour toma de aquí sus nombres), contacto, horarios e historia |
| `tiles/` | Imágenes de las panorámicas por escena |
| `scripts/check-data.js` | Valida que escenas, áreas, enlaces e imágenes sean consistentes |

Los ids de escena siguen el formato `<índice>-<área>-<slug>`; el número de área enlaza cada escena con `data/hotel.json`.

## Concierge virtual (chatbot)

`chat.js` es el widget del tour; `chatbot/` es el backend, un Cloudflare Worker que llama a Claude y guarda la API key como secreto. El asistente responde con los datos de `data/hotel.json` y puede mover el tour a cualquier vista con la herramienta `mostrar_lugar`.

```bash
cd chatbot
npm install
npm test                                  # pruebas sin red ni API key
npx wrangler login                        # una vez, abre el navegador
npx wrangler secret put ANTHROPIC_API_KEY # pega la key de console.anthropic.com
npm run deploy                            # imprime la URL del Worker
```

Después de desplegar, pon `https://<worker>/chat` en `<meta name="chat-endpoint">` de `index.html`. En local, el tour usa `http://127.0.0.1:8787/chat` (`npm run dev` con la key en `chatbot/.dev.vars`).

## Validar los datos

```bash
node scripts/check-data.js
```
