#!/usr/bin/env node
// Run with: node tools/check_map_no_test_yet_window.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('        // MAP annual Category + PVI window (91-day gap before year-end)');
assert.ok(start >= 0, 'Annual test window helpers must exist');
const end = html.indexOf('        function mapDeviceHasNoAnnualTest(testInfo) {', start);
assert.ok(end > start, 'mapDeviceHasNoAnnualTest must follow the window helpers');
const source = html.slice(start, end) + `
this.MAP_ANNUAL_TEST_GAP_DAYS = MAP_ANNUAL_TEST_GAP_DAYS;
this.getMapBothTestsWindow = getMapBothTestsWindow;
this.formatMapDaysLeftLabel = formatMapDaysLeftLabel;
this.mapDiffLocalDays = mapDiffLocalDays;
`;
const context = vm.createContext({});
vm.runInContext(source, context);

assert.equal(context.MAP_ANNUAL_TEST_GAP_DAYS, 91);

const window2026 = context.getMapBothTestsWindow(new Date(2026, 8, 18)); // Sep 18, 2026
assert.equal(window2026.year, 2026);
assert.equal(window2026.yearEnd.getFullYear(), 2026);
assert.equal(window2026.yearEnd.getMonth(), 11);
assert.equal(window2026.yearEnd.getDate(), 31);
assert.equal(window2026.lastFirstTestDate.getMonth(), 9);
assert.equal(window2026.lastFirstTestDate.getDate(), 1);
assert.equal(context.mapDiffLocalDays(window2026.lastFirstTestDate, window2026.yearEnd), 91);
assert.equal(window2026.canStartInTime, true);
const jan = context.getMapBothTestsWindow(new Date(2026, 0, 1));
assert.equal(jan.canStartInTime, true);
assert.equal(jan.daysToFirstTestDeadline, context.mapDiffLocalDays(new Date(2026, 0, 1), new Date(2026, 9, 1)));
assert.equal(jan.daysToCompleteBoth, context.mapDiffLocalDays(new Date(2026, 0, 1), new Date(2026, 11, 31)));

const tooLate = context.getMapBothTestsWindow(new Date(2026, 9, 2)); // Oct 2
assert.equal(tooLate.canStartInTime, false);

const lastDay = context.getMapBothTestsWindow(new Date(2026, 9, 1)); // Oct 1
assert.equal(lastDay.canStartInTime, true);
assert.equal(lastDay.daysToFirstTestDeadline, 0);

assert.equal(context.formatMapDaysLeftLabel(12), '12 days left');
assert.equal(context.formatMapDaysLeftLabel(1), '1 day left');
assert.equal(context.formatMapDaysLeftLabel(0), 'due today');
assert.equal(context.formatMapDaysLeftLabel(-3), '3 days past');

const htmlHasSection = html.includes('id="mcpNoTestYet"') && html.includes('No Test Yet');
assert.ok(htmlHasSection, 'Settings must include the No Test Yet section');
assert.match(html, /openMapNoTestYetSection/);
assert.match(html, /renderMapNoTestYetPopupSection/);

console.log('MAP No Test Yet countdown uses a 91-day Category/PVI window before year-end.');
