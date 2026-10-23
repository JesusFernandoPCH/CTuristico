// Runs with `npm test`: exercises validation and the tool loop against a scripted fake client.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRequest, runChat, buildSystem, REFUSAL_REPLY, RequestError } from '../src/chat.js';

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

test('the system prompt caches the hotel data block and lists every scene', () => {
  const system = buildSystem(catalog);
  assert.equal(system.at(-1).cache_control.type, 'ephemeral');
  assert.ok(system.at(-1).text.includes(JACUZZI));
  assert.ok(system.at(-1).text.includes('La Distral'));
});

test('mostrar_lugar with a valid id returns a goto action and the final text', async () => {
  const client = fakeClient([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'mostrar_lugar', input: { scene_id: JACUZZI } }], usage: {} },
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
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'mostrar_lugar', input: { scene_id: 'inventado' } }], usage: {} },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'No encontré esa vista.' }], usage: {} }
  ]);
  const out = await runChat(client, config, catalog, { messages: [{ role: 'user', content: 'Llévame' }], sceneId: null });
  assert.equal(out.action, null);
  assert.equal(client.calls[1].messages.at(-1).content[0].is_error, true);
});

test('a refusal returns the canned reply', async () => {
  const client = fakeClient([{ stop_reason: 'refusal', content: [], usage: {} }]);
  const out = await runChat(client, config, catalog, { messages: [{ role: 'user', content: '...' }], sceneId: null });
  assert.equal(out.reply, REFUSAL_REPLY);
});
