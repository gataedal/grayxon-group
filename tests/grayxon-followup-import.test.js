const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const headers = [
  'Periodo de datos', 'ID del creador', 'Nombre de usuario del creador',
  'Grupo', 'Agente', 'Hora de incorporación',
  'Días desde la incorporación', 'Diamantes', 'Duración de LIVE',
  'Días válidos de emisiones LIVE'
];
const data = [
  ['2026-11-01 ~ 2026-11-23', '123', 'lorena_vargas22', 'Equipo A', 'manager@test', '2025-12-16 17:59:52 (UTC+0)', '344', '809090', '130h 55min 50s', '22'],
  ['2026-11-01 ~ 2026-11-23', '456', '@gaby_famili1', 'Equipo A', 'manager@test', '2025-08-19 09:20:07 (UTC+0)', '463', '267779', '103h 1min 17s', '23']
];
const sandbox = {
  XLSX: { utils: { sheet_to_json: () => [headers, ...data] } },
  console
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('grayxon-followup-import.js', 'utf8'), sandbox);
const parser = sandbox.GRAYXON_FOLLOWUP_IMPORT;

const preview = parser.parseWorkbook(
  { SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } },
  '2026-11-01', '2026-11-23'
);
assert.equal(preview.rows.length, 2);
assert.equal(preview.rows[0].username, 'lorena_vargas22');
assert.equal(preview.rows[0].diamonds, 809090);
assert.ok(Math.abs(preview.rows[0].liveHours - (130 + 55/60 + 50/3600)) < 1e-9);
assert.equal(preview.rows[0].validDays, 22);
assert.equal(preview.canEvaluate, true);
assert.equal(preview.granularity, 'aggregate');

const partial = parser.parseWorkbook(
  { SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } },
  '2026-11-01', '2026-11-07'
);
assert.equal(partial.canEvaluate, false);
assert.match(partial.restriction, /No es posible calcular un subperiodo/);
assert.equal(parser.parseDurationHours('130h 55min 50s'), 130 + 55/60 + 50/3600);
assert.equal(parser.parseDurationHours('2h 30min'), 2.5);

console.log('OK: XLSX preview parser, duration, aggregate-period guard.');
