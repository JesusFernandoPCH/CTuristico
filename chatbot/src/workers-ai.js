// Free provider: Cloudflare Workers AI (env.AI binding). Same contract as runChat in chat.js.
import { INSTRUCTIONS } from './prompt.js';
import { LIMITS, TOOLS, catalogText, showPlace, movedReply } from './chat.js';

const AI_TOOLS = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema }));

// Tool arguments may arrive as an object or as a JSON string depending on the model.
function argsOf(call) {
  const raw = call.arguments ?? call.function?.arguments ?? {};
  if (typeof raw !== 'string') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function runChatWorkersAI(ai, config, catalog, { messages, sceneId }) {
  const scenesById = new Map(catalog.scenes.map((s) => [s.id, s]));
  // No prompt caching here, so the per-request scene goes at the end of the one system message.
  const where = sceneId ? `\n\nEl visitante está viendo ahora: ${scenesById.get(sceneId).name}.` : '';
  const convo = [{ role: 'system', content: `${INSTRUCTIONS}\n\n${catalogText(catalog)}${where}` }, ...messages];

  let action = null;
  let moved = null;
  let lastText = '';
  const finalReply = () => lastText || (moved ? movedReply(moved) : 'Listo.');
  for (let round = 0; round <= LIMITS.maxToolRounds; round++) {
    const res = await ai.run(config.model, { messages: convo, tools: AI_TOOLS, max_tokens: 600 });
    config.onUsage?.(res.usage, config.model);
    lastText = (typeof res.response === 'string' ? res.response.trim() : '') || lastText;
    const calls = res.tool_calls || [];
    if (!calls.length) {
      return { reply: finalReply(), action };
    }
    convo.push({ role: 'assistant', content: JSON.stringify(calls) });
    for (const call of calls) {
      const name = call.name ?? call.function?.name;
      const result = showPlace(name === 'mostrar_lugar' ? argsOf(call) : null, catalog);
      action = result.action || action;
      moved = result.scene || moved;
      convo.push({ role: 'tool', name, content: result.text });
    }
  }
  return { reply: finalReply(), action };
}
