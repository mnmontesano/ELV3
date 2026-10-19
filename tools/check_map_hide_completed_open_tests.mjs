#!/usr/bin/env node
// Run with: node tools/check_map_hide_completed_open_tests.mjs
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

const hiddenFn = sliceBetween(
    '        function isBuildingHiddenByMapSettings(building) {',
    '        function isBuildingVisibleInCurrentMapFilters(building) {'
);
assert.match(hiddenFn, /mapCompletedBuildingHiddenWhileHideCompleted\(building\)/);
assert.doesNotMatch(hiddenFn, /building\.isCompleted && !mapCompletedBuildingStillNeedsCat5InCurrentView/);

const monthVisibility = sliceBetween(
    '        function applyMonthLabeledVisibility() {',
    '        function toggleHideMonthLabeled() {'
);
assert.match(monthVisibility, /mapCompletedBuildingHiddenWhileHideCompleted\(building\)/);
assert.doesNotMatch(monthVisibility, /hideCompleted && building\.isCompleted/);

const visibleBins = sliceBetween(
    '        function getMapViewVisibleBins(view) {',
    '        function mapViewHasScheduledDates(view, bin, building) {'
);
assert.match(visibleBins, /mapDevicesStillMissingUnbypassedTest\(group && group\.devices, bin\)/);

const hideCompletedFilter = sliceBetween(
    "            if (filterValue === 'hide-completed') {",
    "            if (filterValue === 'completed-open-tests') {"
);
assert.match(hideCompletedFilter, /mapDevicesStillMissingUnbypassedTest\(group && group\.devices, bin\)/);

const additional = sliceBetween(
    '        function shouldHideCompletedAdditionalLocation(location) {',
    '        function getMapCompletionKeyDisplayLabel(key) {'
);
assert.match(additional, /mapDevicesStillMissingUnbypassedTest\(devices, binHint\)/);
assert.doesNotMatch(additional, /return isHideCompletedActive\(\) && isAdditionalLocationCompleted\(location\)/);

const hiddenCount = sliceBetween(
    '                // Completed buildings with an unbypassed missing test stay on the map.',
    '                // Keep in-process buildings searchable even when hidden by this setting.'
);
assert.match(hiddenCount, /mapDevicesStillMissingUnbypassedTest\(group && group\.devices, bin\)/);
assert.match(hiddenCount, /!completedStaysVisible/);

const storage = new Map();
const context = {
    console,
    localStorage: {
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, String(value)); },
        removeItem(key) { storage.delete(key); }
    },
    window: { lastBulkSearchResults: { binGroups: {} } },
    document: { getElementById() { return null; } },
    MAP_CAT5_BYPASSES_STORAGE_KEY: 'verticalTerminal.mapCat5Bypasses.v1',
    MAP_CAT1_BYPASSES_STORAGE_KEY: 'verticalTerminal.mapCat1Bypasses.v1',
    MAP_PVI_BYPASSES_STORAGE_KEY: 'verticalTerminal.mapPviBypasses.v1',
    mapCat5Bypasses: {},
    mapCat1Bypasses: {},
    mapPviBypasses: {},
    groups: {},
    hideCompleted: true,
    cat5ViewBin: '',
    isNotApplicableMapDevice: device => !!device.map_not_applicable,
    isDumbwaiterDevice: () => false,
    isConveyorDevice: device => String(device.device_type || '').toUpperCase().includes('CONVEYOR'),
    isAccessibilityLiftDevice: () => false,
    isHydraulicDevice: () => false,
    isEscalatorOrMovingWalkDevice: () => false,
    parseMapInspectionDate(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
    },
    getMapGroupForBin(bin) { return context.groups[String(bin)] || null; },
    isHideCompletedActive() { return context.hideCompleted; },
    isHideInProcessActive() { return false; },
    isHideHoldActive() { return false; },
    isAdditionalLocationCompleted(location) { return !!(location && location.completed); },
    getAdditionalLocationCompletionKey(location) { return location && location.key ? String(location.key) : ''; },
    getSelectedMapViewFilter() { return context.cat5ViewBin ? 'cat5:2028' : 'all'; },
    mapBuildingHasCat5DueForYear(bin) { return String(bin) === context.cat5ViewBin; },
    addMapActivity() {},
    showMapNotification() {},
    updateMapBypassedTestsPanel() {},
    updateMapCategory5Panel() {}
};
vm.createContext(context);
vm.runInContext([
    sliceBetween('        function getMapTestBypassConfig(kind) {', '        function syncMapNoteDraft(bin, value) {'),
    sliceBetween('        function getMapDeviceReportTestInfo(device, currentYear, binHint) {', '        function getMapDeviceReportNextTestAvailability(testInfo, today) {'),
    sliceBetween('        function mapDobDeviceIsActiveForCompletion(device) {', '        function getMapNextRequiredTestLabel(device, year, binHint) {'),
    sliceBetween('        function shouldHideCompletedAdditionalLocation(location) {', '        function getMapCompletionKeyDisplayLabel(key) {'),
    sliceBetween('        function mapBinStillNeedsCat5InCurrentView(bin) {', '        function isBuildingVisibleInCurrentMapFilters(building) {')
].join('\n'), context);

function device(extra) {
    return {
        device_number: '1P1',
        device_type: 'Passenger Elevator',
        device_status: 'ACTIVE',
        periodic_latest_inspection: '2026-03-01',
        cat1_latest_report_filed: '2025-03-01',
        cat5_latest_report_filed: '2024-03-01',
        ...(extra || {})
    };
}

const missingCat1 = device();
const filed = device({
    device_number: '2P2',
    cat1_latest_report_filed: '2026-04-01'
});
const removed = device({
    device_number: '3P3',
    device_status: 'REMOVED'
});

assert.equal(context.mapDevicesStillMissingUnbypassedTest([], '1000001', 2026), false);
assert.equal(context.mapDevicesStillMissingUnbypassedTest([filed], '1000001', 2026), false);
assert.equal(context.mapDevicesStillMissingUnbypassedTest([removed], '1000001', 2026), false);
assert.equal(context.mapDevicesStillMissingUnbypassedTest([missingCat1], '1000001', 2026), true);
assert.equal(context.mapDevicesStillMissingUnbypassedTest([filed, missingCat1], '1000001', 2026), true);

context.setMapDeviceTestBypass('cat1', '1000001', '1P1', { bypassed: true, note: 'Not our car' });
assert.equal(
    context.mapDevicesStillMissingUnbypassedTest([missingCat1], '1000001', 2026),
    false,
    'a bypass on the missing CAT 1 lets the building hide'
);

const missingBoth = device({
    device_number: '4P4',
    periodic_latest_inspection: '2025-03-01',
    cat1_latest_report_filed: '2025-03-01'
});
context.setMapDeviceTestBypass('pvi', '1000002', '4P4', { bypassed: true });
assert.equal(
    context.mapDevicesStillMissingUnbypassedTest([missingBoth], '1000002', 2026),
    true,
    'a bypass on a different test does not cover the test that is still missing'
);
context.setMapDeviceTestBypass('cat1', '1000002', '4P4', { bypassed: true });
assert.equal(context.mapDevicesStillMissingUnbypassedTest([missingBoth], '1000002', 2026), false);

const dueCat5 = device({
    device_number: '5P5',
    cat1_latest_report_filed: '2026-04-01',
    cat5_latest_report_filed: '2020-03-01'
});
assert.equal(context.mapDevicesStillMissingUnbypassedTest([dueCat5], '1000003', 2026), true);
context.setMapDeviceTestBypass('cat5', '1000003', '5P5', { bypassed: true });
assert.equal(context.mapDevicesStillMissingUnbypassedTest([dueCat5], '1000003', 2026), false);

context.groups = {
    '1000001': { devices: [missingCat1] },
    '1000004': { devices: [filed] }
};
const openBuilding = { bin: '1000001', isCompleted: true };
const doneBuilding = { bin: '1000004', isCompleted: true };
assert.equal(context.mapCompletedBuildingStillMissingUnbypassedTest(openBuilding), false);
assert.equal(context.isBuildingHiddenByMapSettings(openBuilding), true, 'bypassed missing CAT 1 is hidden');
assert.equal(context.isBuildingHiddenByMapSettings(doneBuilding), true, 'a fully filed completed building is hidden');

context.clearMapDeviceTestBypass('cat1', '1000001', '1P1');
assert.equal(context.mapCompletedBuildingStillMissingUnbypassedTest(openBuilding), true);
assert.equal(context.isBuildingHiddenByMapSettings(openBuilding), false, 'an unbypassed missing test stays on the map');

context.hideCompleted = false;
assert.equal(context.isBuildingHiddenByMapSettings(doneBuilding), false);
context.hideCompleted = true;

context.cat5ViewBin = '1000004';
assert.equal(context.isBuildingHiddenByMapSettings(doneBuilding), false, 'CAT 5 view still keeps a due building visible');
context.cat5ViewBin = '';
assert.equal(context.isBuildingHiddenByMapSettings(doneBuilding), true);

const customLocation = {
    completed: true,
    key: 'custom:40.700000,-74.000000',
    devices: [device({ device_number: '9P9', cat1_latest_report_filed: '2025-01-01' })]
};
assert.equal(context.shouldHideCompletedAdditionalLocation(customLocation), false);
context.setMapDeviceTestBypass('cat1', customLocation.key, '9P9', { bypassed: true });
assert.equal(context.shouldHideCompletedAdditionalLocation(customLocation), true);
assert.equal(context.shouldHideCompletedAdditionalLocation({ completed: true, key: 'custom:1,1', devices: [] }), true);

console.log('Completed buildings with an unbypassed missing test stay on the map.');
