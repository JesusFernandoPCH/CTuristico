// Provider for any OpenAI-compatible chat completions endpoint (Gemini, Groq, ...). Same contract as runChat.
import { INSTRUCTIONS } from './prompt.js';
import { LIMITS, TOOLS, catalogText, showPlace, movedReply } from './chat.js';

export class ProviderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Plain JSON Schema without additionalProperties, which some compatible endpoints reject.
const COMPAT_TOOLS = TOOLS.map((t) => {
  const { additionalProperties, ...parameters } = t.input_schema;
  return { type: 'function', function: { name: t.name, description: t.description, parameters } };
});

function parseArgs(raw) {
  if (typeof raw !== 'string') {
    return raw || {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function runChatOpenAICompat(fetchFn, config, catalog, { messages, sceneId }) {
  const scenesById = new Map(catalog.scenes.map((s) => [s.id, s]));
  const where = sceneId ? `\n\nEl visitante está viendo ahora: ${scenesById.get(sceneId).name}.` : '';
  const convo = [{ role: 'system', content: `${INSTRUCTIONS}\n\n${catalogText(catalog)}${where}` }, ...messages];

  let action = null;
  let moved = null;
  let lastText = '';
  const finalReply = () => lastText || (moved ? movedReply(moved) : 'Listo.');
  for (let round = 0; round <= LIMITS.maxToolRounds; round++) {
    const res = await fetchFn(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: convo, tools: COMPAT_TOOLS, tool_choice: 'auto', max_tokens: 400 })
    });
    if (!res.ok) {
      throw new ProviderError(res.status, `${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    const data = await res.json();
    config.onUsage?.(data.usage, config.model);
    const message = data.choices?.[0]?.message || {};
    lastText = (typeof message.content === 'string' ? message.content.trim() : '') || lastText;
    const calls = message.tool_calls || [];
    if (!calls.length) {
      return { reply: finalReply(), action };
    }
    convo.push({ role: 'assistant', content: message.content || '', tool_calls: calls });
    for (const call of calls) {
      const name = call.function?.name;
      const result = showPlace(name === 'mostrar_lugar' ? parseArgs(call.function.arguments) : null, catalog);
      action = result.action || action;
      moved = result.scene || moved;
      convo.push({ role: 'tool', tool_call_id: call.id, content: result.text });
    }
  }
  return { reply: finalReply(), action };
}
