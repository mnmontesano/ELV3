#!/usr/bin/env node
// Run with: node tools/check_map_select_overlap.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const chooserStart = html.indexOf('function showMapOverlapChooser(entries, latlng) {');
const chooserEnd = html.indexOf('function handleOverlappingMapMarkerClick(entries, clickedMarker) {', chooserStart);
assert.ok(chooserStart > 0 && chooserEnd > chooserStart, 'overlap chooser must exist');
const chooser = html.slice(chooserStart, chooserEnd);
assert.match(chooser, /choose one to select/);
assert.match(chooser, /map-overlap-chooser-btn-selected/);
assert.match(chooser, /mapOverlapEntryIsSelected\(entry\)/);

const chooseStart = html.indexOf('function chooseOverlappingMapMarker(index) {');
const chooseEnd = html.indexOf('function showMapOverlapChooser(entries, latlng) {', chooseStart);
assert.ok(chooseStart > 0 && chooseEnd > chooseStart);
const choose = html.slice(chooseStart, chooseEnd);
assert.match(choose, /if \(mapSelectMode\)/);
assert.match(choose, /toggleMapBuildingSelection\(entry\.bin\)/);
assert.match(choose, /openMapMarkerPopup\(entry\.marker\)/);

const selectStart = html.indexOf('function attachMapMarkerSelectHandler(marker, bin) {');
const selectEnd = html.indexOf('function closeMapSelectCompletedMenu() {', selectStart);
assert.ok(selectStart > 0 && selectEnd > selectStart);
const selectHandler = html.slice(selectStart, selectEnd);
assert.match(selectHandler, /getOverlappingVisibleMapMarkers\(marker\)/);
assert.match(selectHandler, /if \(overlapping\.length > 1\) return/);
assert.match(selectHandler, /toggleMapBuildingSelection\(binKey\)/);

const popupStart = html.indexOf('function attachMapMarkerPopupClickHandler(marker) {');
const popupEnd = html.indexOf('function toggleMapNoteEditor(bin) {', popupStart);
assert.ok(popupStart > 0 && popupEnd > popupStart);
const popupHandler = html.slice(popupStart, popupEnd);
assert.match(popupHandler, /if \(mapSelectMode\)/);
assert.match(popupHandler, /handleOverlappingMapMarkerClick\(overlapping, marker\)/);

assert.match(html, /Stacked buildings in Select mode use the same location chooser/);

console.log('Select mode uses the overlap chooser for stacked buildings.');
