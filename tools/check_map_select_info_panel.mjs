#!/usr/bin/env node
// Run with: node tools/check_map_select_info_panel.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const canvas = html.indexOf('id="mapCanvasWrapper"');
const info = html.indexOf('id="mapSelectInfoPanel"');
const controls = html.indexOf('id="mapControlsPanel"');
assert.ok(canvas > 0 && info > canvas && controls > info, 'selected-building panel sits between the map and Settings');
assert.match(html, /Selected buildings are listed on the right/);

const panelCss = html.slice(html.indexOf('#mapSelectInfoPanel {'), html.indexOf('#mapSelectInfoPanel.map-select-info-visible'));
assert.match(panelCss, /display:\s*none/);
assert.match(html, /#mapSelectInfoPanel\.map-select-info-visible\s*\{\s*display:\s*flex/);

const syncStart = html.indexOf('function syncMapSelectModeUi() {');
const syncEnd = html.indexOf('function focusMapSelectedBuilding(bin) {', syncStart);
assert.ok(syncStart > 0 && syncEnd > syncStart);
const sync = html.slice(syncStart, syncEnd);
assert.match(sync, /renderMapSelectInfoPanel\(\)/);

const renderStart = html.indexOf('function renderMapSelectInfoPanel() {');
const renderEnd = html.indexOf('function pruneMapBuildingSelection() {', renderStart);
assert.ok(renderStart > 0 && renderEnd > renderStart);
const render = html.slice(renderStart, renderEnd);
assert.match(render, /mapSelectMode && mapSelectedBins && mapSelectedBins\.size/);
assert.match(render, /map-select-info-visible/);
assert.match(render, /requestMapResizeAfterControlsChange/);
assert.match(render, /getMapSelectedBuildingSummaries\(\)/);
assert.match(render, /focusMapSelectedBuilding\('/);
assert.match(render, /toggleMapBuildingSelection\('/);
assert.match(render, /getMapBulkSchedulePreviewText\(bin\)/);
assert.match(render, /getMapNote\(bin\)/);
assert.match(render, /Not completed/);

const focusStart = html.indexOf('function focusMapSelectedBuilding(bin) {');
const focusEnd = html.indexOf('function getMapSelectInfoDeviceNumbers', focusStart);
assert.ok(focusStart > 0 && focusEnd > focusStart);
const focus = html.slice(focusStart, focusEnd);
assert.match(focus, /setView\(/);
assert.doesNotMatch(focus, /openMapMarkerPopup|flyToMapBuilding\(/);

const toggleStart = html.indexOf('function toggleMapSelectMode(forceState) {');
const toggleEnd = html.indexOf('function syncMapSelectModeUi() {', toggleStart);
assert.match(html.slice(toggleStart, toggleEnd), /if \(nextState\) exitMapDashboard\(\)/);

const restoreStart = html.indexOf('function restoreMapCanvasFromDashboard() {');
const restoreEnd = html.indexOf('function getSavedMapDashboardInfoWidth() {', restoreStart);
assert.match(html.slice(restoreStart, restoreEnd), /mapSelectInfoPanel/);

console.log('Select mode lists selected building information to the left of Settings.');
