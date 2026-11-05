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
assert.doesNotMatch(html, /schedulePlanningYear/, 'the map file does not save a Scheduling year, so it always opens on this year');
assert.match(html, /setMapSchedulePlanningYear\(getMapInspectionCalendarYear\(new Date\(\)\), \{ silent: true \}\)/,
    'loading a map file returns Scheduling year to this year');
assert.match(html, /id="mapScheduleYearBadge"/, 'the map shows which Scheduling year is active');
assert.match(html, /beginMapScheduleYearEditing\(\);\n            const existing = document\.getElementById\('testDatesOverlay'\);/);
assert.match(html, /beginMapScheduleYearEditing\(\);\n            const existing = document\.getElementById\('mapBulkEditOverlay'\);/);
assert.match(html, /new MutationObserver\(endMapScheduleYearEditingIfClosed\)/);
assert.match(html, /mapDateIsInScheduleYear\(row\.date, selectedYear\)/);
assert.match(html, /mapScheduleYearMismatchMessage\(val\)/);
assert.match(html, /mapScheduleYearMismatchMessage\(dateStr\)/);
assert.match(html, /followMapScheduleDateYear\(val\);/);
assert.match(html, /followMapScheduleDateYear\(dateStr\);/);
assert.match(html, /followMapScheduleDateYear\(event\.target\.value\)/);
assert.doesNotMatch(html, /id="testDateInput(?:Category|Pvi)"[^>]*\bmax=/, 'the job schedule date fields must not lock the calendar to one year');
assert.doesNotMatch(html, /id="mapBulk(?:Category|Pvi)Date"[^>]*\bmax=/, 'the bulk schedule date fields must not lock the calendar to one year');

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
const openOverlays = new Set();
const badge = { style: { display: 'none' }, parts: {}, querySelector(selector) {
    if (!this.parts[selector]) this.parts[selector] = { innerHTML: '', textContent: '' };
    return this.parts[selector];
} };
const context = {
    document: {
        querySelectorAll: () => [],
        getElementById: id => id === 'mapScheduleYearBadge' ? badge : (openOverlays.has(id) ? {} : null),
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
assert.deepEqual(
    [...choices.map(choice => choice.year)],
    [0, 1, 2, 3, 4, 5].map(offset => currentYear + offset),
    'the dropdown offers this year and the next five years'
);
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

assert.equal(context.followMapScheduleDateYear(`${currentYear + 3}-05-20`), true, 'picking a date in a future year switches to that year');
assert.equal(context.getMapSchedulePlanningYear(), currentYear + 3);
assert.equal(context.mapScheduleYearMismatchMessage(`${currentYear + 3}-05-20`), '');
assert.equal(context.followMapScheduleDateYear(`${currentYear + 3}-08-01`), false, 'a date in the selected year leaves it alone');
assert.equal(context.followMapScheduleDateYear(`${currentYear + 9}-01-10`), false, 'a year past the dropdown is not selected');
assert.equal(context.getMapSchedulePlanningYear(), currentYear + 3);
assert.match(context.mapScheduleYearMismatchMessage(`${currentYear + 9}-01-10`), new RegExp(`through ${currentYear + 5}`));
assert.equal(context.followMapScheduleDateYear('0002-05-20'), false, 'a half-typed year does not switch the dropdown');

const mapDates = [`${currentYear - 1}-12-01`, `${currentYear}-03-01`, `${currentYear + 1}-04-01`, `${currentYear + 3}-06-01`];
context.setMapSchedulePlanningYear(currentYear);
assert.deepEqual(
    [...context.filterMapScheduleDatesForMapYear(mapDates)],
    [`${currentYear - 1}-12-01`, `${currentYear}-03-01`],
    'this year on the map counts past-due and this year dates, not future-year dates'
);
context.setMapSchedulePlanningYear(currentYear + 1);
assert.deepEqual(
    [...context.filterMapScheduleDatesForMapYear(mapDates)],
    [`${currentYear - 1}-12-01`, `${currentYear}-03-01`],
    'choosing next year in Scheduling year keeps this year\'s scheduled markers on the map'
);
context.setMapSchedulePlanningYear(currentYear + 3);
assert.deepEqual(
    [...context.filterMapScheduleDatesForMapYear([`${currentYear}-11-20`, `${currentYear + 3}-06-01`])],
    [`${currentYear}-11-20`],
    'a test later this year keeps its scheduled shape while a future year is selected'
);

context.toggleMapFutureYearView(true);
assert.equal(context.isMapFutureYearView(), true);
assert.equal(context.getMapDisplayedCalendarYear(), currentYear + 1);
assert.equal(context.getMapSchedulePlanningYear(), currentYear + 1, 'the 2027 map schedules into 2027');
assert.deepEqual(
    [...context.filterMapScheduleDatesForMapYear(mapDates)],
    [`${currentYear + 1}-04-01`],
    'the 2027 map shows that year\'s scheduled markers and hides this year\'s'
);
context.toggleMapFutureYearView(false);
assert.equal(context.isMapFutureYearView(), false);
assert.equal(context.getMapSchedulePlanningYear(), currentYear);
assert.deepEqual(
    [...context.filterMapScheduleDatesForMapYear(mapDates)],
    [`${currentYear - 1}-12-01`, `${currentYear}-03-01`],
    'leaving the 2027 map brings this year\'s markers back'
);
assert.deepEqual(
    [...context.filterMapScheduleDatesThroughThisYear(mapDates)],
    [`${currentYear - 1}-12-01`, `${currentYear}-03-01`],
    'No Test by June ignores future-year dates whatever the dropdown says'
);

context.setMapSchedulePlanningYear(currentYear);
assert.equal(badge.style.display, 'none', 'no badge while scheduling this year');

// A year picked inside a schedule window goes back when the window closes.
openOverlays.add('testDatesOverlay');
context.beginMapScheduleYearEditing();
assert.equal(context.followMapScheduleDateYear(`${currentYear + 1}-03-04`), true);
assert.equal(badge.style.display, 'flex', 'the map shows the badge while next year is selected');
assert.match(badge.parts['[data-map-schedule-year-text]'].innerHTML, new RegExp(`Scheduling year: <strong>${currentYear + 1}</strong>`));
context.endMapScheduleYearEditingIfClosed();
assert.equal(context.getMapSchedulePlanningYear(), currentYear + 1, 'still next year while the window is open');
openOverlays.delete('testDatesOverlay');
context.endMapScheduleYearEditingIfClosed();
assert.equal(context.getMapSchedulePlanningYear(), currentYear, 'closing the schedule window returns to this year');
assert.equal(badge.style.display, 'none');

// Reopening a window while one is open keeps the year from before the first one opened.
openOverlays.add('mapBulkEditOverlay');
context.beginMapScheduleYearEditing();
context.setMapSchedulePlanningYear(currentYear + 2);
context.beginMapScheduleYearEditing();
openOverlays.delete('mapBulkEditOverlay');
context.endMapScheduleYearEditingIfClosed();
assert.equal(context.getMapSchedulePlanningYear(), currentYear, 'Edit Selected also returns to this year');

// Next year chosen on purpose in the Scheduled Test Dates panel stays after a window closes.
context.setMapSchedulePlanningYear(currentYear + 1);
openOverlays.add('testDatesOverlay');
context.beginMapScheduleYearEditing();
context.setMapSchedulePlanningYear(currentYear + 3);
openOverlays.delete('testDatesOverlay');
context.endMapScheduleYearEditingIfClosed();
assert.equal(context.getMapSchedulePlanningYear(), currentYear + 1, 'a year set in the panel before opening is kept');
assert.equal(badge.style.display, 'flex', 'the badge stays up for that advance view');
context.resetMapSchedulePlanningYearToCurrent();
assert.equal(context.getMapSchedulePlanningYear(), currentYear, 'Back to this year returns the map to this year');
assert.equal(badge.style.display, 'none');

console.log(`Scheduling year dropdown offers ${currentYear} through ${currentYear + 5}, follows the year of a picked date, returns to this year when a schedule window closes, and shows a map badge for other years.`);
