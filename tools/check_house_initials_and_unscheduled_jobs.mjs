#!/usr/bin/env node
// Run with: node tools/check_house_initials_and_unscheduled_jobs.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('        const NAME_INITIAL_SKIP_WORDS = new Set([');
const end = html.indexOf('        function findAdditionalLocationIndexByLatLng(', start);
assert.ok(start >= 0, 'NAME_INITIAL_SKIP_WORDS must exist');
assert.ok(end > start, 'house initial helpers must stay above findAdditionalLocationIndexByLatLng');
const source = html.slice(start, end) + `
this.getNameInitials = getNameInitials;
this.getHousePinInitials = getHousePinInitials;
this.selectUnscheduledMapJobs = selectUnscheduledMapJobs;
`;
const context = vm.createContext({});
vm.runInContext(source, context);

assert.equal(context.getNameInitials('John Smith'), 'JS');
assert.equal(context.getNameInitials('Maple'), 'MA');
assert.equal(context.getNameInitials('The Brown House'), 'BH');
assert.equal(context.getNameInitials('123 Main Street'), 'MA');
assert.equal(context.getNameInitials('42-15 21st Avenue'), '21');
assert.equal(context.getNameInitials('East 42nd Street'), 'E4');
assert.equal(context.getNameInitials(''), '');
assert.equal(context.getNameInitials('!!!'), '');

assert.equal(context.getHousePinInitials({ customName: 'John Smith', label: '123 Main Street' }), 'JS');
assert.equal(context.getHousePinInitials({ label: '10 Oak Avenue' }), 'OA');
assert.equal(context.getHousePinInitials({}), 'H');

const jobs = context.selectUnscheduledMapJobs([
    { bin: '1000002', address: '200 Park Place', aka: ['Park House'], hasSchedule: true, fullyCompleted: false },
    { bin: '1000003', address: '300 Oak Avenue', aka: [], hasSchedule: false, fullyCompleted: true },
    { bin: '1000001', address: '100 Main Street', aka: ['The Smith House', 'the smith house', ''], hasSchedule: false, fullyCompleted: false, onHold: true },
    { bin: '', address: 'Missing BIN', hasSchedule: false },
    { bin: '1000004', address: '', aka: ['Corner Shop'], hasSchedule: false, fullyCompleted: false }
]);

assert.equal(JSON.stringify(jobs.map(job => job.bin)), JSON.stringify(['1000001', '1000004']));
assert.equal(jobs[0].address, '100 Main Street');
assert.equal(JSON.stringify(jobs[0].aka), JSON.stringify(['The Smith House']));
assert.equal(jobs[0].onHold, true);
assert.equal(jobs[1].address, 'BIN 1000004');
assert.equal(JSON.stringify(jobs[1].aka), JSON.stringify(['Corner Shop']));

assert.match(html, /id="mapUnscheduledJobsList"/);
assert.match(html, /id="mcpUnscheduledJobs"/);
assert.doesNotMatch(html, /id="settingsUnscheduledJobsList"/);
assert.match(html, /getHousePinInitials\(location\)/);
assert.doesNotMatch(html, /iconText = '🏠'/);

console.log('House initials and unscheduled job selection match the map settings list.');
