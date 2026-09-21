#!/usr/bin/env node
// Run with: node tools/check_map_no_test_yet_disregard.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(html, /This hides only this device from the No Test Yet list/);
assert.match(html, /other devices at the same building stay visible/);
assert.match(html, /keepMapNoTestYetLocationVisible/);
assert.match(html, /mapBuildingHasRemainingNoTestYetDevices/);
assert.match(html, /refreshMapAfterNoTestYetDisregardChange\(locationKey\)/);
assert.match(html, /refreshMapAfterNoTestYetDisregardChange\(keyLoc\)/);
assert.match(html, /mapBuildingHasRemainingNoTestYetDevices\(building, activeView\)/);

const windowStart = html.indexOf('        function startOfMapLocalDay(value) {');
const helperEnd = html.indexOf('        function keepMapNoTestYetLocationVisible(locationKey) {', windowStart);
assert.ok(windowStart >= 0, 'startOfMapLocalDay must exist');
assert.ok(helperEnd > windowStart, 'keepMapNoTestYetLocationVisible must follow remaining-device helpers');

const context = vm.createContext({
    window: { lastBulkSearchResults: { binGroups: {} } },
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math
});

vm.runInContext(`
const MAP_ANNUAL_TEST_GAP_DAYS = 91;
let mapNoTestYetDisregarded = {};
function getMapDeviceReportTestInfo(device) {
    const hasTest = !!(device && device.hasTest);
    return {
        isRemoved: !!(device && device.isRemoved),
        requiresPVI: true,
        requiresCat1: true,
        requiresCat5: false,
        hasPVI: hasTest,
        hasCat1: hasTest,
        hasCat5: false
    };
}
function getAdditionalLocations() { return []; }
function getAdditionalLocationCompletionKey(location) {
    return location && location.bin ? String(location.bin) : '';
}
function getAdditionalLocationLabel(location) {
    return (location && (location.address || location.label)) || '';
}
function isMapBinStoreKey(key) { return /^\\d{6,7}$/.test(String(key || '')); }
function isMapCustomLocationStoreKey(key) {
    return String(key || '').indexOf('custom:') === 0;
}
` + html.slice(windowStart, helperEnd) + `
this.getMapNoTestYetDeviceNumber = getMapNoTestYetDeviceNumber;
this.getMapNoTestYetLocationKeys = getMapNoTestYetLocationKeys;
this.getMapNoTestYetDeviceRows = getMapNoTestYetDeviceRows;
this.getMapNoTestYetGroups = getMapNoTestYetGroups;
this.setMapNoTestYetDisregard = setMapNoTestYetDisregard;
this.isMapNoTestYetDisregarded = isMapNoTestYetDisregarded;
this.mapLocationHasRemainingNoTestYetDevices = mapLocationHasRemainingNoTestYetDevices;
this.mapBuildingHasRemainingNoTestYetDevices = mapBuildingHasRemainingNoTestYetDevices;
this.setBinGroups = function(binGroups) {
    window.lastBulkSearchResults.binGroups = binGroups;
};
`, context);

const year = new Date().getFullYear();
const bin = '1000001';
const devices = [
    { device_number: '1P11111', device_type: 'Passenger Elevator' },
    { device_number: '1P22222', device_type: 'Passenger Elevator' },
    { device_number: '1P33333', device_type: 'Passenger Elevator', hasTest: true }
];

context.setBinGroups({
    [bin]: { address: '123 MAIN STREET', devices: devices }
});

const beforeRows = context.getMapNoTestYetDeviceRows(bin, devices, year);
assert.equal(beforeRows.length, 2, 'Two devices should be missing a first test');
assert.deepEqual(beforeRows.map(row => row.number), ['1P11111', '1P22222']);

context.setMapNoTestYetDisregard(bin, '1P11111', { year: year, note: 'Owner confirmed filing', address: '123 MAIN STREET' });
assert.equal(context.isMapNoTestYetDisregarded(bin, '1P11111', year), true);
assert.equal(context.isMapNoTestYetDisregarded(bin, '1P22222', year), false);
assert.equal(context.isMapNoTestYetDisregarded(bin, '', year), false);

const afterRows = context.getMapNoTestYetDeviceRows(bin, devices, year);
assert.equal(afterRows.length, 1, 'Disregarding one device must leave the other No Test Yet device');
assert.equal(afterRows[0].number, '1P22222');

const groups = context.getMapNoTestYetGroups(new Date());
assert.equal(groups.length, 1, 'The building must stay in No Test Yet after one device is disregarded');
assert.equal(groups[0].deviceCount, 1);
assert.equal(groups[0].devices[0].number, '1P22222');

assert.equal(context.mapLocationHasRemainingNoTestYetDevices(bin, devices), true);
assert.equal(context.mapBuildingHasRemainingNoTestYetDevices({ bin: bin }), true);

context.setMapNoTestYetDisregard(bin, '1P22222', { year: year, note: 'Second device' });
assert.equal(context.getMapNoTestYetDeviceRows(bin, devices, year).length, 0);
assert.equal(context.getMapNoTestYetGroups(new Date()).length, 0);
assert.equal(context.mapBuildingHasRemainingNoTestYetDevices({ bin: bin }), false);

assert.equal(context.getMapNoTestYetDeviceNumber({ deviceNumber: '1p44444' }), '1P44444');
const locationKeys = context.getMapNoTestYetLocationKeys('1000001', { bin: '1000001', key: 'custom:40.7,-73.9' });
assert.equal(locationKeys.join('|'), '1000001|custom:40.7,-73.9');

console.log('MAP No Test Yet disregard hides only the selected device, not the whole building.');
