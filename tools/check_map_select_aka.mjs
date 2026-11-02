#!/usr/bin/env node
// Run with: node tools/check_map_select_aka.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function sliceBetween(startMarker, endMarker) {
    const start = html.indexOf(startMarker);
    const end = html.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing ${startMarker}`);
    assert.ok(end > start, `missing ${endMarker} after ${startMarker}`);
    return html.slice(start, end);
}

assert.match(html, /function getMapAddressAliasNamesForBin\(bin, extraDeviceNumbers\)/);
assert.match(html, /const aliasNames = getMapAddressAliasNamesForBin\(bin, getMapSelectInfoDeviceNumbers\(\{ deviceNumbers \}, building\)\)/);
assert.match(html, /const akaHtml = renderMapAkaAddressHtml\(summary\.aliasNames\)/);
assert.match(html, /class="map-overlap-chooser-aka"/);
assert.match(html, /const akaHtml = renderMapAkaAddressHtml\(item\.aliasNames\)/);

const elements = {};
function makeEl(id) {
    return {
        id,
        innerHTML: '',
        textContent: '',
        scrollTop: 0,
        classList: {
            classes: new Set(),
            contains(name) { return this.classes.has(name); },
            toggle(name, on) {
                if (on) this.classes.add(name);
                else this.classes.delete(name);
                return on;
            },
            add(name) { this.classes.add(name); },
            remove(name) { this.classes.delete(name); }
        }
    };
}

const popups = [];
const context = vm.createContext({
    window: { lastBulkSearchResults: { binGroups: {} } },
    document: {
        getElementById(id) {
            if (!elements[id]) elements[id] = makeEl(id);
            return elements[id];
        }
    },
    L: {
        popup() {
            const popup = {
                html: '',
                setLatLng() { return popup; },
                setContent(value) { popup.html = value; return popup; },
                once() { return popup; },
                openOn() { popups.push(popup); return popup; }
            };
            return popup;
        }
    },
    buildingMap: {},
    mapAddressAliases: [],
    mapBuildingsData: [],
    mapSelectedBins: new Set(),
    mapSelectMode: false,
    mapOverlapChooserEntries: [],
    console,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Set,
    Map
});

vm.runInContext(`
function countMapJobDevices(devices) { return (devices || []).length; }
function getMapBuildingAddressForBin() { return ''; }
function getMapFavorites() { return {}; }
function getMapInProcess() { return {}; }
function getMapHold() { return {}; }
function getMapCompleted() { return {}; }
function normalizeMapCompletedTestType() { return ''; }
function getMapCompletionColor() { return '#6c757d'; }
function getMapCompletedTestLabel() { return ''; }
function getMonthLabel() { return ''; }
function getMapBulkSchedulePreviewText() { return ''; }
function formatMapCompletedDatesSummary() { return ''; }
function getMapNote() { return ''; }
` + sliceBetween('function escapeMapSuggestionHtml(value)', 'function escapeCsvCell(value)')
  + sliceBetween('function normalizeMapAliasDeviceNumber(value)', 'function unionMapAliasDevices(current, extra)')
  + sliceBetween('function getMapSelectInfoDeviceNumbers(summary, building)', 'function pruneMapBuildingSelection()')
  + sliceBetween('function getMapSelectedBuildingSummaries()', 'function parseMapMultiDeviceEntries(rawText)')
  + sliceBetween('function mapOverlapEntryIsSelected(entry)', 'function handleOverlappingMapMarkerClick(entries, clickedMarker)') + `
this.getMapAddressAliasNamesForBin = getMapAddressAliasNamesForBin;
this.renderMapAkaAddressHtml = renderMapAkaAddressHtml;
this.getMapSelectedBuildingSummaries = getMapSelectedBuildingSummaries;
this.renderMapSelectInfoPanel = renderMapSelectInfoPanel;
this.showMapOverlapChooser = showMapOverlapChooser;
this.setAliases = function(aliases) { mapAddressAliases = aliases; };
this.setBuildings = function(buildings) { mapBuildingsData = buildings; };
this.setBins = function(binGroups) { window.lastBulkSearchResults.binGroups = binGroups; };
this.selectBins = function(bins) { mapSelectedBins = new Set(bins); mapSelectMode = true; };
`, context);

const alias = {
    id: 'alias_1',
    name: 'The Plaza <East>',
    devices: ['1P12345'],
    createdAt: 1
};
context.setAliases([alias, { id: 'alias_2', name: 'the plaza east', devices: ['1P12345'], createdAt: 2 }]);

const fromGroup = context.getMapAddressAliasNamesForBin('1000001');
assert.equal(JSON.stringify(fromGroup), '[]', 'no aka when the building devices are unknown');

context.setBins({
    '1000001': {
        address: '1 W 59TH ST',
        devices: [{ device_number: '1P12345' }]
    },
    '1000002': {
        address: '2 W 59TH ST',
        devices: [{ device_number: '1P99999' }]
    }
});
assert.equal(
    JSON.stringify(context.getMapAddressAliasNamesForBin('1000001')),
    JSON.stringify(['The Plaza <East>']),
    'duplicate aka names collapse to the saved name'
);
assert.equal(JSON.stringify(context.getMapAddressAliasNamesForBin('1000002')), '[]');

context.setBins({
    '1000001': { address: '1 W 59TH ST', devices: [] }
});
context.setBuildings([{
    bin: '1000001',
    address: '1 W 59TH ST',
    deviceCount: 1,
    readyDevices: [{ number: '1p12345' }]
}]);
assert.equal(
    JSON.stringify(context.getMapAddressAliasNamesForBin('1000001', ['1p12345'])),
    JSON.stringify(['The Plaza <East>']),
    'aka still matches device numbers already known for the selected building'
);

const akaHtml = context.renderMapAkaAddressHtml(['The Plaza <East>']);
assert.match(akaHtml, /Also known as/);
assert.match(akaHtml, /The Plaza &lt;East&gt;/);
assert.equal(context.renderMapAkaAddressHtml([]), '');

context.selectBins(['1000001', '1000002']);
const summaries = context.getMapSelectedBuildingSummaries();
assert.equal(JSON.stringify(summaries.find(item => item.bin === '1000001').aliasNames), JSON.stringify(['The Plaza <East>']));
assert.equal(JSON.stringify(summaries.find(item => item.bin === '1000002').aliasNames), '[]');

context.renderMapSelectInfoPanel();
const panelHtml = elements.mapSelectInfoList.innerHTML;
assert.match(panelHtml, /Also known as/);
assert.match(panelHtml, /The Plaza &lt;East&gt;/);
assert.equal((panelHtml.match(/Also known as/g) || []).length, 1);
assert.equal(elements.mapSelectInfoPanel.classList.contains('map-select-info-visible'), true);

context.showMapOverlapChooser([
    { kind: 'building', bin: '1000001', title: '1 W 59TH ST', subtitle: 'BIN 1000001', marker: {} },
    { kind: 'building', bin: '1000002', title: '2 W 59TH ST', subtitle: 'BIN 1000002', marker: {} }
], { lat: 0, lng: 0 });
assert.equal(popups.length, 1);
assert.match(popups[0].html, /map-overlap-chooser-aka/);
assert.match(popups[0].html, /The Plaza &lt;East&gt;/);
assert.match(popups[0].html, /choose one to select/);

console.log('map select aka checks passed');
