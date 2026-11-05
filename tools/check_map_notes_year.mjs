#!/usr/bin/env node
// Run with: node tools/check_map_notes_year.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /id="mapNoteYear_\$\{building\.bin\}"/);
assert.match(html, /id="notesYearSelect"/);
assert.match(html, /notes: normalizeImportedMapNotes\(getMapNotes\(\)\)/);
assert.match(html, /notes: normalizeImportedMapNotes\(source\.notes\)/);
assert.match(html, /setMapNote\(bin, getMapNoteYear\(\), values\.note\)/);

const start = html.indexOf('        function normalizeMapBuildingNotes(value, fallbackYear) {');
const end = html.indexOf('        const MAP_ADDRESS_ALIAS_MAX', start);
assert.ok(start >= 0 && end > start);

const context = {
    mapNotes: {},
    displayedYear: 2026,
    document: { getElementById: () => null },
    getMapInspectionCalendarYear: () => 2026,
    getMapDisplayedCalendarYear() { return context.displayedYear; }
};
vm.createContext(context);
vm.runInContext(html.slice(start, end), context);
const plain = value => JSON.parse(JSON.stringify(value));

assert.deepEqual(plain(context.normalizeMapBuildingNotes('Call the super', 2026)), { '2026': 'Call the super' },
    'a note saved before years existed belongs to the year the file is opened');
assert.deepEqual(plain(context.normalizeImportedMapNotes({
    '1000001': 'Door code 1234',
    '1000002': { '2025': 'Old scaffold note', '2026': 'Super is Mike', nope: 'skip' }
})), {
    '1000001': { '2026': 'Door code 1234' },
    '1000002': { '2025': 'Old scaffold note', '2026': 'Super is Mike' }
});

context.setMapNote('1000001', 2026, 'This year');
context.setMapNote('1000001', 2025, 'Last year');
context.setMapNote('1000001', 2027, 'Next year');
assert.equal(context.getMapNote('1000001', 2026), 'This year');
assert.equal(context.getMapNote('1000001', 2025), 'Last year');
assert.equal(context.getMapNote('1000001'), 'This year', 'the map shows the note for the year on screen');

context.displayedYear = 2027;
assert.equal(context.getMapNote('1000001'), 'Next year', 'the 2027 map shows the 2027 note');
context.setMapNote('1000001', 2027, '');
assert.equal(context.getMapNote('1000001', 2027), '');
assert.equal(context.getMapNote('1000001', 2026), 'This year', 'clearing 2027 leaves the other years');
assert.equal(context.getMapNote('1000001', 2025), 'Last year');

const choices = context.getMapNoteYearChoices('1000001').map(year => year);
assert.deepEqual([...choices], [2027, 2026, 2025]);

console.log('Building notes are stored per year, and earlier years stay readable.');
