#!/usr/bin/env node
// Run with: node tools/check_dob_tab_width.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('        // DOB tab width helpers');
const end = html.indexOf('        // end DOB tab width helpers', start);
assert.ok(start >= 0 && end > start, 'DOB tab width helpers must be marked in index.html');

const context = vm.createContext({});
vm.runInContext(html.slice(start, end), context);
const normalize = context.normalizeDobTabWidth;

assert.equal(normalize(null), 800, 'No saved preference uses the 800px default');
assert.equal(normalize(''), 800);
assert.equal(normalize('wide'), 800);
assert.equal(normalize('1400'), 1400);
assert.equal(normalize(1234), 1250, 'Widths snap to the 50px slider step');
assert.equal(normalize('500'), 800, 'Never narrower than the original 800px layout');
assert.equal(normalize('99999'), 1800, 'Capped at the slider maximum');

const dobTabStart = html.indexOf('<div id="dobContent"');
const sliderAt = html.indexOf('id="dobTabWidthRange"');
const settingsStart = html.indexOf('<div id="settingsModal"');
const settingsEnd = html.indexOf('<div id="settingsOverlay"', settingsStart);
assert.ok(sliderAt > dobTabStart && html.indexOf('id="dobWidthControl"') > dobTabStart,
    'Width slider lives on the DOB tab');
assert.ok(!(sliderAt > settingsStart && sliderAt < settingsEnd), 'Width slider is not in the Settings modal');

const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
assert.match(css, /body\.dob-tab-wide\s*\{\s*max-width:\s*var\(--dob-tab-max-width,\s*800px\)/,
    'DOB tab width comes from the --dob-tab-max-width setting');

console.log('DOB tab width checks passed.');
