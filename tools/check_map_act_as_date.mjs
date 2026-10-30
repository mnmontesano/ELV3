#!/usr/bin/env node
// Run with: node tools/check_map_act_as_date.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function sliceBetween(startMarker, endMarker) {
    const start = html.indexOf(startMarker);
    const end = html.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing ${startMarker}`);
    assert.ok(end > start, `missing ${endMarker}`);
    return html.slice(start, end);
}

assert.match(html, /id="mcpActAsDateSection"/);
assert.match(html, /id="mapActAsDateInput"/);
assert.match(html, /onchange="setMapActAsDate\(this\.value\)"/);
assert.match(html, /onclick="setMapActAsDateToToday\(\)"/);
assert.match(html, /onclick="clearMapActAsDate\(\)"/);
assert.match(html, /id="mapActAsDateStatus"/);
assert.match(html, /id="actAsDateBuildingsList"/);
assert.match(html, /Act As Date pretends today is the date you pick/);

assert.match(html, /if \(!mapBuildingReadyForActAsDate\(building\)\) return false;/);
assert.match(html, /const mapReferenceDate = getMapReferenceDate\(\);/);
assert.match(html, /const today = mapReferenceDate;/);
assert.match(html, /eligibleDate = mapDeviceEligibleDate\(mostRecentTest\)/);
assert.equal((html.match(/eligibleDate = mapDeviceEligibleDate\(mostRecentTest\)/g) || []).length, 2);
assert.match(html, /isBuildingHiddenByMapSettings\(building\) \|\| !mapBuildingReadyForActAsDate\(building\)/);
assert.match(html, /additionalMarker\._actAsReadyCount = readyDevices\.length;/);
assert.match(html, /localStorage\.setItem\('mapActAsDate'/);
assert.match(html, /localStorage\.removeItem\('mapActAsDate'\)/);

const source = `
let mapActAsDate = null;
${sliceBetween(
    '        function parseMapActAsDateInput(value) {',
    '        function refreshMapActAsDateControls() {'
)}
this.parseMapActAsDateInput = parseMapActAsDateInput;
this.mapDeviceEligibleDate = mapDeviceEligibleDate;
this.getMapActAsDate = getMapActAsDate;
this.getMapReferenceDate = getMapReferenceDate;
this.mapBuildingReadyForActAsDate = mapBuildingReadyForActAsDate;
this.additionalMarkerReadyForActAsDate = additionalMarkerReadyForActAsDate;
this.setMapActAsDateForTest = function(date) { mapActAsDate = date; };
`;

const context = vm.createContext({ console });
vm.runInContext(source, context);

assert.equal(context.parseMapActAsDateInput(''), null);
assert.equal(context.parseMapActAsDateInput('2026-02-31'), null);
assert.equal(context.parseMapActAsDateInput('04/02/2026'), null);
const parsed = context.parseMapActAsDateInput('2026-04-02');
assert.equal(parsed.getFullYear(), 2026);
assert.equal(parsed.getMonth(), 3);
assert.equal(parsed.getDate(), 2);
assert.equal(parsed.getHours(), 0);

assert.equal(context.mapDeviceEligibleDate(null), null);
const eligible = context.mapDeviceEligibleDate(new Date(2026, 0, 1, 15, 45));
assert.equal(eligible.getFullYear(), 2026);
assert.equal(eligible.getMonth(), 3);
assert.equal(eligible.getDate(), 2);
assert.equal(eligible.getHours(), 0);

function readyOn(mostRecent, asOf) {
    const eligibleDate = context.mapDeviceEligibleDate(mostRecent);
    if (!eligibleDate) return true;
    const day = new Date(asOf.getTime());
    day.setHours(0, 0, 0, 0);
    return Math.ceil((eligibleDate - day) / (1000 * 60 * 60 * 24)) <= 0;
}

const lastTest = new Date(2026, 0, 1);
assert.equal(readyOn(lastTest, new Date(2026, 3, 1)), false);
assert.equal(readyOn(lastTest, new Date(2026, 3, 2)), true);
assert.equal(readyOn(lastTest, new Date(2026, 3, 10)), true);
assert.equal(readyOn(null, new Date(2026, 3, 1)), true);

assert.equal(context.mapBuildingReadyForActAsDate({ readyDevices: [] }), true);
assert.equal(context.additionalMarkerReadyForActAsDate({ _actAsReadyCount: 0 }), true);

context.setMapActAsDateForTest(new Date(2026, 3, 2));
assert.equal(context.getMapActAsDate().getDate(), 2);
assert.equal(context.mapBuildingReadyForActAsDate({ readyDevices: [] }), false);
assert.equal(context.mapBuildingReadyForActAsDate({ readyDevices: [{ number: '1P1' }] }), true);
assert.equal(context.mapBuildingReadyForActAsDate(null), false);
assert.equal(context.additionalMarkerReadyForActAsDate({ _actAsReadyCount: 0 }), false);
assert.equal(context.additionalMarkerReadyForActAsDate({ _actAsReadyCount: 2 }), true);
const reference = context.getMapReferenceDate();
assert.equal(reference.getFullYear(), 2026);
assert.equal(reference.getMonth(), 3);
assert.equal(reference.getDate(), 2);
assert.equal(reference.getHours(), 0);

context.setMapActAsDateForTest(null);
const today = context.getMapReferenceDate();
const now = new Date();
assert.equal(today.getFullYear(), now.getFullYear());
assert.equal(today.getMonth(), now.getMonth());
assert.equal(today.getDate(), now.getDate());
assert.equal(today.getHours(), 0);

console.log('Act As Date keeps buildings whose 91-day wait has passed on the selected date.');
