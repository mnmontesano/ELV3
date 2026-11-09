#!/usr/bin/env node
// Run with: node tools/check_map_address_codes.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

assert.match(html, /id="mcpAddressCodes"/);
assert.match(html, /id="mapAddressCodeBinInput"/);
assert.match(html, /id="mapAddressCodeValueInput"/);
assert.match(html, /id="mapAddressCodesList"/);
assert.match(html, /onclick="addMapAddressCodeFromForm\(\)"/);
assert.match(html, /onclick="clearAllMapAddressCodes\(\)"/);
assert.match(html, /renderMapAddressCodeRowHtml\(building\.bin\)/);
assert.match(html, /hydrateMapAddressCodeFields\(popupRoot\);/);
assert.match(html, /renderMapAddressCodeRowHtml\(addressCodeKey\)/);
assert.match(html, /updateMapControlsPanel\(\) \{\s*ensureMapControlsNotesSection\(\);\s*updateMapAddressAliasesPanel\(\);\s*updateMapAddressCodesPanel\(\);/);
assert.match(html, /const codeMatch = mapSearchFieldIncludes\(getMapAddressCode\(building\.bin\), searchTerm\);/);
assert.match(html, /addressCodes: getMapAddressCodes\(\),/);
assert.match(html, /addressCodes: normalizeMapAddressCodes\(view\.addressCodes\),/);
assert.match(html, /addressCodes: normalizeMapAddressCodes\(source\.addressCodes\),/);
assert.match(html, /setMapAddressCodes\(view\.addressCodes \|\| \{\}\);/);
assert.match(html, /addressCodeKeys\.length > MAP_ADDRESS_CODE_STORE_MAX/);
assert.match(html, /planningColumn\('address_code', 'Code Number', 'addressCode'/);
assert.match(css, /#mcpAddressCodes input\[type="text"\],\s*\.map-address-code-input \{\s*font-size: 16px !important;/);

const keyStart = html.indexOf('        function isMapBinStoreKey(key)');
const keyEnd = html.indexOf('        function getAdditionalLocationCompletionKey(location)');
const helperStart = html.indexOf('        const MAP_ADDRESS_CODE_MAX = ');
const helperEnd = html.indexOf('        // MAP_ADDRESS_CODE_HELPERS_END');
const sanitizeStart = html.indexOf('        function sanitizeMapViewForExport(view)');
const sanitizeEnd = html.indexOf('        async function triggerMapViewLoad()');
assert.ok(keyStart > 0 && keyEnd > keyStart, 'BIN key helpers not found');
assert.ok(helperStart > 0 && helperEnd > helperStart, 'address code helpers not found');
assert.ok(sanitizeStart > 0 && sanitizeEnd > sanitizeStart, 'map save sanitizer not found');

const context = { notifications: [] };
context.showMapNotification = (message) => {
    context.notifications.push(message);
};
vm.createContext(context);
vm.runInContext(`
let mapAddressCodes = {};
${html.slice(keyStart, keyEnd)}
${html.slice(helperStart, helperEnd)}
${html.slice(sanitizeStart, sanitizeEnd)}
this.api = {
    cleanMapAddressCode,
    normalizeMapAddressCode,
    normalizeMapAddressCodes,
    setMapAddressCode,
    setMapAddressCodes,
    getMapAddressCode,
    getMapAddressCodes,
    sanitizeMapViewForExport
};
`, context);
const api = context.api;

assert.equal(api.normalizeMapAddressCode('  A-1042  '), 'A-1042');
assert.equal(api.normalizeMapAddressCode(''), '');
assert.equal(api.normalizeMapAddressCode('   '), '');
assert.equal(api.normalizeMapAddressCode('A-1042!'), null);
assert.equal(api.normalizeMapAddressCode('x'.repeat(33)), null);
assert.equal(api.cleanMapAddressCode('  B  12 / #3  '), 'B 12 / #3');
assert.equal(api.cleanMapAddressCode('!!!'), '');

assert.equal(api.setMapAddressCode('1000001', '  A-1042 '), true);
assert.equal(api.getMapAddressCode('1000001'), 'A-1042');
assert.equal(api.setMapAddressCode('1000001', 'bad code!'), false);
assert.equal(api.getMapAddressCode('1000001'), 'A-1042');
assert.equal(context.notifications.length, 1);
assert.equal(api.setMapAddressCode('nope', '12'), false);
assert.equal(api.setMapAddressCode('custom:40.730000,-74.030000', 'H-1'), true);
assert.equal(api.getMapAddressCode('custom:40.730000,-74.030000'), 'H-1');
assert.equal(api.setMapAddressCode('1000001', ''), true);
assert.equal(api.getMapAddressCode('1000001'), '');

const normalized = api.normalizeMapAddressCodes({
    '1000001': '  1042 ',
    '2000002': 'DROP!',
    '12': 'nope',
    'custom:40.100000,-73.900000': 'PIN 7',
    'not-a-key': '999'
});
assert.deepEqual({ ...normalized }, {
    '1000001': '1042',
    '2000002': 'DROP',
    'custom:40.100000,-73.900000': 'PIN 7'
});
assert.deepEqual({ ...api.normalizeMapAddressCodes(['nope']) }, {});
assert.deepEqual({ ...api.normalizeMapAddressCodes(null) }, {});

api.setMapAddressCodes({
    '1000001': 'A-1042',
    'bogus': '9',
    '3000003': ''
});
const saved = api.sanitizeMapViewForExport({
    name: 'Route',
    lastBulkSearchResults: { binGroups: { '1000001': { address: '100 Broadway', devices: [] } }, notFound: [] },
    addressCodes: api.getMapAddressCodes()
});
assert.equal(saved.type, 'map-view');
assert.equal(saved.version, 2);
assert.deepEqual({ ...saved.view.addressCodes }, { '1000001': 'A-1042' });

const dropped = api.sanitizeMapViewForExport({
    addressCodes: { '1000001': 'OK-1', 'bad key': '99', '4000004': '!!!' }
});
assert.deepEqual({ ...dropped.view.addressCodes }, { '1000001': 'OK-1' });

const emptyFile = api.sanitizeMapViewForExport({});
assert.deepEqual({ ...emptyFile.view.addressCodes }, {});

console.log('map address code checks passed');
