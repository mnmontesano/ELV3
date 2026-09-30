#!/usr/bin/env node
// Run with: node tools/check_bulk_unsearched_bin_devices.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('        // BULK unsearched BIN device helpers');
const end = html.indexOf('        // end BULK unsearched BIN device helpers', start);
assert.ok(start >= 0 && end > start, 'Unsearched BIN device helpers must be marked in index.html');

const source = html.slice(start, end) + `
this.collectUnsearchedBinDevices = collectUnsearchedBinDevices;
this.takeUnsearchedBinDevice = takeUnsearchedBinDevice;
this.appendDeviceNumberToLookupText = appendDeviceNumberToLookupText;
this.groupUnsearchedDevicesForCards = groupUnsearchedDevicesForCards;
`;
const context = vm.createContext({});
vm.runInContext(source, context);

const numbers = list => Array.from(list || [], d => d.device_number);

const binGroups = {
    '1000001': { devices: [{ device_number: '1P11111' }] },
    '1000002': { devices: [{ device_number: '1P22222' }, { device_number: '1P22223' }] }
};
const binRows = {
    '1000001': [
        { device_number: '1P11111' },
        { device_number: '1p11112' },
        { device_number: '1P11113' },
        { device_number: '1P11113' },
        { device_number: '' }
    ],
    '1000002': [{ device_number: '1P22222' }, { device_number: '1P22223' }],
    '9999999': [{ device_number: '1P99999' }]
};
const unsearched = context.collectUnsearchedBinDevices(binGroups, binRows);

assert.deepEqual(numbers(unsearched['1000001']), ['1p11112', '1P11113'],
    'Only devices not already searched are listed, case-insensitively and without duplicates');
assert.equal(unsearched['1000002'], undefined, 'Buildings where every device was searched have no extras');
assert.equal(unsearched['9999999'], undefined, 'BINs that were not part of the search are ignored');
assert.equal(binGroups['1000001'].devices.length, 1, 'Collecting extras must not change counted devices');

const taken = context.takeUnsearchedBinDevice(unsearched, '1000001', '1P11112');
assert.equal(taken.device_number, '1p11112');
assert.deepEqual(numbers(unsearched['1000001']), ['1P11113']);
assert.equal(context.takeUnsearchedBinDevice(unsearched, '1000001', '1P11112'), null, 'A device can only be added once');
context.takeUnsearchedBinDevice(unsearched, '1000001', '1P11113');
assert.equal(unsearched['1000001'], undefined, 'Empty building lists are removed');
assert.equal(context.takeUnsearchedBinDevice(unsearched, '1000003', '1P00000'), null);

assert.equal(context.appendDeviceNumberToLookupText('1P11111\n\n 1000002 \n', '1P11112'), '1P11111\n1000002\n1P11112');
assert.equal(context.appendDeviceNumberToLookupText('1P11111\n1p11112', '1P11112'), '1P11111\n1p11112',
    'Device numbers already in the search box are not duplicated');
assert.equal(context.appendDeviceNumberToLookupText('', '1P11112'), '1P11112');

const groups = context.groupUnsearchedDevicesForCards([
    { device_number: 'D1', device_type: 'Dumbwaiter', device_status: 'Active' },
    { device_number: 'E1', device_type: 'Elevator', device_status: 'Active' },
    { device_number: 'E2', device_type: 'Elevator', device_status: 'Removed' },
    { device_number: 'E3', device_type: 'Elevator', device_status: 'Dismantled' },
    { device_number: 'U1', device_status: 'Deleted' }
]);
assert.deepEqual(Array.from(groups, g => `${g.removed ? 'removed ' : ''}${g.type}:${numbers(g.devices).join(',')}`), [
    'Elevator:E1,E3',
    'Dumbwaiter:D1',
    'removed Elevator:E2',
    'removed Unknown:U1'
], 'Cards group like the BIN search: elevators first, removed/deleted last, dismantled stays active');

console.log('Bulk unsearched BIN device checks passed.');
