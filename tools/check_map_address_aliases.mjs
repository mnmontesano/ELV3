#!/usr/bin/env node
// Run with: node tools/check_map_address_aliases.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

// Settings section
assert.match(html, /toggleMcpSection\('mcpAddressAliases'\)/);
assert.match(html, /id="mcpAddressAliases"/);
assert.match(html, /id="mapAliasNameInput"/);
assert.match(html, /id="mapAliasDevicesInput"/);
assert.match(html, /id="mapAddressAliasesList"/);
assert.match(html, /#mapControlsPanelBody\.mcp-detail-mode #mapAddressAliasesList,/);
assert.match(html, /#mapControlsPanel\.mcp-popped-out #mapAddressAliasesList,/);
assert.match(html, /updateMapControlsPanel\(\) \{\s*ensureMapControlsNotesSection\(\);\s*updateMapAddressAliasesPanel\(\);/);

// Popup, tooltip, search
assert.match(html, /data-map-alias-bin="\$\{building\.bin\}"/);
assert.match(html, /hydrateMapAddressAliasBoxes\(popupRoot\);/);
assert.match(html, /\$\{aliasHtml\}\$\{scheduleHtml\}/);
assert.match(html, /const aliasMatchedBins = hasBulkData \? getMapAddressAliasBinsMatching\(searchTerm\)/);
assert.match(html, /if \(aliasMatchedBins\.has\(String\(building\.bin\)\)\) return true;/);
assert.match(html, /type: 'Alternate Address',/);

// Saved map file round trip
assert.match(html, /addressAliases: getMapAddressAliases\(\),/);
assert.match(html, /addressAliases: Array\.isArray\(view\.addressAliases\) \? view\.addressAliases : \[\],/);
assert.match(html, /addressAliases: normalizeMapAddressAliases\(source\.addressAliases\),/);
assert.match(html, /setMapAddressAliases\(view\.addressAliases \|\| \[\]\);/);
assert.match(html, /source\.addressAliases\.length > MAP_ADDRESS_ALIAS_MAX/);

// Phone: inputs at 16px so iOS doesn't zoom on focus
assert.match(css, /#mcpAddressAliases input\[type="text"\] \{\s*font-size: 16px !important;/);

// Run the pure helpers against a small fixture.
const start = html.indexOf('        const MAP_ADDRESS_ALIAS_MAX = ');
const end = html.indexOf('        function refreshMapAddressAliasViews()');
assert.ok(start > 0 && end > start, 'alias helper block not found');
const context = {
    window: {
        lastBulkSearchResults: {
            binGroups: {
                '1000001': { address: '350 5 AVENUE', devices: [{ device_number: '1P1001' }, { device_number: '1P1002' }] },
                '1000002': { address: '20 W 34 STREET', devices: [{ device_number: '1P2001' }, { device_number: null }, {}] },
                '1000003': { address: 'NO DEVICES', devices: null }
            }
        }
    }
};
vm.createContext(context);
vm.runInContext(`let mapAddressAliases = [];\n${html.slice(start, end)}\nthis.api = {
    parseMapAliasDeviceNumbers, normalizeMapAddressAliases, setMapAddressAliases, getMapAddressAliases,
    resolveMapAddressAliasDevices, getMapAddressAliasesForBin, getMapAddressAliasBinsMatching
};`, context);
const api = context.api;

assert.deepEqual([...api.parseMapAliasDeviceNumbers(' 1p1001, 1P1001;1p1002\n bad!value ')], ['1P1001', '1P1002']);

const normalized = api.normalizeMapAddressAliases([
    { id: 'a1', name: '  Empire   State ', devices: ['1p1001'] },
    { id: 'a1', name: 'Dup id', devices: ['1P2001'] },
    { name: '', devices: ['1P1001'] },
    { name: 'No devices', devices: [] },
    null,
    'junk'
]);
assert.equal(normalized.length, 2);
assert.equal(normalized[0].name, 'Empire State');
assert.deepEqual([...normalized[0].devices], ['1P1001']);
assert.notEqual(normalized[1].id, 'a1', 'duplicate ids are replaced');
assert.deepEqual(api.normalizeMapAddressAliases('nope').length, 0);

api.setMapAddressAliases([
    { id: 'a1', name: 'Empire State Bldg', devices: ['1P1002'] },
    { id: 'a2', name: 'Two Buildings', devices: ['1P1001', '1P2001', '9Z9999'] }
]);
const resolved = api.resolveMapAddressAliasDevices(['1P1001', '1P2001', '9Z9999']);
assert.deepEqual([...resolved.bins], ['1000001', '1000002']);
assert.deepEqual([...resolved.missingDevices], ['9Z9999']);
assert.equal(resolved.buildings[0].address, '350 5 AVENUE');

assert.deepEqual([...api.getMapAddressAliasesForBin('1000001').map(a => a.id)], ['a1', 'a2']);
assert.deepEqual([...api.getMapAddressAliasesForBin('1000002').map(a => a.id)], ['a2']);
assert.deepEqual(api.getMapAddressAliasesForBin('1000003').length, 0);
assert.deepEqual(api.getMapAddressAliasesForBin('9999999').length, 0);

assert.deepEqual([...api.getMapAddressAliasBinsMatching('EMPIRE')], ['1000001']);
assert.deepEqual([...api.getMapAddressAliasBinsMatching('TWO')].sort(), ['1000001', '1000002']);
assert.equal(api.getMapAddressAliasBinsMatching('NOTHING').size, 0);

console.log('check_map_address_aliases: ok');
