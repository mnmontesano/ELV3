#!/usr/bin/env node
// Run with: node tools/check_map_device_report_bypass.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function sliceBetween(startMarker, endMarker) {
    const start = html.indexOf(startMarker);
    const end = html.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing ${startMarker}`);
    assert.ok(end > start, `missing ${endMarker}`);
    return html.slice(start, end);
}

const storage = new Map();
const activity = [];
const notifications = [];
const noteFields = {};
const context = {
    console,
    localStorage: {
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, String(value)); },
        removeItem(key) { storage.delete(key); }
    },
    window: { lastBulkSearchResults: { binGroups: {} } },
    document: {
        getElementById(id) { return Object.prototype.hasOwnProperty.call(noteFields, id) ? noteFields[id] : null; }
    },
    MAP_CAT5_BYPASSES_STORAGE_KEY: 'verticalTerminal.mapCat5Bypasses.v1',
    MAP_CAT1_BYPASSES_STORAGE_KEY: 'verticalTerminal.mapCat1Bypasses.v1',
    MAP_PVI_BYPASSES_STORAGE_KEY: 'verticalTerminal.mapPviBypasses.v1',
    mapCat5Bypasses: {},
    mapCat1Bypasses: {},
    mapPviBypasses: {},
    buildingMap: null,
    mapBuildingsData: [],
    isNotApplicableMapDevice: device => !!device.map_not_applicable,
    isDumbwaiterDevice: () => false,
    isConveyorDevice: device => String(device.device_type || '').toUpperCase().includes('CONVEYOR'),
    isAccessibilityLiftDevice: () => false,
    isHydraulicDevice: () => false,
    isEscalatorOrMovingWalkDevice: () => false,
    escapeMapSuggestionHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    addMapActivity(action, options) { activity.push({ action, ...(options || {}) }); },
    showMapNotification(message) { notifications.push(message); },
    showDeviceDetailModal() {},
    updateMapBypassedTestsPanel() {},
    updateMapCategory5Panel() {},
    parseMapInspectionDate(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
    }
};
vm.createContext(context);
vm.runInContext([
    sliceBetween('        function normalizeImportedTestBypasses(rawBypasses, label) {', '        function normalizeImportedNoTestByJuneDisregarded(rawDisregarded) {'),
    sliceBetween('        function getMapTestBypassConfig(kind) {', '        function syncMapNoteDraft(bin, value) {'),
    sliceBetween('        function getMapDeviceReportTestInfo(device, currentYear, binHint) {', '        function getMapDeviceReportNextTestAvailability(testInfo, today) {')
].join('\n'), context);

function device(extra) {
    return {
        device_number: '1P1',
        device_type: 'Passenger Elevator',
        device_status: 'ACTIVE',
        periodic_latest_inspection: '2024-03-01',
        cat1_latest_report_filed: '2024-03-01',
        cat5_latest_report_filed: '2020-03-01',
        ...(extra || {})
    };
}

context.window.lastBulkSearchResults.binGroups = {
    '1000001': { address: '1 Main St', devices: [device()] }
};

const before = context.getMapDeviceReportTestInfo(device(), 2026, '1000001');
assert.equal(before.requiresPVI, true);
assert.equal(before.requiresCat1, true);
assert.equal(before.requiresCat5, true);
assert.deepEqual(JSON.parse(JSON.stringify(context.getMapDeviceReportPendingTests(before))), ['PVI', 'CAT 1', 'CAT 5']);

context.toggleMapDeviceTestBypass('pvi', '1000001', '1P1');
let info = context.getMapDeviceReportTestInfo(device(), 2026, '1000001');
assert.equal(info.requiresPVI, false, 'PVI bypass removes the requirement');
assert.equal(info.pviBypassed, true);
assert.equal(info.requiresCat1, true, 'CAT 1 is unchanged by a PVI bypass');
assert.equal(context.getMapDeviceReportPendingTests(info).includes('PVI'), false);
assert.match(context.formatMapAnnualTestStatusHtml(info, 'pvi'), /Not required \(bypassed\)/);
assert.match(notifications.at(-1), /PVI bypass saved for future years/);

noteFields.cat1BypassNote_1000001_1P1 = { value: 'Converted to freight & not our CAT 1' };
context.saveMapDeviceTestBypassNote('cat1', '1000001', '1P1');
info = context.getMapDeviceReportTestInfo(device(), 2026, '1000001');
assert.equal(info.requiresCat1, false);
assert.equal(info.cat1Bypassed, true);
assert.equal(info.cat1BypassNote, 'Converted to freight & not our CAT 1');
assert.equal(context.getMapDeviceReportPendingTests(info).includes('CAT 1'), false);
const cat1Html = context.renderMapDeviceTestBypassHtml({
    kind: 'cat1',
    bin: '1000001',
    deviceIndex: 0,
    deviceNumber: '1P1',
    show: true,
    bypassed: info.cat1Bypassed,
    note: info.cat1BypassNote,
    explanation: context.getMapDeviceTestBypassExplanation('cat1', info)
});
assert.match(cat1Html, /CAT 1 Bypassed/);
assert.match(cat1Html, /Undo Bypass/);
assert.match(cat1Html, /Save Note/);
assert.match(cat1Html, /cat1BypassNote_1000001_1P1/);
assert.match(cat1Html, /Converted to freight &amp; not our CAT 1/);
assert.match(cat1Html, /toggleMapDeviceTestBypass\('cat1'/);

const pviHtml = context.renderMapDeviceTestBypassHtml({
    kind: 'pvi',
    bin: '1000001',
    deviceIndex: 0,
    deviceNumber: '1P1',
    show: true,
    bypassed: false,
    note: '',
    explanation: context.getMapDeviceTestBypassExplanation('pvi', before)
});
assert.match(pviHtml, /Bypass PVI/);
assert.match(pviHtml, /Bypass & Save Note/);
assert.match(pviHtml, /pviBypassNote_1000001_1P1/);
assert.match(pviHtml, /no longer requires PVI/);

assert.equal(context.isMapDeviceCat5Bypassed('1000001', '1P1'), false);
context.setMapDeviceCat5Bypass('1000001', '1P1', { bypassed: true, note: 'Five year waiver' });
info = context.getMapDeviceReportTestInfo(device(), 2026, '1000001');
assert.equal(info.cat5Bypassed, true);
assert.equal(info.requiresCat5, false);
assert.equal(info.countsCat5ForYear, false);
assert.equal(info.cat5BypassNote, 'Five year waiver');

const savedPvi = JSON.parse(storage.get(context.MAP_PVI_BYPASSES_STORAGE_KEY));
assert.equal(savedPvi['1000001::1P1'].bypassed, true);
context.mapPviBypasses = {};
context.setMapPviBypasses({});
assert.equal(context.isMapDevicePviBypassed('1000001', '1P1'), true, 'PVI bypass stays active for a later search');

context.window.lastBulkSearchResults.binGroups = {};
context.setMapCat1Bypasses({});
assert.equal(context.isMapDeviceCat1Bypassed('1000001', '1P1'), false, 'a device absent from the map is not shown as bypassed');
context.window.lastBulkSearchResults.binGroups = {
    '1000001': { address: '1 Main St', devices: [device()] }
};
context.setMapCat1Bypasses({});
info = context.getMapDeviceReportTestInfo(device(), 2026, '1000001');
assert.equal(info.cat1Bypassed, true, 'the saved CAT 1 bypass returns with the device');
assert.equal(info.cat1BypassNote, 'Converted to freight & not our CAT 1');

context.syncMapTestBypassDeviceNumber('cat1', '1000001', '1P1', '2P2');
assert.equal(context.getMapDeviceCat1BypassNote('1000001', '2P2'), 'Converted to freight & not our CAT 1');
assert.equal(context.isMapDeviceCat1Bypassed('1000001', '1P1'), false);

context.clearMapDevicePviBypass('1000001', '1P1');
assert.equal(context.isMapDevicePviBypassed('1000001', '1P1'), false);
assert.equal(JSON.parse(storage.get(context.MAP_PVI_BYPASSES_STORAGE_KEY))['1000001::1P1'], undefined);

assert.throws(
    () => context.normalizeImportedTestBypasses({ bad: { bypassed: true } }, 'CAT 1'),
    /invalid CAT 1 bypass data/
);
const normalized = context.normalizeImportedCat5Bypasses({
    '1000001::1P1': { bypassed: true, note: 'kept', timestamp: 5, bin: '1000001', deviceNumber: '1P1' }
});
assert.equal(normalized['1000001::1P1'].note, 'kept');

const conveyor = context.getMapDeviceReportTestInfo(device({ device_type: 'Conveyor' }), 2026, '1000001');
assert.equal(conveyor.requiresPVI, false);
assert.equal(conveyor.pviBypassed, false);
const dismantled = context.getMapDeviceReportTestInfo(device({ device_status: 'DISMANTLED' }), 2026, '1000001');
assert.equal(dismantled.requiresCat1, false);
assert.equal(dismantled.cat1Bypassed, false);

console.log('Device Report CAT 1 and PVI bypasses match the CAT 5 bypass, including notes.');
