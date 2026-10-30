#!/usr/bin/env node
// Run with: node tools/check_map_mobile_layout.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

const PHONE_QUERY = '(max-width: 768px), (pointer: coarse) and (max-height: 500px)';
const LANDSCAPE_QUERY = '(pointer: coarse) and (max-height: 500px)';

function mediaBlock(source, query) {
    const start = source.indexOf(`@media ${query} {`);
    assert.ok(start >= 0, `missing @media ${query}`);
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`unterminated @media ${query}`);
}

const phone = mediaBlock(css, PHONE_QUERY);
const landscape = mediaBlock(css, LANDSCAPE_QUERY);

const jsQuery = html.match(/const MAP_PHONE_LAYOUT_QUERY = '([^']+)';/);
assert.ok(jsQuery, 'MAP_PHONE_LAYOUT_QUERY constant exists');
assert.equal(jsQuery[1], PHONE_QUERY, 'JS phone query matches the CSS media query');

// The Settings close button is phone-only.
assert.match(html, /id="mapControlsMobileCloseBtn"[^>]*onclick="toggleMapControlsPanel\(\)"/);
const outsidePhone = css.replace(phone, '').replace(landscape, '');
assert.match(outsidePhone, /#mapControlsMobileCloseBtn\s*\{\s*display:\s*none;/);
assert.match(phone, /#mapControlsMobileCloseBtn\s*\{[^}]*display:\s*inline-flex/);

// Header actions scroll horizontally instead of wrapping into tall rows.
assert.match(phone, /\.map-modal-file-actions,\s*\.map-modal-dob-group\s*\{\s*flex-wrap:\s*nowrap !important;/);
assert.match(phone, /\.map-modal-file-actions\s*\{[^}]*overflow-x:\s*auto/);
assert.match(phone, /\.map-modal-title-bar button,[\s\S]*?\{\s*margin:\s*0;/);

// 16px inputs stop iOS Safari from zooming on focus.
assert.match(phone, /#mapSearchRow input\[type="text"\]\s*\{[^}]*font-size:\s*16px !important/);

// Windowed-mode controls do not apply on phones.
assert.match(phone, /#mapFullscreenBtn,\s*#mapMinimizeBtn,\s*#mapControlsPopOutBtn,\s*#mapControlsDockBtn,/);

// Settings overlays the map instead of squeezing it, but dashboard mode keeps its own stacked layout.
const sheet = phone.match(/#mapModalContainer:not\(\.map-dashboard-mode\) #mapControlsPanel\s*\{([^}]*)\}/);
assert.ok(sheet, 'Settings bottom sheet rule exists and excludes dashboard mode');
assert.match(sheet[1], /position:\s*absolute !important/);
assert.match(sheet[1], /bottom:\s*0 !important/);
assert.match(sheet[1], /width:\s*auto !important/);
assert.match(landscape, /#mapModalContainer:not\(\.map-dashboard-mode\) #mapControlsPanel\s*\{[^}]*top:\s*0 !important/);

// Select-mode overrides need the extra id to beat the inline <style> blocks that load later.
assert.match(phone, /#mapCanvasWrapper #mapSelectToolbar \.map-select-actions\s*\{[^}]*flex-wrap:\s*nowrap/);
assert.match(phone, /#mapContentRow #mapSelectInfoPanel\s*\{[^}]*position:\s*absolute/);

// Popups fit the phone width and scroll internally.
assert.match(html, /class="map-popup-content" style="min-width: 380px;/);
assert.match(phone, /\.leaflet-popup-content > \.map-popup-content\s*\{[^}]*min-width:\s*0 !important/);
assert.match(phone, /#buildingMapModal \.leaflet-popup-content\s*\{[^}]*max-height:\s*55vh;[^}]*overflow-y:\s*auto/);

// Popups are re-panned after hydration, on phones only.
const panStart = html.indexOf('function keepMapPopupInViewOnPhone(popup) {');
const panEnd = html.indexOf('function openMapMarkerPopup(marker) {', panStart);
assert.ok(panStart > 0 && panEnd > panStart);
const pan = html.slice(panStart, panEnd);
assert.match(pan, /window\.matchMedia\(MAP_PHONE_LAYOUT_QUERY\)\.matches\) return;/);
assert.match(pan, /popup\.isOpen\(\)/);
assert.match(pan, /buildingMap\.panBy\(/);
assert.match(html, /buildingMap\.on\('popupopen', function \(e\) \{\s*hydrateOpenMapPopup\(e\.popup\);\s*keepMapPopupInViewOnPhone\(e\.popup\);/);

console.log('MAP phone layout rules are scoped to phone media queries.');
