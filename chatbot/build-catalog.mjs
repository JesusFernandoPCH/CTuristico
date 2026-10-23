// Builds src/catalog.json (hotel facts + scene list) from the tour's own data,
// so the chatbot never keeps a third copy of it. Runs on every wrangler build.
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const ctx = {};
vm.runInNewContext(fs.readFileSync(new URL('data.js', root), 'utf8') + ';this.APP_DATA = APP_DATA;', ctx);
const hotel = JSON.parse(fs.readFileSync(new URL('data/hotel.json', root), 'utf8'));

const scenes = ctx.APP_DATA.scenes.map((s) => ({ id: s.id, name: s.name }));
const out = new URL('src/catalog.json', import.meta.url);
const next = JSON.stringify({ hotel, scenes });
// Write only on change: `wrangler dev` watches src/, so rewriting an identical file would rebuild forever.
if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== next) {
  fs.writeFileSync(out, next);
}
console.log(`catalog: ${scenes.length} scenes, ${hotel.areas.length} areas`);
