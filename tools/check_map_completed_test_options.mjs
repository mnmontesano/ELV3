#!/usr/bin/env node
// Run with: node tools/check_map_completed_test_options.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('        const MAP_COMPLETED_TEST_OPTIONS = [');
assert.ok(start >= 0, 'MAP_COMPLETED_TEST_OPTIONS must exist');
const endMarker = '        function renderMapCompletionStatusOptions(isCompleted) {';
const end = html.indexOf(endMarker, start);
assert.ok(end > start, 'renderMapCompletedTestOptions must exist');
const source = html.slice(start, end) + `
this.MAP_COMPLETED_TEST_OPTIONS = MAP_COMPLETED_TEST_OPTIONS;
this.normalizeMapCompletedTestType = normalizeMapCompletedTestType;
this.getMapCompletedTestLabel = getMapCompletedTestLabel;
this.mergeMapCompletionTypes = mergeMapCompletionTypes;
this.renderMapCompletedTestOptions = renderMapCompletedTestOptions;
`;
const context = vm.createContext({});
vm.runInContext(source, context);

const options = context.MAP_COMPLETED_TEST_OPTIONS;
assert.equal(options.map(option => option.value).join(','), 'Full,Category,PVI');
assert.equal(options[0].label, 'PVI and Category completed');

assert.equal(context.normalizeMapCompletedTestType('Full'), 'Full');
assert.equal(context.normalizeMapCompletedTestType('PVI and Category completed'), 'Full');
assert.equal(context.normalizeMapCompletedTestType('both'), 'Full');
assert.equal(context.normalizeMapCompletedTestType('Category completed only'), 'Category');
assert.equal(context.normalizeMapCompletedTestType('PVI completed only'), 'PVI');

assert.equal(context.getMapCompletedTestLabel('Full'), 'PVI and Category completed');
assert.equal(context.mergeMapCompletionTypes('Category', 'PVI'), 'Full');

const emptyHtml = context.renderMapCompletedTestOptions('');
assert.match(emptyHtml, /Select Category, PVI, or both/);
assert.match(emptyHtml, /value="Full"/);
assert.match(emptyHtml, /value="Category"/);
assert.match(emptyHtml, /value="PVI"/);
assert.doesNotMatch(emptyHtml, /value="Full" selected/);

const fullHtml = context.renderMapCompletedTestOptions('Full');
assert.match(fullHtml, /value="Full" selected/);
assert.doesNotMatch(fullHtml, /PVI \+ Category already recorded/);

console.log('MAP completed-test options include Category, PVI, and both.');
