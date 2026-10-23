// Chat logic, kept free of Worker and network specifics so it can be tested with a fake client.
import { INSTRUCTIONS } from './prompt.js';

// maxChars caps what a visitor types; earlier assistant replies echoed back in the history get more room.
export const LIMITS = { maxMessages: 20, maxChars: 1000, maxReplyChars: 4000, maxToolRounds: 3, maxTokens: 4000 };

export const REFUSAL_REPLY = 'No puedo ayudarte con eso. ¿Quieres que te muestre algún lugar del hotel?';

export const TOOLS = [
  {
    name: 'mostrar_lugar',
    description: 'Mueve el recorrido 360° del visitante a una vista del hotel. Úsala cuando el visitante quiera ver, visitar o ubicar un lugar. scene_id debe ser un id exacto del catálogo de vistas.',
    input_schema: {
      type: 'object',
      properties: {
        scene_id: { type: 'string', description: 'Id exacto de la vista, tal como aparece en el catálogo (por ejemplo "157-38-alberca-bicentenario-jacuzzi_").' }
      },
      required: ['scene_id'],
      additionalProperties: false
    },
    strict: true
  }
];

export class RequestError extends Error {}

// The stable prefix: instructions, then the hotel data and scene catalog (cached).
export function buildSystem(catalog) {
  const sceneLines = catalog.scenes.map((s) => `${s.id} | ${s.name}`).join('\n');
  return [
    { type: 'text', text: INSTRUCTIONS },
    {
      type: 'text',
      text: `Datos del hotel (JSON):\n${JSON.stringify(catalog.hotel)}\n\nCatálogo de vistas del tour (id | nombre; el número al inicio del nombre es el área del mapa):\n${sceneLines}`,
      cache_control: { type: 'ephemeral' }
    }
  ];
}

// Validates the visitor's payload: a short text-only history ending in a user turn.
export function parseRequest(body, scenesById) {
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw new RequestError('Falta el mensaje.');
  }
  const messages = body.messages.slice(-LIMITS.maxMessages).map((m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      throw new RequestError('Formato de mensaje inválido.');
    }
    const content = m.content.trim();
    const max = m.role === 'user' ? LIMITS.maxChars : LIMITS.maxReplyChars;
    if (!content || content.length > max) {
      throw new RequestError(`Cada mensaje debe tener entre 1 y ${max} caracteres.`);
    }
    return { role: m.role, content };
  });
  while (messages.length && messages[0].role !== 'user') {
    messages.shift();
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new RequestError('El último mensaje debe ser del visitante.');
  }
  const sceneId = scenesById.has(body.sceneId) ? body.sceneId : null;
  return { messages, sceneId };
}

function textOf(response) {
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

// Runs one visitor turn: calls Claude, executes mostrar_lugar locally, loops until a final answer.
// Returns { reply, action } where action is { type: 'goto', sceneId } or null.
export async function runChat(client, config, catalog, { messages, sceneId }) {
  const scenesById = new Map(catalog.scenes.map((s) => [s.id, s]));
  const system = buildSystem(catalog);
  const convo = messages.slice();
  if (sceneId) {
    // Per-request context goes after the cached prefix, as an operator message.
    convo.push({ role: 'system', content: `El visitante está viendo ahora: ${scenesById.get(sceneId).name} (id ${sceneId}).` });
  }

  let action = null;
  let lastText = '';
  for (let round = 0; round <= LIMITS.maxToolRounds; round++) {
    const response = await client.beta.messages.create({
      model: config.model,
      max_tokens: LIMITS.maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: config.effort },
      system,
      tools: TOOLS,
      messages: convo
    });
    config.onUsage?.(response.usage, response.model);

    if (response.stop_reason === 'refusal') {
      return { reply: REFUSAL_REPLY, action };
    }
    lastText = textOf(response) || lastText;
    if (response.stop_reason !== 'tool_use') {
      return { reply: lastText || 'Listo.', action };
    }

    // Append the assistant turn unchanged (thinking blocks included), then answer every tool call.
    convo.push({ role: 'assistant', content: response.content });
    const results = response.content.filter((b) => b.type === 'tool_use').map((call) => {
      const scene = call.name === 'mostrar_lugar' && scenesById.get(call.input?.scene_id);
      if (!scene) {
        return { type: 'tool_result', tool_use_id: call.id, is_error: true, content: 'No existe una vista con ese id. Usa un id exacto del catálogo.' };
      }
      action = { type: 'goto', sceneId: scene.id };
      return { type: 'tool_result', tool_use_id: call.id, content: `Listo: el visitante ya está viendo ${scene.name}.` };
    });
    convo.push({ role: 'user', content: results });
  }
  return { reply: lastText || 'Listo.', action };
}
