#!/usr/bin/env node
// Run with: node tools/check_map_text_view.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(html, /id="mapTextViewButton"/);
assert.match(html, /id="mapFilterTextViewButton"/);
assert.match(html, /id="mapTextViewExcelButton"/);
assert.match(html, /id="mapTextViewCsvButton"/);
assert.match(html, /onclick="exportMapTextViewExcel\(\)"/);
assert.match(html, /onclick="exportMapTextViewCsv\(\)"/);
assert.match(html, /onclick="closeMapViewMenu\(\); openMapTextView\(\)"/);
assert.match(html, /onclick="openMapTextView\(\)"/);
assert.match(html, /function collectMapTextViewEntries\(\)/);
assert.match(html, /buildingMap\.hasLayer\(marker\)/);
assert.match(html, /scheduleMapTextViewRefresh\(\)/);
assert.match(html, /if \(document\.getElementById\('mapTextViewModal'\)\)/);
assert.match(html, /additionalMarker\._mapTextSnapshot/);

const formatStart = html.indexOf('        // MAP_TEXT_VIEW_FORMAT_START');
const formatEnd = html.indexOf('        function renderMapTextViewBody(', formatStart);
assert.ok(formatStart >= 0 && formatEnd > formatStart, 'text view helpers must be present');

const source = html.slice(formatStart, formatEnd) + `
this.formatMapTextViewDocument = formatMapTextViewDocument;
this.collectMapTextViewEntries = collectMapTextViewEntries;
this.getMapTextViewContext = getMapTextViewContext;
this.mapTextDeviceRows = mapTextDeviceRows;
this.buildMapTextViewExportTable = buildMapTextViewExportTable;
this.formatMapTextViewCsv = formatMapTextViewCsv;
this.mapTextViewExportFileName = mapTextViewExportFileName;
`;

const visibleMarker = { id: 'visible' };
const hiddenMarker = { id: 'hidden' };
const houseMarker = {
    id: 'house',
    _mapTextSnapshot: {
        deviceCount: 0,
        complete: 0,
        incomplete: 0,
        readyDevices: [],
        notReadyDevices: [],
        completedDevices: [],
        notApplicableCount: 0,
        violations: [],
        calendarYear: 2026
    }
};
const notes = { '1000001': 'Call the super before arrival' };
const months = { '1000001': 'March', '2000002': 'April' };
const schedules = {
    '2000002': [{ type: 'category', date: '2026-04-02' }]
};

const context = {
    buildingMap: {
        hasLayer(marker) {
            return marker === visibleMarker || marker === houseMarker;
        }
    },
    mapMarkers: [visibleMarker, hiddenMarker],
    mapBuildingsData: [
        {
            bin: '1000001',
            address: '100 Broadway',
            latitude: 40.71,
            longitude: -74.01,
            deviceCount: 2,
            complete: 0,
            incomplete: 2,
            readyDevices: [{ number: '1P100', type: 'Passenger', nextRequiredTest: 'Category' }],
            notReadyDevices: [{
                number: '1P200',
                type: 'Passenger',
                nextRequiredTest: 'PVI',
                eligibleDate: new Date(2026, 5, 1),
                daysUntil: 45
            }],
            completedDevices: [],
            notApplicableDevices: [],
            violationDetails: [],
            calendarYear: 2026
        },
        {
            bin: '2000002',
            address: '200 Scheduled Avenue',
            latitude: 40.72,
            longitude: -74.02,
            deviceCount: 1,
            complete: 1,
            incomplete: 0,
            readyDevices: [],
            notReadyDevices: [],
            completedDevices: [{ number: '1P300', type: 'Passenger' }],
            notApplicableDevices: [],
            violationDetails: [],
            allRequiredTestsCompletedForYear: true,
            calendarYear: 2026,
            isCompleted: true
        }
    ],
    additionalLocationMarkers: [houseMarker],
    activeMonthFilters: new Set(['March']),
    mapHideScheduledMonthSelectionReady: true,
    getAdditionalLocations: () => [{
        isHouse: true,
        customName: 'Office house',
        latitude: 40.73,
        longitude: -74.03
    }],
    getMonthLabel: bin => months[bin] || '',
    getMapNote: bin => notes[bin] || '',
    getMapCompleted: () => ({ '2000002': { completionType: 'Full' } }),
    getMapInProcess: () => ({}),
    getMapHold: () => ({}),
    getMapFavorites: () => ({}),
    getMapTypedScheduleRows: bin => schedules[bin] || [],
    getMapDeadlinesForBin: () => [],
    getMapAddressAliasNamesForBin: () => ['Broadway Tower'],
    getMapAddressCode: bin => (bin === '1000001' ? 'A-1042' : ''),
    getMapCompletedTestLabel: () => 'PVI and Category completed',
    mapAvailabilityScheduleTypeLabel: type => String(type || '').toUpperCase(),
    formatMapTestDateRange: date => date,
    getSelectedMapViewFilter: () => 'hide-scheduled',
    getMapViewFilterDisplayLabel: () => 'Hide Scheduled Test Dates & Completed Jobs within March',
    document: {
        getElementById(id) {
            if (id === 'mapSearchInput') return { value: '' };
            return null;
        }
    }
};

vm.createContext(context);
vm.runInContext(source, context);

const entries = context.collectMapTextViewEntries();
assert.equal(entries.length, 2, 'text view keeps only markers currently on the map');
assert.deepEqual([...entries.map(entry => entry.title)], ['100 Broadway', 'Office house']);
assert.equal(entries[0].month, 'March');
assert.equal(entries[0].code, 'A-1042');
assert.equal(entries[0].note, 'Call the super before arrival');
assert.deepEqual([...entries[0].aliases], ['Broadway Tower']);
assert.equal(entries[0].ready.length, 1);
assert.match(entries[0].ready[0], /1P100/);
assert.match(entries[0].ready[0], /Available now/);
assert.match(entries[0].notReady[0], /1P200/);
assert.match(entries[0].notReady[0], /Ready on Jun 1, 2026/);
assert.match(entries[0].notReady[0], /45 days/);
assert.equal(entries[1].passthrough, true);
assert.match(entries[1].kindLabel, /House pin/);

const viewContext = context.getMapTextViewContext();
assert.equal(viewContext.heading, 'Hide Scheduled Test Dates & Completed Jobs within March');

const text = context.formatMapTextViewDocument(entries, {
    heading: viewContext.heading,
    note: '1 custom pin stays on the map with this filter (house, transportation, or a dropped pin) and is included below.'
});
assert.match(text, /^MAP text view/);
assert.match(text, /Filter: Hide Scheduled Test Dates & Completed Jobs within March/);
assert.match(text, /2 locations shown · 2 devices/);
assert.match(text, /1\. 100 Broadway/);
assert.match(text, /Code: A-1042/);
assert.match(text, /BIN: 1000001/);
assert.match(text, /Month: March/);
assert.match(text, /Also known as: Broadway Tower/);
assert.match(text, /Devices: 2 \(0 complete, 2 incomplete\)/);
assert.match(text, /Ready to test \(1\):/);
assert.match(text, /Not ready \(1\):/);
assert.match(text, /Note:\n     Call the super before arrival/);
assert.match(text, /2\. Office house/);
assert.match(text, /Map location: 40\.73000, -74\.03000/);
assert.doesNotMatch(text, /200 Scheduled Avenue/);
assert.doesNotMatch(text, /1P300/);
assert.doesNotMatch(text, /Scheduled test dates/);

const empty = context.formatMapTextViewDocument([], { heading: viewContext.heading });
assert.match(empty, /0 locations shown/);
assert.match(empty, /No locations are currently shown on the map for this filter\./);
const noFindMatch = context.formatMapTextViewDocument([], {
    heading: viewContext.heading,
    note: 'Showing 0 of 2 locations matching "Scheduled Avenue".',
    emptyMessage: 'No locations in this text match "Scheduled Avenue".'
});
assert.match(noFindMatch, /No locations in this text match "Scheduled Avenue"\./);
assert.doesNotMatch(noFindMatch, /No locations are currently shown on the map for this filter\./);

const exportMeta = { heading: viewContext.heading, findQuery: '' };
const table = context.buildMapTextViewExportTable(entries, exportMeta);
assert.equal(table.headers[0], 'Filter');
assert.equal(table.headers[2], 'Location');
assert.equal(table.rows.length, 2);
assert.equal(table.headers[3], 'Code Number');
assert.equal(table.rows[0][2], '100 Broadway');
assert.equal(table.rows[0][3], 'A-1042');
assert.equal(table.rows[0][5], '1000001');
assert.equal(table.rows[0][6], 'March');
assert.match(table.rows[0][16], /1P100 - Passenger - Category - Available now/);
assert.match(table.rows[0][17], /1P200/);
assert.match(table.rows[0][17], /45 days/);
assert.equal(table.rows[0][20], 'Call the super before arrival');
assert.equal(table.rows[1][2], 'Office house');
assert.equal(table.rows[1][3], '');
assert.equal(table.rows[1][4], 'House pin - stays on the map with filters');
assert.equal(table.rows[1][21], '40.73000');
assert.ok(!table.rows.some(row => String(row[2]).includes('200 Scheduled')));

const csv = context.formatMapTextViewCsv(entries, exportMeta);
assert.match(csv, /"Filter","Text search","Location","Code Number"/);
assert.match(csv, /"100 Broadway"/);
assert.match(csv, /"1000001"/);
assert.match(csv, /"Call the super before arrival"/);
assert.match(csv, /Hide Scheduled Test Dates & Completed Jobs within March/);
assert.doesNotMatch(csv, /200 Scheduled Avenue/);
assert.doesNotMatch(csv, /1P300/);

const tricky = context.formatMapTextViewCsv([{
    title: '100 Broadway, New York',
    kind: 'building',
    bin: '1000001',
    note: '=cmd|" /C calc"!A0',
    ready: ['1P100 - Available now'],
    notReady: [],
    completedDevices: [],
    statuses: [],
    aliases: ['Tower, West'],
    schedules: [],
    deadlines: [],
    violations: []
}], { heading: 'Hide Scheduled', findQuery: 'Broadway' });
assert.match(tricky, /"100 Broadway, New York"/);
assert.match(tricky, /"Tower, West"/);
assert.match(tricky, /"'=cmd\|"" \/C calc""!A0"/);
assert.match(tricky, /"Broadway"/);
assert.doesNotMatch(tricky, /"=cmd/);

assert.equal(
    context.mapTextViewExportFileName('csv', { heading: 'Hide Scheduled Test Dates & Completed Jobs within March' }, '2026-11-09'),
    'hide-scheduled-test-dates-and-completed-jobs-within-march-2026-11-09.csv'
);
assert.equal(
    context.mapTextViewExportFileName('xlsx', { heading: 'Current map view' }, '2026-11-09'),
    'current-map-view-2026-11-09.xlsx'
);

const parsed = new Function(html.slice(
    html.indexOf('        function formatMapTextViewHeader('),
    html.indexOf('        function openMapTableView()')
));
assert.equal(typeof parsed, 'function');

console.log('map text view checks passed');
