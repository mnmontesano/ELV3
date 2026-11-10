#!/usr/bin/env node
// Run with: node tools/check_map_view_import_size.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const limitsMatch = html.match(/mapViewBytes:\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
assert.ok(limitsMatch, 'map view upload limit must exist');
const mapViewBytes = Number(limitsMatch[1]) * 1024 * 1024;

const start = html.indexOf('        const MAP_VIEW_IMPORT_MAX_VALUES');
const end = html.indexOf('        function restoreMapViewState(', start);
assert.ok(start >= 0, 'map view import limits must exist');
assert.ok(html.indexOf('        function sanitizeImportedMapValue(', start) > start, 'sanitizer must follow its limits');
assert.ok(html.indexOf('        function normalizeImportedMapView(', start) > start, 'map view import must follow the sanitizer');
assert.ok(end > start, 'map view restore must follow the import helpers');

const context = vm.createContext({
    ELV3_UPLOAD_LIMITS: Object.freeze({ mapViewBytes }),
    MAP_ADDRESS_ALIAS_MAX: 5000,
    isMapBinStoreKey: key => /^\d{6,7}$/.test(key),
    isValidMapCompletedStoreKey: key => /^\d{6,7}$/.test(key),
    normalizeImportedCat5Bypasses: () => ({}),
    normalizeMapAddressCodes: value => value || {},
    normalizeMapAddressAliases: value => value || [],
    normalizeMapScheduleRecord: value => ({ pvi: [], category: [], general: [], ...(value || {}) }),
    getMapScheduleDates: record => [...record.pvi, ...record.category, ...record.general],
    normalizeMapCompletedTestType: value => value || '',
    parseMapTimestamp: value => value || null
});
vm.runInContext(html.slice(start, end) + `
this.sanitizeImportedMapValue = sanitizeImportedMapValue;
this.normalizeImportedMapView = normalizeImportedMapView;
`, context);
const { sanitizeImportedMapValue, normalizeImportedMapView } = context;

function buildDevice(bin, index) {
    const device = {
        device_number: `1P${String(index).padStart(5, '0')}`,
        bin,
        house_number: String(100 + (index % 900)),
        street_name: 'BROADWAY',
        borough: 'MANHATTAN',
        device_type: 'Passenger Elevator (P)',
        device_status: 'ACTIVE',
        machine_type: 'TRACTION',
        latitude: 40.75 + index / 1e6,
        longitude: -73.98 - index / 1e6,
        violations: [
            { violation_number: `V${index}A`, violation_status: 'ACTIVE', issue_date: '2026-01-02', description: 'Periodic test not filed' },
            { violation_number: `V${index}B`, violation_status: 'OPEN', issue_date: '2026-03-04', description: 'Category 1 test not filed' }
        ]
    };
    for (let field = 0; field < 30; field++) device[`dob_field_${field}`] = `value ${field}`;
    return device;
}

function buildView(deviceCount, devicesPerBuilding) {
    const binGroups = {};
    for (let index = 0; index < deviceCount; index++) {
        const bin = String(1000000 + Math.floor(index / devicesPerBuilding));
        if (!binGroups[bin]) binGroups[bin] = { address: `${bin} Broadway, Manhattan`, devices: [], latitude: 40.75, longitude: -73.98 };
        binGroups[bin].devices.push(buildDevice(bin, index));
    }
    return {
        version: 2,
        type: 'map-view',
        view: {
            name: 'Large portfolio',
            lastBulkSearchResults: { binGroups, notFound: [] },
            mapState: { center: [40.75, -73.98], zoom: 12, filters: { months: ['January'] } }
        }
    };
}

// A large but legitimate portfolio saved by the app must load as long as it fits the upload size limit.
const largeView = buildView(4000, 4);
const largeJson = JSON.stringify(largeView, null, 2);
assert.ok(largeJson.length < mapViewBytes, `test view (${largeJson.length} bytes) must fit the ${mapViewBytes}-byte upload limit`);
const sanitized = sanitizeImportedMapValue(JSON.parse(largeJson));
assert.equal(Object.keys(sanitized.view.lastBulkSearchResults.binGroups).length, 1000);
assert.equal(sanitized.view.lastBulkSearchResults.binGroups['1000000'].devices[0].device_number, '1P00000');

// A view with more than 10 MB of device data must fit the upload limit and load.
const biggerView = buildView(6000, 4);
const biggerJson = JSON.stringify(biggerView, null, 2);
assert.ok(biggerJson.length > 10 * 1024 * 1024, 'bigger test view must be over 10 MB');
assert.ok(biggerJson.length < mapViewBytes, `bigger test view (${biggerJson.length} bytes) must fit the ${mapViewBytes}-byte upload limit`);
assert.equal(Object.keys(normalizeImportedMapView(JSON.parse(biggerJson)).lastBulkSearchResults.binGroups).length, 1500);

// The pasted device list is saved as one text value and must load even when it is longer than a note may be.
const deviceListView = buildView(4000, 4);
const deviceList = Array.from({ length: 4000 }, (_, index) => `1P${String(index).padStart(5, '0')}`).join('\n');
assert.ok(deviceList.length > 20000, 'device list must be longer than the per-text limit');
deviceListView.view.bulkDeviceNumbers = deviceList;
const loadedDeviceListView = normalizeImportedMapView(JSON.parse(JSON.stringify(deviceListView, null, 2)));
assert.equal(loadedDeviceListView.bulkDeviceNumbers, deviceList);
assert.equal(Object.keys(loadedDeviceListView.lastBulkSearchResults.binGroups).length, 1000);

// Other long text, and unsafe text in the device list, are still handled as before.
const longNoteView = buildView(4, 4);
longNoteView.view.notes = { 1000000: 'x'.repeat(20001) };
assert.throws(() => normalizeImportedMapView(longNoteView), /oversized text value/);
const unsafeListView = buildView(4, 4);
unsafeListView.view.bulkDeviceNumbers = '1P00000\n<img src=x>';
assert.equal(normalizeImportedMapView(unsafeListView).bulkDeviceNumbers, '1P00000\n‹img src=x›');
const pollutedListView = buildView(4, 4);
pollutedListView.view = JSON.parse(`{"__proto__": {"x": 1}, "bulkDeviceNumbers": "1P00000", "lastBulkSearchResults": ${JSON.stringify(pollutedListView.view.lastBulkSearchResults)}}`);
assert.throws(() => normalizeImportedMapView(pollutedListView), /prohibited field name/);

// The densest file that fits the upload limit must also pass the value-count check.
const denseCount = Math.floor((mapViewBytes - 65536) / 2);
const denseObject = {};
for (let chunk = 0; chunk * 20000 < denseCount; chunk++) {
    denseObject[`k${chunk}`] = new Array(Math.min(20000, denseCount - chunk * 20000)).fill(0);
}
assert.ok(JSON.stringify(denseObject).length <= mapViewBytes, 'dense test file must fit the upload limit');
assert.doesNotThrow(() => sanitizeImportedMapValue(denseObject));

// Pathological nesting is still rejected before it can exhaust the call stack.
let deep = 'leaf';
for (let level = 0; level < 200; level++) deep = { nested: deep };
assert.throws(() => sanitizeImportedMapValue(deep), /too complex/);

// Prototype-polluting keys and oversized values are still rejected.
assert.throws(() => sanitizeImportedMapValue(JSON.parse('{"__proto__": {"x": 1}}')), /prohibited field name/);
assert.throws(() => sanitizeImportedMapValue({ note: 'x'.repeat(20001) }), /oversized text value/);
assert.throws(() => sanitizeImportedMapValue({ list: new Array(20001).fill(0) }), /too many list items/);

console.log('map view import size: ok');
