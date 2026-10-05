#!/usr/bin/env node
// Run with: node tools/check_map_completed_dates.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function slice(startMarker, endMarker) {
    const start = html.indexOf(startMarker);
    assert.ok(start >= 0, `${startMarker.trim()} must exist`);
    const end = html.indexOf(endMarker, start);
    assert.ok(end > start, `${endMarker.trim()} must follow ${startMarker.trim()}`);
    return html.slice(start, end);
}

const source = [
    slice('        const MAP_COMPLETED_TEST_OPTIONS = [', '        function getMapCompletionColor(value) {'),
    slice('        function normalizeMapDateList(value) {', '        function isMapScheduleDateUpcoming(dateStr) {'),
    slice('        // MAP completed test date helpers', '        // end MAP completed test date helpers'),
    slice('        function saveMapCompletedEntry(bin, options) {', '        function updateMapCompletionStatus(bin, value) {'),
    slice('        function clearScheduledDatesForCompletion(bin, completionType) {', '        function addMapCalendarMonths(value, months) {'),
    slice('        function formatLocalDateInputValue(value) {', '        function getMapDobSuggestedCompletionType(completionFacts) {')
].join('\n') + `
this.setTestDates = value => { mapTestDates = value; };
this.getTestDates = () => mapTestDates;
`;

let completedStore = {};
const context = {
    mapTestDates: {},
    getMapCompleted: () => completedStore,
    setMapCompleted: value => { completedStore = value; },
    getMapBuildingAddressForBin: () => '1 Test St'
};
vm.createContext(context);
vm.runInContext(source, context);
const plain = value => JSON.parse(JSON.stringify(value));

assert.deepEqual(plain(context.getMapCompletionDateLanes('PVI')), ['pvi']);
assert.deepEqual(plain(context.getMapCompletionDateLanes('Category')), ['category']);
assert.deepEqual(plain(context.getMapCompletionDateLanes('Full')), ['pvi', 'category']);
assert.deepEqual(plain(context.getMapCompletionDateLanes('Legacy')), []);

assert.deepEqual(plain(context.normalizeMapCompletedDatesRecord({ pvi: ['2026-10-03', '2026-10-01', '2026-10-03'], cat: '2026-09-01' })),
    { pvi: ['2026-10-01', '2026-10-03'], category: ['2026-09-01'] }, 'dates are deduped, sorted, and cat is an alias');
assert.equal(context.getMapLatestCompletedDate({ pvi: ['2026-10-01'], category: ['2026-10-05', '2026-09-01'] }), '2026-10-05');

assert.deepEqual(plain(context.mergeMapCompletedDates({ pvi: ['2026-05-01'] }, { category: ['2026-09-01'] }, 'Full')),
    { pvi: ['2026-05-01'], category: ['2026-09-01'] }, 'adding Category keeps saved PVI dates');
assert.deepEqual(plain(context.mergeMapCompletedDates({ pvi: ['2026-05-01'] }, { pvi: ['2026-06-01', '2026-06-02'] }, 'PVI')),
    { pvi: ['2026-06-01', '2026-06-02'], category: [] }, 'new dates replace that test\'s saved dates');
assert.deepEqual(plain(context.mergeMapCompletedDates({ pvi: ['2026-05-01'], category: ['2026-09-01'] }, { pvi: ['2026-05-01'] }, 'PVI')),
    { pvi: ['2026-05-01'], category: [] }, 'dates outside the completion scope are dropped');

assert.deepEqual(plain(context.overrideMapScheduleWithCompletedDates(
    { pvi: ['2026-10-10'], category: ['2026-12-01'], general: ['2026-10-12'] },
    { pvi: ['2026-10-03'] }
)), { pvi: [], category: ['2026-12-01'], general: [] }, 'a PVI completion replaces the PVI and unspecified scheduled dates only');

context.setTestDates({ b1: { pvi: ['2026-09-20', '2026-10-20'], category: [], general: ['2025-01-05'] } });
assert.deepEqual(plain(context.getMapCompletionDefaultDates('b1', 'pvi', null, '2026-10-01')), ['2026-09-20', '2026-10-20'],
    'keeps every scheduled date for that test, including a later one');
assert.deepEqual(plain(context.getMapCompletionDefaultDates('b1', 'category', null, '2026-10-01')), ['2026-10-01'],
    'defaults to today when that test has no date of its own');
assert.deepEqual(plain(context.getMapCompletionDefaultDates('b1', 'pvi', { timestamp: new Date(2026, 9, 1).getTime() }, '2026-10-01')),
    ['2026-09-20', '2026-10-20'], 'a building timestamp does not replace scheduled dates');
context.setTestDates({});
assert.deepEqual(plain(context.getMapCompletionDefaultDates('b1', 'category', { scheduledDates: { category: ['2026-11-15'] } }, '2026-10-01')),
    ['2026-11-15'], 'a date already saved on the building is kept when the active schedule was cleared');
context.getMapDobCompletedTestDateRows = () => [{ type: 'category', date: '2026-08-12' }];
assert.deepEqual(plain(context.getMapCompletionDefaultDates('b1', 'category', null, '2026-10-01')), ['2026-08-12'],
    'a DOB category date is kept instead of prefilling today');
context.getMapDobCompletedTestDateRows = () => [];
context.setTestDates({ b1: { pvi: [], category: ['2026-11-15'], general: [] } });
assert.deepEqual(plain(context.getMapCompletionDefaultDates('b1', 'category', null, '2026-10-01')), ['2026-11-15'],
    'keeps the only scheduled date even when it is still upcoming');
assert.deepEqual(plain(context.getMapCompletionDefaultDates('b1', 'pvi', null, '2026-10-01')), ['2026-10-01'],
    'the other test still defaults to today');
assert.deepEqual(plain(context.getMapCompletionDefaultDates('b1', 'pvi', { completedDates: { pvi: ['2026-08-01', '2026-08-02'] } }, '2026-10-01')),
    ['2026-08-01', '2026-08-02'], 'saved completed dates win');
context.getMapDobCompletedTestDateRows = (bin) => bin === 'b7' ? [{ type: 'category', date: '2026-08-12' }] : [];
context.setTestDates({ b7: { pvi: [], category: ['2026-11-15'], general: [] } });
assert.deepEqual(plain(context.getMapCompletionDefaultDates('b7', 'category', { completedDates: { category: ['2026-10-05'] } }, '2026-10-01')),
    ['2026-08-12', '2026-11-15'], 'a DOB verified date is not replaced by a saved manual date');
context.getMapDobCompletedTestDateRows = () => [];
context.setTestDates({ b1: { pvi: ['2026-09-20', '2026-10-20'], category: [], general: ['2025-01-05'] } });
assert.deepEqual(plain(context.getMapScheduledDatesReplacedByCompletion('b1', ['pvi'], { scheduledDates: { pvi: ['2026-09-20'] } })),
    [{ type: 'pvi', date: '2026-09-20' }, { type: 'pvi', date: '2026-10-20' }, { type: 'general', date: '2025-01-05' }]);

// Marking a scheduled PVI test completed replaces the scheduled date with the completed dates.
completedStore = {};
context.setTestDates({ b2: { pvi: ['2026-10-10'], category: ['2026-12-01'], general: [] } });
const result = context.saveMapCompletedEntry('b2', {
    testType: 'PVI',
    completedDates: { pvi: ['2026-10-03', '2026-10-01'] },
    source: 'Manual'
});
const saved = plain(completedStore.b2);
assert.equal(result.completionType, 'PVI');
assert.deepEqual(saved.completedDates, { pvi: ['2026-10-01', '2026-10-03'], category: [] });
assert.deepEqual(saved.scheduledDates, { pvi: [], category: [], general: [] }, 'the scheduled PVI date is not kept');
assert.equal(saved.timestamp, new Date(2026, 9, 3).getTime(), 'timestamp is the latest completed date');
assert.deepEqual(plain(context.getTestDates().b2), { pvi: [], category: ['2026-12-01'], general: [] },
    'the active Category schedule is untouched');
assert.equal(context.getMapSavedTestCompletionForYear('b2', 'PVI', 2026).isComplete, true);
assert.equal(context.getMapSavedTestCompletionForYear('b2', 'PVI', 2025).isComplete, false);

// Completing Category later adds its own dates and keeps the PVI dates.
context.saveMapCompletedEntry('b2', {
    testType: 'Full',
    completedDates: { category: ['2026-12-02'] },
    source: 'Manual'
});
const full = plain(completedStore.b2);
assert.equal(full.completionType, 'Full');
assert.deepEqual(full.completedDates, { pvi: ['2026-10-01', '2026-10-03'], category: ['2026-12-02'] });
assert.equal(context.getTestDates().b2, undefined, 'all scheduled dates are cleared once both tests are completed');

// Both tests marked complete keeps the one scheduled date on the completed record.
completedStore = {};
context.setTestDates({ b4: { pvi: [], category: ['2026-11-15'], general: [] } });
context.saveMapCompletedEntry('b4', {
    testType: 'Full',
    completedDates: { pvi: ['2026-10-05'] },
    source: 'Manual'
});
const both = plain(completedStore.b4);
assert.equal(both.completionType, 'Full');
assert.deepEqual(both.completedDates, { pvi: ['2026-10-05'], category: ['2026-11-15'] },
    'the existing Category date stays attached when both tests are marked complete');
assert.deepEqual(both.scheduledDates, { pvi: [], category: [], general: [] });
assert.equal(context.getTestDates().b4, undefined);

// An untouched today prefill must not be added beside, or replace, a scheduled category date.
completedStore = {};
context.setTestDates({ b5: { pvi: [], category: ['2026-11-15'], general: [] } });
const todayKey = context.formatLocalDateInputValue(new Date());
context.saveMapCompletedEntry('b5', {
    testType: 'Full',
    completedDates: { pvi: [todayKey], category: [todayKey, '2026-11-15'], laneEdited: { pvi: false, category: false } },
    source: 'Manual'
});
const kept = plain(completedStore.b5);
assert.deepEqual(kept.completedDates, { pvi: [todayKey], category: ['2026-11-15'] },
    'today is not added to a category date that was already scheduled');
assert.deepEqual(kept.scheduledDates, { pvi: [], category: [], general: [] });

completedStore = {};
context.setTestDates({ b6: { pvi: [], category: ['2026-11-15'], general: [] } });
context.saveMapCompletedEntry('b6', {
    testType: 'Full',
    completedDates: { pvi: [todayKey], category: [todayKey], laneEdited: { pvi: true, category: true } },
    source: 'Manual'
});
assert.deepEqual(plain(completedStore.b6).completedDates, { pvi: [todayKey], category: [todayKey] },
    'a date the user changed to today is saved');

// A date verified with DOB is kept even when the form submits today for that test.
completedStore = {};
context.getMapDobCompletedTestDateRows = (bin) => bin === 'b7' ? [{ type: 'category', date: '2026-08-12' }, { type: 'pvi', date: '2026-07-01' }] : [];
context.setTestDates({ b7: { pvi: [], category: ['2026-11-15'], general: [] } });
context.saveMapCompletedEntry('b7', {
    testType: 'Full',
    completedDates: { pvi: [todayKey], category: [todayKey], laneEdited: { pvi: true, category: true } },
    source: 'Manual'
});
assert.deepEqual(plain(completedStore.b7.completedDates), {
    pvi: ['2026-07-01'],
    category: ['2026-08-12', '2026-11-15']
}, 'DOB verified dates are not replaced by today');
context.getMapDobCompletedTestDateRows = () => [];

// DOB auto-completion without dates keeps the old behavior.
completedStore = {};
context.setTestDates({ b3: { pvi: ['2026-10-10'], category: [], general: [] } });
context.saveMapCompletedEntry('b3', { testType: 'PVI', source: 'DOB Device Data' });
assert.equal(completedStore.b3.completedDates, undefined);
assert.deepEqual(plain(completedStore.b3.scheduledDates).pvi, ['2026-10-10'], 'scheduled dates are still recorded when no completed date is given');

console.log('MAP completed dates replace scheduled dates and support multiple dates per test.');
