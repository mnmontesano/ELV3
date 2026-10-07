#!/usr/bin/env node
// Run with: node tools/check_map_review_section.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(html, /id="mcpReview"/);
assert.match(html, /Review - <span id="mapReviewCount">/);
assert.match(html, /id="reviewBuildingsList"/);
assert.match(html, /id="mapReviewDeviceCount"/);
assert.match(html, /Devices to review/);
assert.match(html, /function renderMapDashboardReviewList/);
assert.match(html, /<option value="completed-open-tests">Completed with open tests<\/option>/);
assert.match(html, /<option value="month:REVIEW">REVIEW<\/option>/);
assert.doesNotMatch(html, /<option value="review">/);
assert.ok(
    html.indexOf('id="mcpCompleted"') < html.indexOf('id="mcpReview"'),
    'Review sits with the completed settings, after Completed'
);

const start = html.indexOf('        function mapReviewMarkedScope(completionType) {');
const end = html.indexOf('        function updateMapReviewPanel() {', start);
assert.ok(start >= 0 && end > start, 'review helpers must exist');

const source = `
let completedStore = {};
let groupStore = {};
function getMapCompleted() { return completedStore; }
function getMapGroupForBin(bin) { return groupStore[bin] || null; }
function getMapBuildingCompletionFacts(group) { return group.facts; }
function getMapBuildingAddressForBin() { return ''; }
function normalizeMapCompletedTestType(value) {
    const text = String(value || '').trim();
    if (text === 'PVI') return 'PVI';
    if (text === 'Category') return 'Category';
    if (text === 'Legacy') return 'Legacy';
    if (text === 'Full') return 'Full';
    return '';
}
function getMapCompletedTestLabel(value) {
    const normalized = normalizeMapCompletedTestType(value) || 'Full';
    if (normalized === 'PVI') return 'PVI completed only';
    if (normalized === 'Category') return 'Category completed only';
    if (normalized === 'Legacy') return 'Legacy completion — scope not specified';
    return 'PVI and Category completed';
}
${html.slice(start, end)}
this.getMapReviewBuildings = getMapReviewBuildings;
this.mapReviewDevicePendingTests = mapReviewDevicePendingTests;
this.setCompleted = function(value) { completedStore = value; };
this.setGroups = function(value) { groupStore = value; };
`;

const context = vm.createContext({});
vm.runInContext(source, context);

const filed = new Date(2026, 2, 4);
const info = (overrides) => Object.assign({
    requiresPVI: false,
    hasPVI: false,
    pviDate: null,
    requiresCat1: false,
    hasCat1: false,
    cat1Date: null,
    requiresCat5: false,
    hasCat5: false,
    cat5Date: null
}, overrides);

const device = (number, deviceInfo) => ({
    device: { device_number: number },
    info: deviceInfo
});

const pending = (deviceInfo, completionType) => JSON.parse(JSON.stringify(
    context.mapReviewDevicePendingTests(deviceInfo, completionType)
));

assert.deepEqual(pending(info({
    requiresPVI: true,
    hasPVI: true,
    pviDate: filed,
    requiresCat1: true
}), 'PVI'), []);
assert.deepEqual(pending(info({
    requiresPVI: true,
    requiresCat1: true
}), 'PVI'), ['PVI']);
assert.deepEqual(pending(info({
    requiresPVI: true,
    requiresCat1: true,
    requiresCat5: true
}), 'Category'), ['CAT 1', 'CAT 5']);
assert.deepEqual(pending(info({
    requiresPVI: true,
    requiresCat1: true,
    hasCat1: true,
    cat1Date: filed
}), 'Full'), ['PVI']);
assert.deepEqual(pending(info({
    requiresPVI: true
}), 'Legacy'), ['PVI']);

const openPvi = info({ requiresPVI: true, requiresCat1: true });
const done = info({
    requiresPVI: true,
    hasPVI: true,
    pviDate: filed,
    requiresCat1: true,
    hasCat1: true,
    cat1Date: filed
});
const missingCat = info({
    requiresPVI: true,
    hasPVI: true,
    pviDate: filed,
    requiresCat1: true
});

context.setGroups({
    '100001': {
        address: '10 Review Street',
        facts: {
            activeDeviceCount: 2,
            deviceFacts: [device('2', missingCat), device('1', done)]
        }
    },
    '100002': {
        address: '2 Finished Avenue',
        facts: { activeDeviceCount: 1, deviceFacts: [device('1', done)] }
    },
    '100003': {
        address: '3 Partial Place',
        facts: { activeDeviceCount: 1, deviceFacts: [device('9', openPvi)] }
    },
    '100004': {
        address: '4 Category Court',
        facts: {
            activeDeviceCount: 1,
            deviceFacts: [device('4', info({ requiresCat5: true, requiresPVI: true, hasPVI: true, pviDate: filed }))]
        }
    }
});
context.setCompleted({
    '100001': { address: '10 Review Street', status: 'Completed', testType: 'Full', completionType: 'Full' },
    '100002': { address: '2 Finished Avenue', status: 'Completed', testType: 'Full', completionType: 'Full' },
    '100003': { address: '3 Partial Place', status: 'Completed', testType: 'PVI', completionType: 'PVI' },
    '100004': { address: '4 Category Court', status: 'Completed', testType: 'Category', completionType: 'Category' },
    '100005': { address: '5 Not Loaded', status: 'Completed', testType: 'Full', completionType: 'Full' },
    '100006': { address: '6 Not Completed', status: 'Not Completed', testType: 'Full', completionType: 'Full' }
});

const rows = JSON.parse(JSON.stringify(context.getMapReviewBuildings(2026)));
assert.deepEqual(rows.map(row => row.bin), ['100003', '100004', '100001']);
assert.deepEqual(rows.find(row => row.bin === '100001').devices, [
    { number: '2', pending: ['CAT 1'] }
]);
assert.deepEqual(rows.find(row => row.bin === '100003').devices, [
    { number: '9', pending: ['PVI'] }
]);
assert.deepEqual(rows.find(row => row.bin === '100004').devices, [
    { number: '4', pending: ['CAT 5'] }
]);
assert.equal(rows.some(row => row.bin === '100002'), false);
assert.equal(rows.some(row => row.bin === '100005'), false);

console.log('Review lists completed buildings whose marked tests are still open for the year.');
