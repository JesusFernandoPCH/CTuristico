// Chat logic, kept free of Worker and network specifics so it can be tested with a fake client.
import { INSTRUCTIONS } from './prompt.js';

// maxChars caps what a visitor types; earlier assistant replies echoed back in the history get more room.
export const LIMITS = { maxMessages: 8, maxChars: 400, maxReplyChars: 4000, maxToolRounds: 3, maxTokens: 4000 };

export const REFUSAL_REPLY = 'No puedo ayudarte con eso. ¿Quieres que te muestre algún lugar del hotel?';

export const TOOLS = [
  {
    name: 'mostrar_lugar',
    description: 'Mueve el recorrido 360° del visitante a un lugar del hotel. Úsala solo cuando el visitante pida ver, ir a o ubicar un lugar.',
    input_schema: {
      type: 'object',
      properties: {
        area: { type: 'integer', description: 'Número del área en el mapa del hotel (1 a 40).' },
        detalle: { type: 'string', description: 'Vista concreta dentro del área, tal como aparece en la lista de vistas (por ejemplo "Jacuzzi" o "Sauna"). Vacío para la vista general.' }
      },
      required: ['area', 'detalle'],
      additionalProperties: false
    },
    strict: true
  }
];

export function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export class RequestError extends Error {}

// Scene names are "<area>. <label>"; group the labels by area number.
function viewsByArea(catalog) {
  const byArea = new Map();
  for (const s of catalog.scenes) {
    const m = /^(\d+)\.\s*(.*)$/.exec(s.name);
    const area = Number(m[1]);
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push({ scene: s, label: m[2] });
  }
  return byArea;
}

// Hotel data and the views available in each area, shared by every provider.
export function catalogText(catalog) {
  const lines = [...viewsByArea(catalog)].sort((a, b) => a[0] - b[0]).map(([area, views]) =>
    `${area}: ${[...new Set(views.map((v) => v.label))].join('; ')}`);
  return `Datos del hotel (JSON):\n${JSON.stringify(catalog.hotel)}\n\nVistas del tour por área (número de área: vistas disponibles):\n${lines.join('\n')}`;
}

// Picks the view of an area whose label shares the most words with `detalle`.
// Ties (and no detalle) go to the area's first view in tour order, usually its entrance or general view.
export function resolvePlace(area, detalle, catalog) {
  const views = viewsByArea(catalog).get(Number(area));
  if (!views) {
    return null;
  }
  const words = normalize(detalle || '').split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  let best = views[0].scene;
  let bestScore = 0;
  for (const v of views) {
    const label = normalize(v.label);
    const score = words.filter((w) => label.includes(w)).length;
    if (score > bestScore) {
      best = v.scene;
      bestScore = score;
    }
  }
  return best;
}

// The stable prefix for Claude: instructions, then the hotel data and scene catalog (cached).
export function buildSystem(catalog) {
  return [
    { type: 'text', text: INSTRUCTIONS },
    { type: 'text', text: catalogText(catalog), cache_control: { type: 'ephemeral' } }
  ];
}

// Executes mostrar_lugar for any provider. `input` is the tool's { area, detalle }.
export function showPlace(input, catalog) {
  const scene = input ? resolvePlace(input.area, input.detalle, catalog) : null;
  if (!scene) {
    return { action: null, scene: null, isError: true, text: 'Esa área no existe. Usa un número de área del 1 al 40.' };
  }
  return { action: { type: 'goto', sceneId: scene.id }, scene, isError: false, text: `Listo: el visitante ya está viendo ${scene.name}.` };
}

// Reply to use when the model moved the tour but wrote no text.
export function movedReply(scene) {
  return `Te llevé a ${scene.name.replace(/^\d+\.\s*/, '')}.`;
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
  let moved = null;
  let lastText = '';
  const finalReply = () => lastText || (moved ? movedReply(moved) : 'Listo.');
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
      return { reply: finalReply(), action };
    }

    // Append the assistant turn unchanged (thinking blocks included), then answer every tool call.
    convo.push({ role: 'assistant', content: response.content });
    const results = response.content.filter((b) => b.type === 'tool_use').map((call) => {
      const result = showPlace(call.name === 'mostrar_lugar' ? call.input : null, catalog);
      action = result.action || action;
      moved = result.scene || moved;
      return result.isError
        ? { type: 'tool_result', tool_use_id: call.id, is_error: true, content: result.text }
        : { type: 'tool_result', tool_use_id: call.id, content: result.text };
    });
    convo.push({ role: 'user', content: results });
  }
  return { reply: finalReply(), action };
}
