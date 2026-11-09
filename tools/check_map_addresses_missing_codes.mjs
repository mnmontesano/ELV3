#!/usr/bin/env node
// Run with: node tools/check_map_addresses_missing_codes.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(html, /id="mapAddressCodesMissingShowOnMapBtn"/);
assert.match(html, /toggleMapAddressesMissingCodesShowOnMap/);
assert.match(html, /Show addresses with no codes filters the map/);
assert.match(html, /<option value="no-address-code">No address code<\/option>/);

const start = html.indexOf('        function mapAddressCodesFromView(view) {');
const end = html.indexOf('        function mapBuildingMatchesActiveMonthScope(building, labels) {', start);
assert.ok(start >= 0, 'mapAddressCodesFromView must exist');
assert.ok(end > start, 'map view filter must follow the missing-code helper');

const source = html.slice(start, end) + `
function isMapBinStoreKey(key) {
    return /^\\d{6,7}$/.test(String(key || ''));
}
function getAdditionalLocationCompletionKey(location) {
    if (!location) return '';
    if (location.bin && isMapBinStoreKey(location.bin)) return String(location.bin);
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    return 'custom:' + lat.toFixed(6) + ',' + lng.toFixed(6);
}
this.collectMapMissingAddressCodeKeys = collectMapMissingAddressCodeKeys;
this.getMapViewFilterBins = getMapViewFilterBins;
this.getMapViewFilterLabel = typeof getMapViewFilterLabel === 'function' ? getMapViewFilterLabel : null;
`;

const context = vm.createContext({
    activeMonthFilters: { size: 0, has() { return false; } }
});
vm.runInContext(source, context);

const view = {
    addressCodes: {
        '1000001': 'A-10',
        'custom:40.700000,-73.900000': 'B-2'
    },
    lastBulkSearchResults: {
        binGroups: {
            '1000001': { address: '1 Coded St' },
            '1000002': { address: '2 Open Ave' },
            '1000003': { address: '3 Plain Rd' }
        }
    },
    additionalLocations: [
        { bin: '1000001', latitude: 40.71, longitude: -73.99, label: 'Same as coded building' },
        { bin: '1000002', latitude: 40.72, longitude: -73.98, label: 'Same as open building' },
        { latitude: 40.7, longitude: -73.9, label: 'Coded custom pin' },
        { latitude: 40.8, longitude: -73.8, label: 'Open custom pin' },
        { label: 'Pin with no key' }
    ]
};

const keys = context.collectMapMissingAddressCodeKeys(view);
assert.equal(keys.has('1000001'), false);
assert.equal(keys.has('1000002'), true);
assert.equal(keys.has('1000003'), true);
assert.equal(keys.has('custom:40.700000,-73.900000'), false);
assert.equal(keys.has('custom:40.800000,-73.800000'), true);

const filterKeys = context.getMapViewFilterBins(view, 'no-address-code');
assert.deepEqual([...filterKeys].sort(), [...keys].sort());
assert.equal(context.getMapViewFilterBins(view, 'all'), null);

const unlabeled = context.collectMapMissingAddressCodeKeys({
    lastBulkSearchResults: { binGroups: { '2000001': { address: '9 Bare St' } } },
    additionalLocations: []
});
assert.equal(unlabeled.has('2000001'), true);

assert.match(html, /'no-address-code': 'No address code'/);
assert.match(html, /filterValue === 'no-address-code'/);
assert.match(html, /refreshMapIfShowingAddressesMissingCodes/);

console.log('map addresses missing codes: ok');
