#!/usr/bin/env node
// Run with: node tools/check_map_select_completed.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const button = html.match(/<button type="button" id="mapSelectCompletedButton"[\s\S]*?<\/button>/);
assert.ok(button, 'Select mode needs a Completed button');
assert.match(button[0], /onclick="openMapSelectCompletedMenu\(\)"/);
assert.match(button[0], />Completed<\/button>/);
assert.match(button[0], /disabled/);

const toolbar = html.slice(html.indexOf('id="mapSelectToolbar"'), html.indexOf('id="mapControlsPanel"'));
assert.ok(toolbar.includes('id="mapSelectCompletedButton"'), 'Completed button stays on the select toolbar');
assert.ok(
    toolbar.indexOf('id="mapSelectEditButton"') < toolbar.indexOf('id="mapSelectCompletedButton"'),
    'Completed sits with the other selection actions'
);

assert.match(html, /completedBtn\.disabled = selectedCount === 0/);
assert.match(html, /function openMapSelectCompletedMenu\(\)/);
assert.match(html, /function applyMapSelectBulkCompleted\(/);
assert.match(html, /showMapCompletedDetailsPicker\(item\.bin, \{[\s\S]*fromMapSelect: true/);
assert.match(html, /bulkBins: selected\.map\(item => item\.bin\)/);
assert.match(html, /In Select mode, Completed opens that same completion menu/);
assert.match(html, /closeMapSelectCompletedMenu\(\)/);

const pickerStart = html.indexOf('function showMapCompletedDetailsPicker(bin, options) {');
const pickerEnd = html.indexOf('function getMapNotes() {', pickerStart);
assert.ok(pickerStart > 0 && pickerEnd > pickerStart, 'completion menu function must exist');
const picker = html.slice(pickerStart, pickerEnd);
assert.match(picker, /What was completed\?/);
assert.match(picker, /completedTestTypeInput/);
assert.match(picker, /renderMapCompletionDatesEditorHtml\('completedDatesEditor'\)/);
assert.match(picker, /isBulk \? bulkBins : bin/);
assert.match(picker, /DOB status is checked on each building when you save/);
assert.match(picker, /readMapCompletionDatesFromEditor\(datesEditor, bin, testType\)/);

console.log('Select mode Completed opens the building completion menu.');
