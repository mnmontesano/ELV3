#!/usr/bin/env node
// Run with: node tools/check_map_device_not_mine.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
    const start = html.indexOf(`        function ${name}(`);
    assert.ok(start >= 0, `${name} must exist`);
    const end = html.indexOf('\n        }\n', start);
    assert.ok(end > start, `${name} must close`);
    return html.slice(start, end + '\n        }\n'.length);
}

const source = [
    'normalizeDobDateValue',
    'isNotApplicableMapDevice',
    'getMapDeviceNotApplicableNote',
    'mergeDobDeviceRecord'
].map(extractFunction).join('\n') + `
this.getMapDeviceNotApplicableNote = getMapDeviceNotApplicableNote;
this.mergeDobDeviceRecord = mergeDobDeviceRecord;
`;
const context = vm.createContext({});
vm.runInContext(source, context);

assert.equal(context.getMapDeviceNotApplicableNote({ map_not_applicable_note: '  Tenant owned  ' }), 'Tenant owned');
assert.equal(context.getMapDeviceNotApplicableNote({}), '');
assert.equal(context.getMapDeviceNotApplicableNote(null), '');

const saved = {
    device_number: '1P1002',
    device_status: 'ACTIVE',
    periodic_latest_inspection: '2024-03-01',
    map_not_applicable: true,
    map_not_applicable_note: 'Serviced by Acme Elevator'
};
context.mergeDobDeviceRecord(saved, {
    device_number: '1P1002',
    device_status: 'ACTIVE',
    periodic_latest_inspection: '2025-03-01'
});
assert.equal(saved.map_not_applicable, true, 'DOB refresh keeps the N/A mark');
assert.equal(saved.map_not_applicable_note, 'Serviced by Acme Elevator', 'DOB refresh keeps the N/A note');
assert.equal(saved.periodic_latest_inspection, '2025-03-01');

assert.match(html, /function markMapDeviceNotApplicable\(/);
assert.match(html, /function saveMapDeviceNotApplicableNote\(/);
assert.match(html, /class="map-device-not-mine-btn"/);
assert.match(html, /class="map-device-count-mine-btn"/);
assert.match(html, /class="map-na-note-box"/);
assert.match(html, /<option value="not-applicable">Not mine \(N\/A\)<\/option>/);

console.log('Not mine devices keep their N/A mark and note, and the Device Report has the controls.');
