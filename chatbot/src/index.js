// Cloudflare Worker: POST /chat for the tour's concierge. Keeps the Anthropic key server-side.
import Anthropic from '@anthropic-ai/sdk';
import catalog from './catalog.json';
import { parseRequest, runChat, RequestError } from './chat.js';
import { runChatWorkersAI } from './workers-ai.js';
import { isOnTopic, underDailyLimit, hotelStems, mentionsHotel, screenReply, OFF_TOPIC_REPLY } from './guard.js';

const scenesById = new Map(catalog.scenes.map((s) => [s.id, s]));
const stems = hotelStems(catalog);
const MAX_BODY_BYTES = 32 * 1024;

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    const cors = allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }
      });
    }
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/chat') {
      return json({ error: 'No encontrado.' }, 404, cors);
    }
    if (!cors['Access-Control-Allow-Origin']) {
      return json({ error: 'Origen no permitido.' }, 403);
    }

    // Anonymous visitors have no account to key on, so the limits are per IP.
    const visitor = request.headers.get('CF-Connecting-IP') || 'local';
    const { success } = await env.CHAT_LIMITER.limit({ key: visitor });
    if (!success) {
      return json({ error: 'Demasiados mensajes seguidos. Espera un minuto e inténtalo de nuevo.' }, 429, cors);
    }

    let input;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) {
        throw new RequestError('La conversación es demasiado larga.');
      }
      input = parseRequest(JSON.parse(raw), scenesById);
    } catch (err) {
      const message = err instanceof RequestError ? err.message : 'Solicitud inválida.';
      return json({ error: message }, 400, cors);
    }

    // One visitor can't use up the shared free quota for everyone else.
    if (!(await underDailyLimit(env.CHAT_QUOTA, visitor, Number(env.DAILY_LIMIT_PER_VISITOR)))) {
      return json({ error: 'Llegaste al límite de mensajes de hoy. Vuelve mañana o llama al hotel al 777 362 0770.' }, 429, cors);
    }
    const text = input.messages[input.messages.length - 1].content;
    if (env.GUARD_MODEL && !mentionsHotel(text, stems) && !(await isOnTopic(env.AI, env.GUARD_MODEL, input.messages))) {
      console.log(JSON.stringify({ event: 'off_topic' }));
      return json({ reply: OFF_TOPIC_REPLY, action: null }, 200, cors);
    }

    const onUsage = (usage, model) => console.log(JSON.stringify({ event: 'usage', provider: env.PROVIDER, model, usage }));
    try {
      // PROVIDER picks the model backend: "workers-ai" (free daily quota) or "anthropic" (Claude, paid).
      const result = env.PROVIDER === 'anthropic'
        ? await runChat(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 }), { model: env.MODEL, effort: env.EFFORT, onUsage }, catalog, input)
        : await runChatWorkersAI(env.AI, { model: env.WORKERS_AI_MODEL, onUsage }, catalog, input);
      return json({ ...result, reply: screenReply(result.reply) }, 200, cors);
    } catch (err) {
      console.error(err);
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
        return json({ error: 'El asistente está ocupado. Inténtalo en unos segundos.' }, 503, cors);
      }
      if (err instanceof Anthropic.APIError) {
        return json({ error: 'El asistente no está disponible por ahora.' }, 502, cors);
      }
      // Workers AI error 4006: the free daily neurons are used up. They reset at 00:00 UTC, 18:00 in central Mexico.
      if (String(err && err.message).includes('4006')) {
        return json({ error: 'El concierge ya usó su cuota gratuita de hoy y vuelve a las 18:00 (hora del centro de México). Mientras tanto, puedes seguir recorriendo el tour.' }, 503, cors);
      }
      return json({ error: 'El asistente no está disponible por ahora. Inténtalo más tarde.' }, 503, cors);
    }
  }
};
