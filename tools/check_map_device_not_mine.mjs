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

const tagStart = html.indexOf('        const MAP_NOT_APPLICABLE_TAG_PRESETS = [');
const tagEnd = html.indexOf('        function getMapNotApplicableTagHue(', tagStart);
assert.ok(tagStart >= 0 && tagEnd > tagStart, 'N/A tag helpers must stay together above getMapNotApplicableTagHue');

const source = [
    'normalizeDobDateValue',
    'isNotApplicableMapDevice',
    'getMapDeviceNotApplicableNote',
    'mergeDobDeviceRecord'
].map(extractFunction).join('\n') + html.slice(tagStart, tagEnd) + `
this.getMapDeviceNotApplicableNote = getMapDeviceNotApplicableNote;
this.getMapDeviceNotApplicableTag = getMapDeviceNotApplicableTag;
this.normalizeMapNotApplicableTag = normalizeMapNotApplicableTag;
this.collectMapNotApplicableTags = collectMapNotApplicableTags;
this.mergeDobDeviceRecord = mergeDobDeviceRecord;
this.presets = MAP_NOT_APPLICABLE_TAG_PRESETS;
`;
const context = vm.createContext({});
vm.runInContext(source, context);

assert.equal(context.getMapDeviceNotApplicableNote({ map_not_applicable_note: '  Tenant owned  ' }), 'Tenant owned');
assert.equal(context.getMapDeviceNotApplicableNote({}), '');
assert.equal(context.getMapDeviceNotApplicableNote(null), '');

assert.equal(context.normalizeMapNotApplicableTag('  Another   company  '), 'Another company');
assert.equal(context.normalizeMapNotApplicableTag('x'.repeat(60)).length, 40);
assert.equal(context.getMapDeviceNotApplicableTag({ map_not_applicable_tag: ' Tenant owned ' }), 'Tenant owned');
assert.equal(context.getMapDeviceNotApplicableTag(null), '');

const tags = context.collectMapNotApplicableTags(
    {
        '1000001': { devices: [
            { map_not_applicable: true, map_not_applicable_tag: 'Garage operator' },
            { map_not_applicable: true, map_not_applicable_tag: 'tenant owned' },
            { map_not_applicable_tag: 'Not N/A so ignored' }
        ] }
    },
    [{ devices: [{ map_not_applicable: true, map_not_applicable_tag: 'Building super' }] }]
);
const presetCount = context.presets.length;
assert.equal(JSON.stringify(tags.slice(0, presetCount)), JSON.stringify([...context.presets]));
assert.equal(JSON.stringify(tags.slice(presetCount)), JSON.stringify(['Building super', 'Garage operator']));
assert.ok(!tags.includes('tenant owned'), 'a preset typed in other casing is not listed twice');
assert.ok(!tags.includes('Not N/A so ignored'));

const saved = {
    device_number: '1P1002',
    device_status: 'ACTIVE',
    periodic_latest_inspection: '2024-03-01',
    map_not_applicable: true,
    map_not_applicable_note: 'Serviced by Acme Elevator',
    map_not_applicable_tag: 'Another company'
};
context.mergeDobDeviceRecord(saved, {
    device_number: '1P1002',
    device_status: 'ACTIVE',
    periodic_latest_inspection: '2025-03-01'
});
assert.equal(saved.map_not_applicable, true, 'DOB refresh keeps the N/A mark');
assert.equal(saved.map_not_applicable_note, 'Serviced by Acme Elevator', 'DOB refresh keeps the N/A note');
assert.equal(saved.map_not_applicable_tag, 'Another company', 'DOB refresh keeps the N/A tag');
assert.equal(saved.periodic_latest_inspection, '2025-03-01');

assert.match(html, /function markMapDeviceNotApplicable\(/);
assert.match(html, /function saveMapDeviceNotApplicableDetails\(/);
assert.match(html, /class="map-device-not-mine-btn"/);
assert.match(html, /class="map-device-count-mine-btn"/);
assert.match(html, /class="map-na-note-box"/);
assert.match(html, /class="map-na-tag-input"/);
assert.match(html, /id="deviceReportTagFilter"/);
assert.match(html, /<datalist id="mapNotApplicableTagOptions">/);
assert.match(html, /<option value="not-applicable">Not mine \(N\/A\)<\/option>/);

console.log('Not mine devices keep their N/A mark, tag, and note, and the Device Report has the controls.');
