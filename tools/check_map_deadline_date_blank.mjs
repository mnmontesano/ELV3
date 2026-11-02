#!/usr/bin/env node
// Run with: node tools/check_map_deadline_date_blank.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function inputTag(id) {
    const marker = `id="${id}"`;
    const start = html.lastIndexOf('<input', html.indexOf(marker));
    const end = html.indexOf('>', start);
    assert.ok(start >= 0 && end > start, `${id} input must exist`);
    return html.slice(start, end + 1);
}

['testDeadlineDateInput', 'mapBulkDeadlineDate'].forEach(id => {
    const tag = inputTag(id);
    assert.match(tag, /type="date"/);
    assert.doesNotMatch(tag, /\svalue=/, `${id} must open with no preselected date`);
});

assert.match(html, /if \(!dateStr\) \{\s*showMapNotification\('Please select a deadline date'/);
assert.match(html, /if \(mode !== 'clear' && !dateStr\) \{\s*showMapNotification\('Please select a deadline date'/);

console.log('testing deadline date blank checks passed');
