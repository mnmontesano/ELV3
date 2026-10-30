#!/usr/bin/env node
// Run with: node tools/check_map_hover_schedule.mjs
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

assert.match(html, /const MAP_AVAILABILITY_TOOLTIP_MAX_ROWS = 3;/);
assert.doesNotMatch(html, /MAP_AVAILABILITY_TOOLTIP_MAX_ROWS = 8/);
assert.match(html, /buildMapScheduledTestDatesTooltipHtml\(scheduleKey \|\| noteBin\)/);
assert.match(
    html,
    /attachMapTestingAvailabilityTooltip\(additionalMarker, additionalMarker\._mapMarkerMeta\.title, \{ readyDevices, notReadyDevices, completedDevices \}, new Date\(\)\.getFullYear\(\), location\.bin \? String\(location\.bin\) : '', location\.bin \? String\(location\.bin\) : getAdditionalLocationCompletionKey\(location\)\)/
);

const schedules = {};
const notes = {};
const aliases = {};
const context = {
    console,
    schedules,
    notes,
    aliases,
    getMapAddressAliasesForBin(bin) { return context.aliases[bin] || []; },
    escapeMapSuggestionHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    getMapNote(bin) { return context.notes[bin] || ''; },
    getMapTypedScheduleRows(bin) { return (context.schedules[bin] || []).slice(); }
};
vm.createContext(context);
vm.runInContext([
    sliceBetween(
        '        const MAP_AVAILABILITY_TOOLTIP_MAX_ROWS = 3;',
        '        function attachMapMarkerPopupClickHandler(marker) {'
    ),
    sliceBetween(
        '        function formatMapTestDateRange(startDate, endDate) {',
        '        function getMapDobCompletionTimeframe(bin, type, year) {'
    )
].join('\n'), context);

function device(number) {
    return { number, nextRequiredTest: 'CAT 1' };
}

const fourReady = context.buildMapTestingAvailabilityDevicesHtml({
    readyDevices: [device('1P1'), device('2P2'), device('3P3'), device('4P4')],
    notReadyDevices: [],
    completedDevices: []
}, 2026);
assert.equal((fourReady.match(/class="map-availability-row"/g) || []).length, 3);
assert.match(fourReady, /1P1/);
assert.match(fourReady, /2P2/);
assert.match(fourReady, /3P3/);
assert.doesNotMatch(fourReady, /4P4/);
assert.match(fourReady, /\+1 more device · click for details/);

context.schedules['1000001'] = [
    { type: 'category', date: '2026-11-03', source: 'scheduled' },
    { type: 'pvi', date: '2026-10-20', source: 'scheduled' }
];
const schedule = context.buildMapScheduledTestDatesTooltipHtml('1000001');
assert.match(schedule, /Scheduled test dates/);
assert.match(schedule, /PVI/);
assert.match(schedule, /CATEGORY/);
assert.match(schedule, /Oct 20, 2026/);
assert.match(schedule, /Nov 3, 2026/);
assert.ok(schedule.indexOf('PVI') < schedule.indexOf('CATEGORY'), 'sooner scheduled date is listed first');

const devicesHtml = context.buildMapTestingAvailabilityDevicesHtml({
    readyDevices: [device('1P1'), device('2P2')],
    notReadyDevices: [],
    completedDevices: []
}, 2026);
const tooltip = context.buildMapTestingAvailabilityTooltipHtml('1 Main St', devicesHtml, '1000001');
assert.match(tooltip, /1 Main St/);
assert.match(tooltip, /Scheduled test dates/);
assert.match(tooltip, /Oct 20, 2026/);
assert.match(tooltip, /1P1/);
assert.match(tooltip, /2P2/);
assert.ok(tooltip.indexOf('map-availability-schedule') < tooltip.indexOf('1P1'));
assert.equal((tooltip.match(/class="map-availability-row"/g) || []).length, 4);

const onlySchedule = context.buildMapTestingAvailabilityTooltipHtml('1 Main St', '', '1000001');
assert.match(onlySchedule, /Oct 20, 2026/);
assert.doesNotMatch(onlySchedule, /No device testing dates on file/);

context.schedules['1000002'] = [{ type: 'general', date: '2026-12-01', source: 'scheduled' }];
const single = context.buildMapScheduledTestDatesTooltipHtml('1000002');
assert.match(single, /Scheduled test date</);
assert.match(single, /UNSPECIFIED/);
assert.match(single, /Dec 1, 2026/);

delete context.schedules['1000001'];
context.notes['1000001'] = 'Call the super';
const noteOnly = context.buildMapTestingAvailabilityTooltipHtml('1 Main St', '', '1000001');
assert.match(noteOnly, /Call the super/);
assert.match(noteOnly, /No device testing dates on file/);
assert.doesNotMatch(noteOnly, /map-availability-schedule/);

context.aliases['1000001'] = [{ name: '123 Main St' }, { name: 'Old <Name>' }];
const withAlias = context.buildMapTestingAvailabilityTooltipHtml('1 Main St', '', '1000001');
assert.match(withAlias, /map-availability-alias[^>]*>🔁 123 Main St · Old &lt;Name&gt;</);
assert.ok(withAlias.indexOf('map-availability-alias') < withAlias.indexOf('Call the super'));
delete context.aliases['1000001'];
context.aliases['999'] = [{ name: 'Alias only' }];
assert.match(context.buildMapTestingAvailabilityTooltipHtml('1 Main St', '', '999'), /Alias only/);
delete context.aliases['999'];

assert.equal(context.buildMapScheduledTestDatesTooltipHtml(''), '');
assert.equal(context.buildMapTestingAvailabilityTooltipHtml('1 Main St', '', '999'), '');

context.schedules['1000003'] = [{ type: 'pvi', date: '2026-10-21', source: 'scheduled' }];
const before = context.buildMapTestingAvailabilityTooltipHtml('1 Main St', '', '', '1000003');
assert.match(before, /Oct 21, 2026/);
context.schedules['1000003'] = [{ type: 'pvi', date: '2026-10-28', source: 'scheduled' }];
const after = context.buildMapTestingAvailabilityTooltipHtml('1 Main St', '', '', '1000003');
assert.match(after, /Oct 28, 2026/);
assert.doesNotMatch(after, /Oct 21, 2026/);

console.log('Hover preview shows scheduled test dates and at most 3 devices.');
