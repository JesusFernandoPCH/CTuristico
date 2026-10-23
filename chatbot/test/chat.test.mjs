// Runs with `npm test`: exercises validation and the tool loop against a scripted fake client.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRequest, runChat, buildSystem, resolvePlace, REFUSAL_REPLY, RequestError } from '../src/chat.js';
import { runChatWorkersAI } from '../src/workers-ai.js';
import { runChatOpenAICompat, ProviderError } from '../src/openai-compat.js';
import { isOnTopic, underDailyLimit, hotelStems, mentionsHotel, screenReply, OFF_TOPIC_REPLY } from '../src/guard.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../src/catalog.json', import.meta.url), 'utf8'));
const scenesById = new Map(catalog.scenes.map((s) => [s.id, s]));
const JACUZZI = '157-38-alberca-bicentenario-jacuzzi_';
const config = { model: 'claude-opus-5-5', effort: 'low' };

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (params) => {
      calls.push(structuredClone(params));
      return responses.shift();
    } } }
  };
}

test('parseRequest keeps a valid history and drops a leading assistant turn', () => {
  const body = { messages: [
    { role: 'assistant', content: 'Hola' },
    { role: 'user', content: ' ¿Dónde está el spa? ' }
  ], sceneId: JACUZZI };
  const out = parseRequest(body, scenesById);
  assert.deepEqual(out.messages, [{ role: 'user', content: '¿Dónde está el spa?' }]);
  assert.equal(out.sceneId, JACUZZI);
});

test('parseRequest rejects bad input and ignores unknown scene ids', () => {
  assert.throws(() => parseRequest({}, scenesById), RequestError);
  assert.throws(() => parseRequest({ messages: [{ role: 'system', content: 'x' }] }, scenesById), RequestError);
  assert.throws(() => parseRequest({ messages: [{ role: 'user', content: 'x'.repeat(1001) }] }, scenesById), RequestError);
  assert.throws(() => parseRequest({ messages: [{ role: 'user', content: 'hola' }, { role: 'assistant', content: 'hola' }] }, scenesById), RequestError);
  assert.equal(parseRequest({ messages: [{ role: 'user', content: 'hola' }], sceneId: 'no-existe' }, scenesById).sceneId, null);
});

test('parseRequest accepts long earlier replies from the assistant', () => {
  const body = { messages: [
    { role: 'user', content: 'Cuéntame la historia' },
    { role: 'assistant', content: 'x'.repeat(2500) },
    { role: 'user', content: 'Gracias' }
  ] };
  assert.equal(parseRequest(body, scenesById).messages.length, 3);
});

test('the system prompt caches the hotel data block and lists the views per area', () => {
  const system = buildSystem(catalog);
  assert.equal(system.at(-1).cache_control.type, 'ephemeral');
  assert.match(system.at(-1).text, /\n38: .*Jacuzzi/);
  assert.ok(system.at(-1).text.includes('La Distral'));
});

test('resolvePlace matches the detail, ignores accents, and defaults to the first view', () => {
  assert.equal(resolvePlace(38, 'Jacuzzi', catalog).id, JACUZZI);
  assert.equal(resolvePlace(35, '', catalog).id, '256-35-spa-entrada');
  assert.equal(resolvePlace('35', 'banos mujeres', catalog).id, '305-35-spa-baos-mujeres');
  assert.equal(resolvePlace(26, 'nada parecido', catalog).id, catalog.scenes.find((s) => s.name.startsWith('26. ')).id);
  assert.equal(resolvePlace(99, '', catalog), null);
});

test('mostrar_lugar with a valid id returns a goto action and the final text', async () => {
  const client = fakeClient([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'mostrar_lugar', input: { area: 38, detalle: 'Jacuzzi' } }], usage: {} },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Te llevé al jacuzzi.' }], usage: {} }
  ]);
  const out = await runChat(client, config, catalog, { messages: [{ role: 'user', content: 'Llévame al jacuzzi' }], sceneId: '0-15-recepcin' });
  assert.deepEqual(out, { reply: 'Te llevé al jacuzzi.', action: { type: 'goto', sceneId: JACUZZI } });

  const [first, second] = client.calls;
  assert.equal(first.messages.at(-1).role, 'system', 'current scene goes after the user turn');
  assert.deepEqual(first.fallbacks, 'default');
  const toolResult = second.messages.at(-1).content[0];
  assert.equal(toolResult.tool_use_id, 't1');
  assert.equal(toolResult.is_error, undefined);
});

test('an unknown scene id comes back as a tool error and moves nothing', async () => {
  const client = fakeClient([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'mostrar_lugar', input: { area: 99, detalle: '' } }], usage: {} },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'No encontré esa vista.' }], usage: {} }
  ]);
  const out = await runChat(client, config, catalog, { messages: [{ role: 'user', content: 'Llévame' }], sceneId: null });
  assert.equal(out.action, null);
  assert.equal(client.calls[1].messages.at(-1).content[0].is_error, true);
});

function fakeAI(responses) {
  const calls = [];
  return { calls, run: async (model, params) => { calls.push(structuredClone(params)); return responses.shift(); } };
}

test('workers-ai: a tool call (string or object arguments) moves the tour', async () => {
  for (const args of [{ area: 38, detalle: 'jacuzzi' }, JSON.stringify({ area: 38, detalle: 'jacuzzi' })]) {
    const ai = fakeAI([
      { response: '', tool_calls: [{ name: 'mostrar_lugar', arguments: args }] },
      { response: 'Te llevé al jacuzzi.' }
    ]);
    const out = await runChatWorkersAI(ai, { model: 'm' }, catalog, { messages: [{ role: 'user', content: 'Llévame al jacuzzi' }], sceneId: '0-15-recepcin' });
    assert.deepEqual(out, { reply: 'Te llevé al jacuzzi.', action: { type: 'goto', sceneId: JACUZZI } });
    assert.ok(ai.calls[0].messages[0].content.includes('El visitante está viendo ahora'));
    assert.equal(ai.calls[1].messages.at(-1).role, 'tool');
  }
});

test('workers-ai: an unknown id moves nothing and a plain answer passes through', async () => {
  const ai = fakeAI([
    { response: '', tool_calls: [{ name: 'mostrar_lugar', arguments: { area: 99, detalle: '' } }] },
    { response: 'No encontré esa vista.' }
  ]);
  const out = await runChatWorkersAI(ai, { model: 'm' }, catalog, { messages: [{ role: 'user', content: 'x' }], sceneId: null });
  assert.equal(out.action, null);
  assert.ok(ai.calls[1].messages.at(-1).content.startsWith('Esa área no existe'));
});

test('guard: only a clear FUERA blocks; errors and unclear answers let the message through', async () => {
  const msgs = [{ role: 'user', content: 'Resume Star Wars' }];
  const ai = (response) => ({ run: async () => ({ response }) });
  assert.equal(await isOnTopic(ai('FUERA'), 'm', msgs), false);
  assert.equal(await isOnTopic(ai(' fuera.'), 'm', msgs), false);
  assert.equal(await isOnTopic(ai('EN'), 'm', msgs), true);
  assert.equal(await isOnTopic(ai('no sé'), 'm', msgs), true);
  assert.equal(await isOnTopic({ run: async () => { throw new Error('quota'); } }, 'm', msgs), true);
});

test('guard: the follow-up context includes the last concierge reply', async () => {
  let seen = '';
  const ai = { run: async (model, params) => { seen = params.messages[1].content; return { response: 'EN' }; } };
  await isOnTopic(ai, 'm', [{ role: 'user', content: 'Llévame al restaurante' }, { role: 'assistant', content: 'Te llevé a La Distral.' }, { role: 'user', content: '¿y a qué hora cierra?' }]);
  assert.ok(seen.includes('Te llevé a La Distral.') && seen.includes('¿y a qué hora cierra?'));
});

test('mentionsHotel lets hotel words through and leaves the rest to the guard', () => {
  const stems = hotelStems(catalog);
  assert.ok(mentionsHotel('¿Quién fue el dueño de la hacienda en el porfiriato?', stems));
  assert.ok(mentionsHotel('Cuéntame de Emiliano Zapata', stems));
  assert.ok(mentionsHotel('¿A qué hora abre La Distral?', stems));
  assert.ok(mentionsHotel('Llévame a las Caballerizas', stems));
  assert.ok(!mentionsHotel('Hazme un resumen de Star Wars', stems));
  assert.ok(!mentionsHotel('¿Cuál es la capital de Australia?', stems));
  assert.ok(!mentionsHotel('Escribe una función en Python', stems));
});

test('screenReply replaces replies that contain code', () => {
  assert.equal(screenReply('```python\nsorted(x)\n```'), OFF_TOPIC_REPLY);
  assert.equal(screenReply('La Distral cierra a las 23:00.'), 'La Distral cierra a las 23:00.');
});

test('daily limit counts per visitor and stops at the limit', async () => {
  const store = new Map();
  const kv = { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
  for (let i = 0; i < 3; i++) assert.equal(await underDailyLimit(kv, '1.2.3.4', 3), true);
  assert.equal(await underDailyLimit(kv, '1.2.3.4', 3), false);
  assert.equal(await underDailyLimit(kv, '5.6.7.8', 3), true);
});

function fakeFetch(bodies) {
  const sent = [];
  const fn = async (url, init) => {
    sent.push(JSON.parse(init.body));
    const next = bodies.shift();
    return { ok: next.status === undefined, status: next.status ?? 200, json: async () => next, text: async () => 'rate limited' };
  };
  return { fn, sent };
}

test('openai-compat: tool_calls move the tour and the tool result goes back with its id', async () => {
  const f = fakeFetch([
    { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'mostrar_lugar', arguments: '{"area":38,"detalle":"jacuzzi"}' } }] } }] },
    { choices: [{ message: { content: 'Te llevé al jacuzzi.' } }] }
  ]);
  const out = await runChatOpenAICompat(f.fn, { url: 'u', model: 'm', apiKey: 'k' }, catalog, { messages: [{ role: 'user', content: 'Llévame al jacuzzi' }], sceneId: null });
  assert.deepEqual(out, { reply: 'Te llevé al jacuzzi.', action: { type: 'goto', sceneId: JACUZZI } });
  assert.equal(f.sent[0].tools[0].function.name, 'mostrar_lugar');
  assert.equal(f.sent[0].tools[0].function.parameters.additionalProperties, undefined);
  assert.deepEqual(f.sent[1].messages.at(-1), { role: 'tool', tool_call_id: 'c1', content: f.sent[1].messages.at(-1).content });
});

test('openai-compat: an HTTP error surfaces as ProviderError with its status', async () => {
  const f = fakeFetch([{ status: 429 }]);
  await assert.rejects(
    runChatOpenAICompat(f.fn, { url: 'u', model: 'm', apiKey: 'k' }, catalog, { messages: [{ role: 'user', content: 'hola' }], sceneId: null }),
    (err) => err instanceof ProviderError && err.status === 429
  );
});

test('a refusal returns the canned reply', async () => {
  const client = fakeClient([{ stop_reason: 'refusal', content: [], usage: {} }]);
  const out = await runChat(client, config, catalog, { messages: [{ role: 'user', content: '...' }], sceneId: null });
  assert.equal(out.reply, REFUSAL_REPLY);
});
