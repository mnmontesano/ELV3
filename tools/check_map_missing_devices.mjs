#!/usr/bin/env node
// Run with: node tools/check_map_missing_devices.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('        // MAP missing-device import helpers');
const end = html.indexOf('        // end MAP missing-device import helpers', start);
assert.ok(start >= 0 && end > start, 'Missing-device helpers must be marked in index.html');

const source = html.slice(start, end) + `
this.isImportedMapDeviceNumber = isImportedMapDeviceNumber;
this.parseImportedMapDeviceNumbers = parseImportedMapDeviceNumbers;
this.deviceNumbersTextFromRows = deviceNumbersTextFromRows;
this.collectMapFileDeviceNumbers = collectMapFileDeviceNumbers;
this.summarizeMapMissingDeviceImport = summarizeMapMissingDeviceImport;
this.mergeMissingDeviceIntoBinGroups = mergeMissingDeviceIntoBinGroups;
this.formatImportedMapDeviceAddress = formatImportedMapDeviceAddress;
`;
const context = vm.createContext({});
vm.runInContext(source, context);

assert.equal(context.isImportedMapDeviceNumber('1P11111'), true);
assert.equal(context.isImportedMapDeviceNumber('2X123'), true);
assert.equal(context.isImportedMapDeviceNumber('12-345'), true);
assert.equal(context.isImportedMapDeviceNumber('MAIN'), false);
assert.equal(context.isImportedMapDeviceNumber('1000001'), false);

const asList = value => Array.from(value || []);
const parsed = context.parseImportedMapDeviceNumbers(`
Device Number
1P11111
1p11111
1P22222, 1P33333
1000001
MAIN STREET
APT4
"1P44444"
`);
assert.deepEqual(asList(parsed.devices), ['1P11111', '1P22222', '1P33333', '1P44444']);
assert.deepEqual(asList(parsed.skippedBins), ['1000001']);
assert.deepEqual(asList(parsed.skippedOther), ['APT4']);

const fromSheet = context.parseImportedMapDeviceNumbers(context.deviceNumbersTextFromRows([
    ['Device Number', 'Address', 'BIN'],
    ['1P11111', '10 Main St', '1000001'],
    ['1P55555', '20 Main St', '1000002']
]));
assert.deepEqual(asList(fromSheet.devices), ['1P11111', '1P55555']);
assert.deepEqual(asList(fromSheet.skippedBins), ['1000001', '1000002']);

const existing = context.collectMapFileDeviceNumbers({
    '1000001': {
        devices: [
            { device_number: '1p11111' },
            { device_number: '1P22222' }
        ]
    }
}, [
    { devices: [{ device_number: '1P33333' }] }
]);
assert.equal(existing.has('1P11111'), true);
assert.equal(existing.has('1P33333'), true);
assert.equal(existing.has('1P55555'), false);

const summary = context.summarizeMapMissingDeviceImport(fromSheet, existing);
assert.deepEqual(asList(summary.alreadyPresent), ['1P11111']);
assert.deepEqual(asList(summary.missing), ['1P55555']);

const binGroups = {
    '1000001': {
        address: '10 Main St, Manhattan',
        devices: [{ device_number: '1P11111' }],
        latitude: '40.7',
        longitude: '-73.9'
    }
};
const duplicate = context.mergeMissingDeviceIntoBinGroups(binGroups, {
    device_number: '1P11111',
    bin: '1000001',
    house_number: '10',
    street_name: 'Main St',
    borough: 'Manhattan'
});
assert.equal(duplicate.added, false);
assert.equal(binGroups['1000001'].devices.length, 1);

const addedExistingBuilding = context.mergeMissingDeviceIntoBinGroups(binGroups, {
    device_number: '1P55555',
    bin: '1000001',
    house_number: '10',
    street_name: 'Main St',
    borough: 'Manhattan',
    latitude: '40.71',
    longitude: '-73.99'
});
assert.equal(addedExistingBuilding.added, true);
assert.equal(addedExistingBuilding.bin, '1000001');
assert.equal(binGroups['1000001'].devices.length, 2);
assert.equal(binGroups['1000001'].devices[1].device_number, '1P55555');

const addedNewBuilding = context.mergeMissingDeviceIntoBinGroups(binGroups, {
    device_number: '2X123',
    bin: '2000002',
    house_number: '5',
    street_name: 'Broadway',
    borough: 'Brooklyn',
    latitude: '40.6',
    longitude: '-73.9'
});
assert.equal(addedNewBuilding.added, true);
assert.equal(binGroups['2000002'].address, '5 Broadway, Brooklyn');
assert.equal(binGroups['2000002'].devices.length, 1);
assert.equal(context.formatImportedMapDeviceAddress({ house_number: '5', street_name: 'Broadway', borough: 'Brooklyn' }), '5 Broadway, Brooklyn');

assert.ok(html.includes('id="mcpMissingDevices"'), 'Settings must include the Missing Devices section');
assert.match(html, /onclick="addMissingMapDevices\(\)"/);
assert.match(html, /onclick="triggerMapMissingDevicesFile\(\)"/);
assert.match(html, /handleMapMissingDevicesFile\(event\)/);
assert.match(html, /Missing Devices compares an imported device list/);
assert.equal((html.match(/function addMissingMapDevices\(/g) || []).length, 1);
assert.equal((html.match(/id="mapMissingDevicesInput"/g) || []).length, 1);

const uiStart = html.indexOf('        let lastMapMissingDeviceImport = null;');
const uiEnd = html.indexOf('        async function addAdditionalLocation() {', uiStart);
assert.ok(uiStart >= 0 && uiEnd > uiStart, 'Missing-device UI functions must stay together');
new Function(html.slice(uiStart, uiEnd));

console.log('map missing-device checks passed');
