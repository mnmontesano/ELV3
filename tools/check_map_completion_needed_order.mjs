#!/usr/bin/env node
// Run with: node tools/check_map_completion_needed_order.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('        function mapCompletionDeviceShowsNeeded(info) {');
assert.ok(start >= 0, 'mapCompletionDeviceShowsNeeded must exist');
const endMarker = '        function showMapCompletedDetailsPicker(bin, options) {';
const end = html.indexOf(endMarker, start);
assert.ok(end > start, 'renderMapCompletionDeviceTestsHtml must exist');
const source = html.slice(start, end) + `
this.mapCompletionDeviceShowsNeeded = mapCompletionDeviceShowsNeeded;
this.renderMapCompletionDeviceTestsHtml = renderMapCompletionDeviceTestsHtml;
`;
const context = {
    escapeMapSuggestionHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};
vm.runInContext(source, vm.createContext(context));

const filed = new Date(2026, 2, 4);
const info = (overrides) => Object.assign({
    requiresPVI: false,
    hasPVI: false,
    pviDate: null,
    requiresCat1: false,
    hasCat1: false,
    cat1Date: null,
    requiresCat5: false,
    hasCat5: false,
    cat5Date: null,
    countsCat5ForYear: false
}, overrides);

assert.equal(context.mapCompletionDeviceShowsNeeded(info({
    requiresPVI: true,
    hasPVI: true,
    pviDate: filed
})), false);
assert.equal(context.mapCompletionDeviceShowsNeeded(info({
    requiresPVI: true
})), true);
assert.equal(context.mapCompletionDeviceShowsNeeded(info({
    requiresCat5: true,
    hasCat5: true
})), true, 'a required test without a filed date still shows Needed');

const rendered = context.renderMapCompletionDeviceTestsHtml({
    deviceFacts: [
        { device: { device_number: '10' }, info: info({ requiresPVI: true, hasPVI: true, pviDate: filed, requiresCat1: true, hasCat1: true, cat1Date: filed }) },
        { device: { device_number: '2' }, info: info({ requiresCat1: true }) },
        { device: { device_number: '1' }, info: info({ requiresPVI: true, hasPVI: true, pviDate: filed }) },
        { device: { device_number: '3A' }, info: info({ requiresCat5: true, countsCat5ForYear: true }) }
    ]
}, 2026);

const order = [...rendered.matchAll(/<td[^>]*>([^<]+)<\/td>/g)]
    .map(match => match[1])
    .filter(text => text !== 'Device' && text !== 'PVI' && text !== 'CAT 1' && text !== 'CAT 5');
assert.deepEqual(order, ['2', '3A', '1', '10']);
assert.match(rendered, /<details id="completedDeviceTests" open/);
assert.ok(rendered.indexOf('>2<') < rendered.indexOf('>10<'));
assert.ok(rendered.indexOf('Needed') < rendered.indexOf('>10<'));

const empty = context.renderMapCompletionDeviceTestsHtml({ deviceFacts: [] }, 2026);
assert.equal(empty, '');

const pickerStart = html.indexOf("overlay.id = 'completedDetailsOverlay';");
const pickerEnd = html.indexOf('document.body.appendChild(overlay);', pickerStart);
assert.ok(pickerStart >= 0 && pickerEnd > pickerStart);
const pickerHtml = html.slice(pickerStart, pickerEnd);
assert.match(pickerHtml, /id="completedDetailsDobNowBtn"/);
assert.match(pickerHtml, /onclick="openDobNowPortal\(\)"/);
assert.match(pickerHtml, /DOB Now/);

console.log('Needed devices sort above filed devices, and the completion dialog includes DOB Now.');
