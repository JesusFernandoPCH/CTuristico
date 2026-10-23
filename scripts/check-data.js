// Consistency check for the tour data. Run: node scripts/check-data.js
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8') + ';this.APP_DATA = APP_DATA;', ctx);
var scenes = ctx.APP_DATA.scenes;
var hotel = JSON.parse(fs.readFileSync(path.join(root, 'data', 'hotel.json'), 'utf8'));
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

var errors = [];
var areas = {};
hotel.areas.forEach(function(a) { areas[a.numero] = a; });
var ids = {};
scenes.forEach(function(s) { ids[s.id] = true; });
var used = {};

scenes.forEach(function(s) {
  var m = /^\d+-(\d+)-/.exec(s.id);
  if (!m) return errors.push('id sin número de área: ' + s.id);
  var n = Number(m[1]);
  used[n] = true;
  if (!areas[n]) errors.push('área ' + n + ' no existe en hotel.json (' + s.id + ')');
  if (s.name.indexOf(n + '. ') !== 0) errors.push('el nombre no empieza con "' + n + '. ": ' + s.id + ' -> ' + s.name);
  s.linkHotspots.forEach(function(h) {
    if (!ids[h.target]) errors.push('enlace roto en ' + s.id + ' -> ' + h.target);
  });
  if (!fs.existsSync(path.join(root, 'tiles', s.id, 'preview.jpg'))) errors.push('faltan tiles: ' + s.id);
});

hotel.areas.forEach(function(a) {
  if (!used[a.numero]) errors.push('área sin escenas: ' + a.numero + ' ' + a.nombre);
});

(html.match(/src="(img\/[^"]+)"/g) || []).forEach(function(attr) {
  var file = attr.slice(5, -1);
  if (!fs.existsSync(path.join(root, file))) errors.push('imagen no encontrada en index.html: ' + file);
});

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('OK: ' + scenes.length + ' escenas, ' + hotel.areas.length + ' áreas');
