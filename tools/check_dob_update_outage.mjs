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
        fetch: fetchImpl
    };
    vm.createContext(context);
    vm.runInContext(`${html.slice(start, end)}\nthis.fetchCurrentDobDeviceRecords = fetchCurrentDobDeviceRecords;`, context);
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
assert.equal(outage.failed.length, devices.length);
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
assert.equal(flakyCalls, 5);

console.log('DOB update outage checks passed');
