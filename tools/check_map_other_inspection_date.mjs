#!/usr/bin/env node
// Run with: node tools/check_map_other_inspection_date.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('        function resolveMapInspectionLane(type) {');
assert.ok(start >= 0, 'resolveMapInspectionLane must exist');
const end = html.indexOf('        function getMapCategoryScheduleRules(bin, scheduledYear) {', start);
assert.ok(end > start, 'other-inspection helpers must precede category schedule rules');

const buildings = {};
const savedCompletions = {};
const context = {
    MAP_ANNUAL_TEST_GAP_DAYS: 91,
    buildings,
    savedCompletions,
    normalizeMapScheduleType(value) {
        const text = String(value || '').trim().toLowerCase();
        if (text === 'pvi' || text === 'periodic') return 'pvi';
        if (text === 'category' || text === 'cat' || text === 'cat1' || text === 'cat 1') return 'category';
        return 'general';
    },
    normalizeMapCompletedTestType(value) {
        const text = String(value || '').trim().toLowerCase();
        if (text === 'pvi') return 'PVI';
        if (text === 'category' || text === 'cat') return 'Category';
        if (text === 'full' || text === 'both') return 'Full';
        if (text === 'legacy') return 'Legacy';
        return '';
    },
    parseMapInspectionDate(value) {
        const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return null;
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    },
    getMapGroupForBin(bin) {
        return buildings[bin] || null;
    },
    mapDobDeviceIsActiveForCompletion(device) {
        return !!(device && device.active !== false);
    },
    getMapDeviceReportTestInfo(device) {
        return device.info || {};
    },
    getMapBuildingCompletionFacts(group) {
        const devices = group && Array.isArray(group.devices) ? group.devices : [];
        return {
            activeDeviceCount: devices.length,
            pviRequiredCount: devices.filter(device => device.requiresPvi).length,
            categoryRequiredCount: devices.filter(device => device.requiresCategory).length
        };
    },
    getMapSavedTestCompletionForYear(bin, type, year) {
        const entry = savedCompletions[bin];
        if (!entry || entry.year !== year) return { isComplete: false };
        const matches = entry.type === type || entry.type === 'Full' || (type === 'Legacy' && entry.type === 'Legacy');
        return { isComplete: !!matches };
    }
};

vm.createContext(context);
vm.runInContext(html.slice(start, end), context);

function device(info, requirements) {
    return {
        active: true,
        requiresPvi: requirements.requiresPvi !== false,
        requiresCategory: requirements.requiresCategory !== false,
        info
    };
}

const none = { hasPVI: false, hasCat1: false, hasCat5: false };
buildings['1000001'] = {
    devices: [device(none, { requiresPvi: true, requiresCategory: true })]
};

const fromCategory = context.getMapOtherInspectionAvailability('1000001', 'category', '2026-03-15');
assert.ok(fromCategory, 'a building with no inspections should get a PVI date');
assert.equal(fromCategory.otherLabel, 'PVI');
assert.equal(fromCategory.nextDate.getFullYear(), 2026);
assert.equal(fromCategory.nextDate.getMonth(), 5);
assert.equal(fromCategory.nextDate.getDate(), 14);
assert.match(fromCategory.message, /No inspections are completed at this building yet/);
assert.match(fromCategory.message, /91 days after this Category date/);
assert.equal(fromCategory.afterYearEnd, false);

const fromPvi = context.getMapOtherInspectionAvailability('1000001', 'PVI', '2026-03-15');
assert.equal(fromPvi.otherLabel, 'Category');
assert.equal(fromPvi.nextDate.getMonth(), 5);
assert.equal(fromPvi.nextDate.getDate(), 14);

const late = context.getMapOtherInspectionAvailability('1000001', 'category', '2026-10-02');
assert.equal(late.nextDate.getFullYear(), 2027);
assert.equal(late.nextDate.getMonth(), 0);
assert.equal(late.nextDate.getDate(), 1);
assert.equal(late.afterYearEnd, true);
assert.match(late.message, /after December 31, 2026/);

buildings['1000002'] = {
    devices: [device({ hasPVI: true, hasCat1: false, hasCat5: false }, { requiresPvi: true, requiresCategory: true })]
};
assert.equal(
    context.getMapOtherInspectionAvailability('1000002', 'category', '2026-03-15'),
    null,
    'a filed inspection should hide the first-test hint'
);

buildings['1000003'] = {
    devices: [device(none, { requiresPvi: false, requiresCategory: true })]
};
assert.equal(
    context.getMapOtherInspectionAvailability('1000003', 'category', '2026-03-15'),
    null,
    'skip the hint when the other test is not required'
);
assert.equal(context.getMapOtherInspectionAvailability('1000003', 'pvi', '2026-03-15').otherLabel, 'Category');

savedCompletions['1000001'] = { type: 'PVI', year: 2026 };
assert.equal(
    context.getMapOtherInspectionAvailability('1000001', 'category', '2026-03-15'),
    null,
    'a saved PVI completion means an inspection is already completed'
);
assert.ok(
    context.getMapOtherInspectionAvailability('1000001', 'pvi', '2026-06-01'),
    'editing the first saved inspection should still show the other date'
);
delete savedCompletions['1000001'];

assert.equal(context.getMapOtherInspectionAvailability('1000001', 'Full', '2026-03-15'), null);
assert.equal(context.getMapOtherInspectionAvailability('1000001', 'category', ''), null);

const bulkText = context.formatMapOtherInspectionAvailabilityText(fromCategory, 2, 3);
assert.match(bulkText, /2 of 3 selected buildings/);
assert.match(bulkText, /complete PVI/);
assert.equal(
    context.formatMapOtherInspectionAvailabilityText(fromCategory, 1, 1),
    fromCategory.message
);

assert.match(html, /id="categoryOtherInspectionHint"/);
assert.match(html, /id="pviOtherInspectionHint"/);
assert.match(html, /id="completedOtherInspectionHint"/);
assert.match(html, /id="mapBulkCategoryOtherInspectionHint"/);
assert.match(html, /id="mapBulkPviOtherInspectionHint"/);
assert.match(html, /91 days later/);

console.log('Other-inspection date hints use a 91-day gap when no inspections are completed yet.');
