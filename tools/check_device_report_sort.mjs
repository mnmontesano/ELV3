#!/usr/bin/env node
// Run with: node tools/check_device_report_sort.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const rankStart = html.indexOf('function getMapDeviceReportSortRank(device, year, binHint, asOfDate) {');
const rankEnd = html.indexOf('function formatMapAnnualTestStatusHtml(testInfo, kind) {', rankStart);
assert.ok(rankStart > 0 && rankEnd > rankStart);
const rank = html.slice(rankStart, rankEnd);
assert.match(rank, /getMapDeviceReportPendingTests\(testInfo\)\.length > 0\) return 0/);
const pendingReturn = rank.indexOf('return 0');
const violationReturn = rank.indexOf('violationCount > 0) return 1');
assert.ok(pendingReturn > 0 && violationReturn > pendingReturn, 'a missing year test sorts ahead of violations');
assert.match(html, /return getMapDeviceReportSortRank\(device, currentYear, reportBin, today\)/);
assert.doesNotMatch(html, /Devices with no tests filed in the current calendar year come first/);

const jobSortStart = html.indexOf('const sortedDevices = [...group.devices].sort((a, b) => {');
const jobSortEnd = html.indexOf('// Excel-style table header', jobSortStart);
assert.ok(jobSortStart > 0 && jobSortEnd > jobSortStart);
const jobSort = html.slice(jobSortStart, jobSortEnd);
const missingAt = jobSort.indexOf('mapDobDeviceHasRequiredCurrentYearCompletion');
const violationsAt = jobSort.indexOf('a.violations ? a.violations.length');
assert.ok(missingAt > 0 && violationsAt > missingAt, 'job devices missing a year test sort ahead of the violation count');

const popupStart = html.indexOf('const sortedDevices = buildingData.devices ? [...buildingData.devices].sort((a, b) => {');
const popupEnd = html.indexOf('// Generate the device table rows with violation details', popupStart);
assert.ok(popupStart > 0 && popupEnd > popupStart);
const popupSort = html.slice(popupStart, popupEnd);
const popupMissing = popupSort.indexOf("completionStatus !== 'Complete'");
const popupViolations = popupSort.indexOf('b.violationCount');
assert.ok(popupMissing > 0 && popupViolations > popupMissing, 'the full-screen job view also lists missing year tests first');

console.log('Devices missing a required test for the year are listed before violations.');
