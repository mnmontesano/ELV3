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
assert.match(html, /id="mapAliasBulkInput"/);
assert.match(html, /id="mapAliasBulkAddBtn"/);
assert.match(html, /oninput="previewMapAddressAliasBulkForm\(\)"/);
assert.match(html, /onclick="addMapAddressAliasesFromBulk\(\)"/);
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
assert.match(css, /#mcpAddressAliases textarea \{\s*font-size: 16px !important;/);
const phoneStart = css.indexOf('@media (max-width: 768px), (pointer: coarse) and (max-height: 500px) {');
const zoomRule = css.indexOf('#buildingMap:has(.leaflet-popup) .leaflet-control-zoom');
assert.ok(phoneStart >= 0 && zoomRule > phoneStart, 'zoom buttons are only hidden behind popups in the phone layout');

// The alternate name is shown in addition to the DOB address, never instead of it.
assert.match(html, /\$\{building\.address\}<\/div>\s*<div class="map-popup-aliases" data-map-alias-bin=/);
assert.match(html, />Also known as<\/div>/);
assert.match(html, /const addressMatch = mapSearchFieldIncludes\(building\.address, searchTerm\);/);

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
    resolveMapAddressAliasDevices, getMapAddressAliasesForBin, getMapAddressAliasBinsMatching,
    parseMapAddressAliasBulkText, planMapAddressAliasBulk
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

const bulk = api.parseMapAddressAliasBulkText([
    'Address\tDevice numbers',
    '  Empire   State \t1p1001, 1P1001;1p1002',
    '20 W 34 Street\t1P2001',
    '20 W 34 Street\t1P2001',
    'just a name',
    '',
    '350 5 Avenue, Lobby | 1P1001, 9Z9999',
    '"Say ""Hi"" Building","1P1002"',
    '123 Main St, Brooklyn, 1P1001, 1P2001',
    '1P1001, 1P2001'
].join('\n'));
assert.equal(bulk.headerSkipped, true);
assert.equal(bulk.rows.length, 6);
assert.equal(bulk.rows[0].name, 'Empire State');
assert.deepEqual([...bulk.rows[0].devices], ['1P1001', '1P1002']);
assert.equal(bulk.rows[1].name, '20 W 34 Street');
assert.equal(bulk.rows[3].name, '350 5 Avenue, Lobby');
assert.deepEqual([...bulk.rows[3].devices], ['1P1001', '9Z9999']);
assert.equal(bulk.rows[4].name, 'Say "Hi" Building');
assert.deepEqual([...bulk.rows[4].devices], ['1P1002']);
assert.equal(bulk.rows[5].name, '123 Main St, Brooklyn');
assert.deepEqual([...bulk.rows[5].devices], ['1P1001', '1P2001']);
assert.equal(bulk.skipped.length, 2);
assert.match(bulk.skipped[0].reason, /tab or a \|/);
assert.equal(bulk.skipped[1].reason, 'Enter the address');

const planned = api.planMapAddressAliasBulk([
    'Address\tDevices',
    'Empire State Bldg\t1P1002',
    'New Name\t1P1001',
    'New Name\t1P1001',
    'Too Many\t' + Array.from({ length: 51 }, (_, i) => `1P${1000 + i}`).join(', ')
].join('\n'), [
    { name: 'Empire State Bldg', devices: ['1P1002'] }
]);
assert.equal(planned.headerSkipped, true);
assert.equal(planned.alreadySaved.length, 1);
assert.equal(planned.repeated.length, 1);
assert.equal(planned.ready.length, 2);
assert.equal(planned.ready[0].name, 'New Name');
assert.equal(planned.ready[1].truncatedDevices, true);
assert.equal(planned.ready[1].devices.length, 50);
assert.deepEqual([...api.resolveMapAddressAliasDevices(planned.ready[0].devices).bins], ['1000001']);

const filled = Array.from({ length: 5000 }, (_, i) => ({ name: `Saved ${i}`, devices: [`9Z${i}`] }));
const capped = api.planMapAddressAliasBulk('One More\t1P1001', filled);
assert.equal(capped.ready.length, 0);
assert.equal(capped.overLimit.length, 1);

const addressRow = api.parseMapAddressAliasBulkText('Address\t1P1001');
assert.equal(addressRow.headerSkipped, false);
assert.equal(addressRow.rows[0].name, 'Address');
assert.deepEqual([...addressRow.rows[0].devices], ['1P1001']);

console.log('check_map_address_aliases: ok');
