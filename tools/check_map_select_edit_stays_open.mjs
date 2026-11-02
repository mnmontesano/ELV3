#!/usr/bin/env node
// Run with: node tools/check_map_select_edit_stays_open.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('function applyBulkTestDate(type, conflictMode)');
const end = html.indexOf('function applyBulkClearDates(type)', start);
assert.ok(start >= 0 && end > start, 'applyBulkTestDate must exist');
const body = html.slice(start, end);

assert.doesNotMatch(body, /overlay\.remove\(\)/, 'saving a PVI or Category date must leave Edit Selected open');
assert.match(body, /Stay in Edit Selected/);
assert.match(body, /if \(conflictOverlay\) conflictOverlay\.remove\(\)/);
assert.match(body, /refreshMapAfterBulkChange\(\)/);

console.log('map select edit stays open checks passed');
