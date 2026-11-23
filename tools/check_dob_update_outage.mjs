import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('        function isDobServiceUnavailableError(error)');
const end = html.indexOf('        async function fetchDobDevicesForBin(bin)');
assert.ok(start > 0 && end > start, 'DOB fetch helpers not found');

function load(fetchImpl) {
    const context = {
        console: { warn() {}, error() {}, log() {} },
        URLSearchParams,
        setTimeout: (fn) => { fn(); return 0; },
        fetch: fetchImpl,
        escapeMapSuggestionHtml: value => String(value == null ? '' : value)
    };
    vm.createContext(context);
    vm.runInContext(`${html.slice(start, end)}\nthis.fetchCurrentDobDeviceRecords = fetchCurrentDobDeviceRecords;\nthis.dobServiceUnavailableUserMessage = dobServiceUnavailableUserMessage;\nthis.renderDobLookupErrorHtml = renderDobLookupErrorHtml;`, context);
    return context;
}

const devices = Array.from({ length: 120 }, (_, index) => `1P${1000 + index}`);

let downCalls = 0;
const down = load(async () => {
    downCalls += 1;
    return { ok: false, status: 503, json: async () => ({}) };
});
const outage = await down.fetchCurrentDobDeviceRecords(devices);
assert.equal(Object.keys(outage.freshByDevice).length, 0);
assert.equal(outage.failed.length, 0);
assert.equal(outage.serviceUnavailable, true);
assert.equal(outage.unavailableDevices.length, devices.length);
assert.match(down.dobServiceUnavailableUserMessage(outage.unavailableDevices.length), /NYC Open Data is temporarily unavailable/);
assert.match(down.dobServiceUnavailableUserMessage(outage.unavailableDevices.length), /120 devices were not checked/);
assert.match(down.dobServiceUnavailableUserMessage(outage.unavailableDevices.length), /not a missing-device result/);
const outageHtml = down.renderDobLookupErrorHtml({ status: 503 });
assert.match(outageHtml, /NYC Open Data is temporarily unavailable/);
assert.equal(down.renderDobLookupErrorHtml({ status: 400 }), '<span style="color: #ff6b6b; font-weight: 500;">Error looking up devices. Please try again later.</span>');
// 3 batches, each tried 3 rounds of 3 attempts; no per-device requests.
assert.equal(downCalls, 27);

let badCalls = 0;
const rejected = load(async (url) => {
    badCalls += 1;
    if (url.includes('%24where') || url.includes('$where')) return { ok: false, status: 400, json: async () => ({}) };
    const device = new URL(url).searchParams.get('device_number');
    return { ok: true, status: 200, json: async () => [{ device_number: device }] };
});
const fallback = await rejected.fetchCurrentDobDeviceRecords(devices.slice(0, 5));
assert.equal(Object.keys(fallback.freshByDevice).length, 5);
assert.equal(fallback.failed.length, 0);
assert.equal(badCalls, 6);

let flakyCalls = 0;
const flaky = load(async (url) => {
    flakyCalls += 1;
    if (flakyCalls <= 4) return { ok: false, status: 503, json: async () => ({}) };
    const match = decodeURIComponent(url).match(/in\((.*)\)/);
    const list = match ? match[1].split(',').map(item => item.replace(/'/g, '')) : [];
    return { ok: true, status: 200, json: async () => list.map(device_number => ({ device_number })) };
});
const recovered = await flaky.fetchCurrentDobDeviceRecords(devices.slice(0, 10));
assert.equal(Object.keys(recovered.freshByDevice).length, 10);
assert.equal(recovered.failed.length, 0);
assert.equal(recovered.serviceUnavailable, false);
assert.equal(flakyCalls, 5);

const partial = load(async (url) => {
    const decoded = decodeURIComponent(url);
    const match = decoded.match(/in\((.*)\)/);
    const list = match ? match[1].split(',').map(item => item.replace(/'/g, '')) : [];
    return { ok: true, status: 200, json: async () => [{ device_number: list[0] }] };
});
const missingOne = await partial.fetchCurrentDobDeviceRecords(['1P1', '1P2']);
assert.equal(missingOne.freshByDevice['1P1'] && missingOne.freshByDevice['1P1'].device_number, '1P1');
assert.equal(JSON.stringify(missingOne.failed), JSON.stringify(['1P2']));
assert.equal(missingOne.serviceUnavailable, false);

const downAfterBatch = load(async (url) => {
    if (url.includes('%24where') || url.includes('$where')) return { ok: false, status: 400, json: async () => ({}) };
    return { ok: false, status: 503, json: async () => ({ message: 'Service unavailable' }) };
});
const siteDown = await downAfterBatch.fetchCurrentDobDeviceRecords(['1P1', '1P2', '1P3']);
assert.equal(siteDown.serviceUnavailable, true);
assert.equal(JSON.stringify(siteDown.unavailableDevices), JSON.stringify(['1P1', '1P2', '1P3']));
assert.equal(siteDown.failed.length, 0);

console.log('DOB update outage checks passed');
