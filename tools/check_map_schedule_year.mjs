#!/usr/bin/env node
// Run with: node tools/check_map_schedule_year.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(html, /id="testDatesYearSelect"/);
assert.match(html, /id="testDatesYearSelectModal"/);
assert.match(html, /id="mapBulkScheduleYear"/);
assert.match(html, /data-map-schedule-year/);
assert.match(html, /schedulePlanningYear: getMapSchedulePlanningYear\(\)/);
assert.match(html, /schedulePlanningYear: Number\.isInteger\(Number\(view\.schedulePlanningYear\)\)/);
assert.match(html, /schedulePlanningYear: normalizeImportedSchedulePlanningYear\(source\.schedulePlanningYear\)/);
assert.match(html, /setMapSchedulePlanningYear\(view\.schedulePlanningYear, \{ silent: true \}\)/);
assert.match(html, /mapDateIsInScheduleYear\(row\.date, selectedYear\)/);
assert.match(html, /mapScheduleYearMismatchMessage\(val\)/);
assert.match(html, /mapScheduleYearMismatchMessage\(dateStr\)/);

function slice(startMarker, endMarker) {
    const start = html.indexOf(startMarker);
    assert.ok(start >= 0, `${startMarker.trim()} must exist`);
    const end = html.indexOf(endMarker, start + startMarker.length);
    assert.ok(end > start, `${endMarker.trim()} must follow ${startMarker.trim()}`);
    return html.slice(start, end);
}

const source = [
    slice('        function mapScheduleDateYear(dateStr) {', '        function mapScheduleDatesAfterYear(dates, year) {'),
    slice('        function mapScheduleDatesAfterYear(dates, year) {', '        function clearScheduledDatesForCompletion(bin, completionType, options) {'),
    slice('        function formatLocalDateInputValue(value) {', '        function getMapDobSuggestedCompletionType(completionFacts) {'),
    slice('        let mapSchedulePlanningYear = null;', '        function openTestDatesModal(bin) {')
].join('\n');

const stored = { dates: {} };
const context = {
    document: {
        querySelectorAll: () => [],
        getElementById: () => null,
        addEventListener: () => {}
    },
    getMapTestDates: () => stored.dates,
    getMapScheduleDates: value => {
        const record = value && typeof value === 'object' ? value : {};
        return [...(record.pvi || []), ...(record.category || []), ...(record.general || [])];
    },
    updateTestDatesPanel: () => { context.panelUpdates += 1; },
    panelUpdates: 0
};
vm.createContext(context);
vm.runInContext(source, context);

const currentYear = new Date().getFullYear();
const choices = context.getMapScheduleYearChoices();
assert.ok(choices.some(choice => choice.year === currentYear && /this year/.test(choice.label)));
assert.ok(choices.some(choice => choice.year === currentYear + 1 && /next year/.test(choice.label)));
assert.equal(context.getMapSchedulePlanningYear(), currentYear);

stored.dates = { '1000001': { pvi: ['2027-04-02'], category: ['2025-01-15'], general: [] } };
const withSaved = context.getMapScheduleYearChoices().map(choice => choice.year);
assert.ok(withSaved.includes(2027));
assert.ok(withSaved.includes(2025));
assert.ok(withSaved.includes(currentYear));
assert.ok(withSaved.includes(currentYear + 1));

assert.equal(context.setMapSchedulePlanningYear(currentYear + 1), currentYear + 1);
assert.equal(context.getMapSchedulePlanningYear(), currentYear + 1);
assert.equal(context.defaultMapScheduleDateForYear(currentYear + 1), `${currentYear + 1}-01-01`);
assert.equal(
    vm.runInContext(`defaultMapScheduleDateForYear(${currentYear + 1}, new Date(${currentYear + 1}, 2, 15))`, context),
    `${currentYear + 1}-03-15`
);
assert.equal(
    vm.runInContext(`defaultMapScheduleDateForYear(${currentYear + 1}, new Date(${currentYear}, 5, 1))`, context),
    `${currentYear + 1}-01-01`
);
const bounds = context.mapScheduleYearBounds(currentYear + 1);
assert.equal(bounds.min, `${currentYear + 1}-01-01`);
assert.equal(bounds.max, `${currentYear + 1}-12-31`);
assert.equal(context.mapDateIsInScheduleYear(`${currentYear + 1}-06-01`, currentYear + 1), true);
assert.equal(context.mapDateIsInScheduleYear(`${currentYear}-11-05`, currentYear + 1), false);
assert.match(context.mapScheduleYearMismatchMessage(`${currentYear}-11-05`), new RegExp(String(currentYear + 1)));
assert.equal(context.mapScheduleYearMismatchMessage(`${currentYear + 1}-02-02`), '');

assert.equal(context.setMapSchedulePlanningYear(1999), currentYear, 'a year outside the dropdown falls back to this year');
assert.equal(context.normalizeImportedSchedulePlanningYear ? context.normalizeImportedSchedulePlanningYear(2027) : 2027, 2027);

const importStart = html.indexOf('        function normalizeImportedSchedulePlanningYear(value) {');
const importEnd = html.indexOf('        function normalizeImportedMapView(rawData) {', importStart);
assert.ok(importStart >= 0 && importEnd > importStart);
const importContext = {};
vm.createContext(importContext);
vm.runInContext(html.slice(importStart, importEnd) + '\nthis.normalizeImportedSchedulePlanningYear = normalizeImportedSchedulePlanningYear;', importContext);
assert.equal(importContext.normalizeImportedSchedulePlanningYear(2027), 2027);
assert.equal(importContext.normalizeImportedSchedulePlanningYear('2027'), 2027);
assert.equal(importContext.normalizeImportedSchedulePlanningYear('next'), null);
assert.equal(importContext.normalizeImportedSchedulePlanningYear(1999), null);
assert.equal(importContext.normalizeImportedSchedulePlanningYear(2101), null);

console.log(`Scheduling year dropdown offers ${currentYear} and ${currentYear + 1}, and next-year dates stay in the saved map file.`);
