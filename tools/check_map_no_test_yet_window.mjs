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
assert.match(html, /data-no-test-yet-card/);
assert.match(html, /data-device-number/);
assert.match(html, /View in No Test Yet/);
const untrackedMarker = 'id="mapUntrackedDevices_${building.bin}"';
const buildingPopupSection = 'renderMapNoTestYetPopupSection(building.noTestYetDevices';
assert.ok(html.includes(untrackedMarker), 'Building popup must include untracked devices slot');
assert.ok(
    html.indexOf(buildingPopupSection) > html.indexOf(untrackedMarker),
    'Building popup No Test Yet section must appear after BIN/devices'
);
assert.equal((html.match(/renderMapNoTestYetPopupSection\(/g) || []).length, 3, 'Popup helper is defined once and used on building and additional-location popups');

const popupStart = html.indexOf('        function escapeMapNoTestYetJsString(value) {');
assert.ok(popupStart >= 0, 'escapeMapNoTestYetJsString must exist');
const popupEnd = html.indexOf('        function showMapControlsPanel() {', popupStart);
assert.ok(popupEnd > popupStart, 'Popup helper must precede showMapControlsPanel');
const popupSource = `
function escapeMapSuggestionHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
const MAP_NO_TEST_YET_COLOR = '#c0392b';
function getMapBothTestsWindow() {
    return {
        year: 2026,
        yearEnd: new Date(2026, 11, 31),
        lastFirstTestDate: new Date(2026, 9, 1),
        daysToCompleteBoth: 104,
        daysToFirstTestDeadline: 13,
        canStartInTime: true,
        gapDays: 91
    };
}
function formatMapDaysLeftLabel(days) { return days + ' days left'; }
function renderMapNoTestYetCountdownLine() { return 'countdown'; }
` + html.slice(popupStart, popupEnd) + `
this.renderMapNoTestYetPopupSection = renderMapNoTestYetPopupSection;
`;
const popupContext = vm.createContext({});
vm.runInContext(popupSource, popupContext);

assert.equal(popupContext.renderMapNoTestYetPopupSection([], { bin: '1000001' }), '');
const popupHtml = popupContext.renderMapNoTestYetPopupSection([
    { number: '1P1234', pending: ['PVI', 'CAT 1'], needsBoth: true }
], { bin: '1000001', address: '123 Main St' });
assert.match(popupHtml, /map-no-test-yet-popup/);
assert.match(popupHtml, /No test yet \(1\)/);
assert.match(popupHtml, /openMapNoTestYetSection\('1000001', '1000001'\)/);
assert.match(popupHtml, /openMapNoTestYetSection\('1000001', '1000001', '1P1234'\)/);
assert.match(popupHtml, /View in No Test Yet/);
assert.match(popupHtml, /1P1234/);
assert.match(popupHtml, /PVI \+ CAT 1/);
assert.doesNotMatch(popupHtml, /123 Main St/);

console.log('MAP No Test Yet countdown uses a 91-day Category/PVI window before year-end.');
