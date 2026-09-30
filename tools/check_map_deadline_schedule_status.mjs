#!/usr/bin/env node
// Run with: node tools/check_map_deadline_schedule_status.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('        function getMapDeadlineScheduleStatus(bin, deadline, todayKey) {');
assert.ok(start >= 0, 'getMapDeadlineScheduleStatus must exist');
const end = html.indexOf('        function getMapDashboardStats() {', start);
assert.ok(end > start, 'getMapDeadlineScheduleStatus must precede getMapDashboardStats');

const schedules = {};
const context = {
    getMapTypedScheduleRows(bin) {
        return (schedules[bin] || []).map(([type, date]) => ({ type, date }));
    }
};
vm.createContext(context);
vm.runInContext(html.slice(start, end), context);
const status = (bin, type, date, today = '2026-09-30') =>
    JSON.parse(JSON.stringify(context.getMapDeadlineScheduleStatus(bin, { type, date }, today)));

assert.deepEqual(status('none', 'category', '2026-11-01'),
    { isScheduled: false, scheduledDate: '', isAfterDeadline: false }, 'no schedule means not scheduled');

schedules.typed = [['pvi', '2026-10-10'], ['category', '2026-10-20']];
assert.equal(status('typed', 'category', '2026-11-01').scheduledDate, '2026-10-20', 'CAT deadline uses CAT schedule');
assert.equal(status('typed', 'pvi', '2026-11-01').scheduledDate, '2026-10-10', 'PVI deadline uses PVI schedule');

schedules.otherType = [['pvi', '2026-10-10']];
assert.equal(status('otherType', 'category', '2026-11-01').isScheduled, false, 'a PVI date does not cover a CAT deadline');

schedules.general = [['general', '2026-10-05']];
assert.equal(status('general', 'category', '2026-11-01').isScheduled, true, 'unspecified dates count for any deadline');

schedules.past = [['category', '2026-09-01']];
assert.deepEqual(status('past', 'category', '2026-11-01'),
    { isScheduled: true, scheduledDate: '2026-09-01', isAfterDeadline: false },
    'past on-time schedule dates still count as scheduled');

schedules.missedDeadline = [['category', '2026-09-10']];
assert.deepEqual(status('missedDeadline', 'category', '2026-09-15'),
    { isScheduled: true, scheduledDate: '2026-09-10', isAfterDeadline: false },
    'a past schedule that was on time for a missed deadline still counts');

schedules.today = [['category', '2026-09-30']];
assert.equal(status('today', 'category', '2026-11-01').isScheduled, true, 'a test scheduled today counts');

schedules.late = [['category', '2026-12-01']];
assert.deepEqual(status('late', 'category', '2026-11-01'),
    { isScheduled: true, scheduledDate: '2026-12-01', isAfterDeadline: true }, 'a date after the deadline is flagged');

schedules.pastLate = [['category', '2026-11-20']];
assert.deepEqual(status('pastLate', 'category', '2026-11-01'),
    { isScheduled: true, scheduledDate: '2026-11-20', isAfterDeadline: true },
    'a past schedule after the deadline is flagged LATE, not missing');

schedules.mixed = [['category', '2026-12-01'], ['category', '2026-10-15']];
assert.deepEqual(status('mixed', 'category', '2026-11-01'),
    { isScheduled: true, scheduledDate: '2026-10-15', isAfterDeadline: false }, 'an on-time date is preferred');

schedules.mixedPastAndUpcoming = [['category', '2026-09-01'], ['category', '2026-10-20'], ['category', '2026-12-01']];
assert.deepEqual(status('mixedPastAndUpcoming', 'category', '2026-11-01'),
    { isScheduled: true, scheduledDate: '2026-10-20', isAfterDeadline: false },
    'an upcoming on-time date is preferred over past on-time and late dates');

schedules.onlyPastOnTime = [['category', '2026-08-01'], ['category', '2026-09-15']];
assert.deepEqual(status('onlyPastOnTime', 'category', '2026-11-01'),
    { isScheduled: true, scheduledDate: '2026-09-15', isAfterDeadline: false },
    'when every on-time date is past, the latest on-time date is shown');

console.log('Deadline schedule status checks passed.');
