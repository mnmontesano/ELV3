#!/usr/bin/env node
// Run with: node tools/check_map_dashboard_cat5.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('        function getMapDeviceReportTestInfo(device, currentYear, binHint) {');
assert.ok(start >= 0, 'getMapDeviceReportTestInfo must exist');
const end = html.indexOf('        function getMapDeviceReportPendingTests(testInfo) {', start);
assert.ok(end > start, 'getMapDeviceReportPendingTests must follow getMapDeviceReportTestInfo');

const context = {
    isNotApplicableMapDevice: device => !!device.map_not_applicable,
    isDumbwaiterDevice: () => false,
    isConveyorDevice: () => false,
    isAccessibilityLiftDevice: () => false,
    isHydraulicDevice: device => String(device.machine_type || '').toUpperCase() === 'HYDRAULIC',
    isEscalatorOrMovingWalkDevice: () => false,
    isMapDeviceCat5Bypassed: device => !!device.bypassed,
    isMapDeviceCat1Bypassed: device => !!device.cat1Bypassed,
    isMapDevicePviBypassed: device => !!device.pviBypassed,
    getMapDeviceCat5BypassNote: () => '',
    getMapDeviceCat1BypassNote: () => 'cat 1 note',
    getMapDevicePviBypassNote: () => 'pvi note',
    findMapBinForDevice: () => '',
    parseMapInspectionDate(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
    }
};
vm.createContext(context);
vm.runInContext(html.slice(start, end), context);

const info = (cat5, extra) => context.getMapDeviceReportTestInfo({
    device_number: '1P1', device_type: 'Passenger Elevator', device_status: 'ACTIVE', machine_type: 'TRACTION',
    cat5_latest_report_filed: cat5, ...(extra || {})
}, 2026, '');

const filedThisYear = info('2026-07-01');
assert.equal(filedThisYear.hasCat5, true);
assert.equal(filedThisYear.requiresCat5, false, 'filing resets the 5-year clock');
assert.equal(filedThisYear.countsCat5ForYear, true, 'a CAT 5 filed this year still counts as done for the year');

assert.equal(info('2020-05-01').countsCat5ForYear, true, 'an overdue CAT 5 counts as required');
assert.equal(info('2024-05-01').countsCat5ForYear, false, 'a CAT 5 not yet due is not counted');
assert.equal(info('2026-06-01', { machine_type: 'HYDRAULIC' }).countsCat5ForYear, false, 'CAT 5-exempt types are not counted');
assert.equal(info('2026-06-01', { bypassed: true }).countsCat5ForYear, false, 'bypassed devices are not counted');
assert.equal(info('2026-06-01', { map_not_applicable: true }).countsCat5ForYear, false, 'N/A devices are not counted');

const bypassedAnnual = info('2024-05-01', { cat1Bypassed: true, pviBypassed: true });
assert.equal(bypassedAnnual.requiresCat1, false, 'a CAT 1 bypass removes the CAT 1 requirement');
assert.equal(bypassedAnnual.requiresPVI, false, 'a PVI bypass removes the PVI requirement');
assert.equal(bypassedAnnual.cat1Bypassed, true);
assert.equal(bypassedAnnual.pviBypassed, true);
assert.equal(bypassedAnnual.cat1BypassNote, 'cat 1 note');
assert.equal(bypassedAnnual.pviBypassNote, 'pvi note');
assert.equal(info('2024-05-01').requiresCat1, true, 'CAT 1 stays required without a bypass');
assert.equal(info('2024-05-01').requiresPVI, true, 'PVI stays required without a bypass');

const dashboardStart = html.indexOf('        function getMapDashboardStats() {');
const dashboardSource = html.slice(dashboardStart, html.indexOf('        function formatMapDashboardPercent(', dashboardStart));
assert.match(dashboardSource, /if \(info\.countsCat5ForYear\) \{\s*stats\.cat5\.devicesRequired\+\+;\s*if \(info\.hasCat5\) stats\.cat5\.devicesDone\+\+;/,
    'dashboard CAT 5 progress counts devices filed this year');

console.log('Dashboard CAT 5 progress counts CAT 5 tests filed this year.');
