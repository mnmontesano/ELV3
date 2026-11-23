import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';

const source = fs.readFileSync(new URL('../dob-backup.js', import.meta.url), 'utf8');
const context = {
    console,
    URL,
    URLSearchParams,
    Map,
    Set,
    Intl,
    __DOB_BACKUP_NO_INSTALL: true
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context);
const backup = context.DobBackup;

const fixture = backup.buildIndex('e5aq-a4j2', [
    {
        device_number: '3P12635',
        bin: '3412449',
        house_number: '1132',
        street_name: 'BLAKE COURT',
        borough: 'BROOKLYN',
        device_type: 'Elevator',
        cat1_latest_report_filed: '2025-10-29T00:00:00.000'
    },
    {
        device_number: '4P10183',
        bin: '4030847',
        house_number: '74-00',
        street_name: 'SKILLMAN AVENUE',
        borough: 'QUEENS'
    },
    {
        device_number: '1P00001',
        bin: '4030847',
        house_number: '7400',
        street_name: 'SKILLMAN AVENUE',
        borough: 'QUEENS'
    }
]);

function query(url) {
    return [...backup.queryRows('e5aq-a4j2', url, fixture)].map(row => row.device_number);
}

assert.deepEqual(query('https://data.cityofnewyork.us/resource/e5aq-a4j2.json?device_number=3P12635'), ['3P12635']);
assert.deepEqual(query('https://data.cityofnewyork.us/resource/e5aq-a4j2.json?bin=4030847&$limit=5000').sort(), ['1P00001', '4P10183']);
assert.deepEqual(
    query(`https://data.cityofnewyork.us/resource/e5aq-a4j2.json?$where=${encodeURIComponent("upper(device_number) in('3P12635','1P00001')")}`).sort(),
    ['1P00001', '3P12635']
);
assert.deepEqual(
    query(`https://data.cityofnewyork.us/resource/e5aq-a4j2.json?$where=${encodeURIComponent("UPPER(device_number)='4P10183'")}`),
    ['4P10183']
);
const addressWhere = "(UPPER(house_number)='74-00' OR UPPER(house_number)='7400') AND UPPER(street_name)='SKILLMAN AVENUE' AND UPPER(borough)='QUEENS'";
assert.deepEqual(query(`https://data.cityofnewyork.us/resource/e5aq-a4j2.json?$where=${encodeURIComponent(addressWhere)}`).sort(), ['1P00001', '4P10183']);
assert.deepEqual(
    query(`https://data.cityofnewyork.us/resource/e5aq-a4j2.json?$where=${encodeURIComponent("UPPER(street_name) like 'BLAKE%'")}`),
    ['3P12635']
);
assert.deepEqual(query('https://data.cityofnewyork.us/resource/e5aq-a4j2.json?house_number=1132&street_name=blake%20court'), ['3P12635']);

const permits = backup.buildIndex('kfp4-dz4h', [
    { job_filing_number: 'A1', bin: '3412449', descriptionofwork: 'Replace car 3P12635' },
    { job_filing_number: 'A2', bin: '3412449', descriptionofwork: 'Lobby work' }
]);
const permitHits = backup.queryRows(
    'kfp4-dz4h',
    `https://data.cityofnewyork.us/resource/kfp4-dz4h.json?$where=${encodeURIComponent("bin='3412449' AND descriptionofwork like '%3P12635%'")}`,
    permits
);
assert.equal(permitHits.length, 1);
assert.equal(permitHits[0].job_filing_number, 'A1');

const down = backup.decideResponse({
    datasetId: 'e5aq-a4j2',
    liveStatus: 503,
    liveRows: null,
    health: 'unavailable',
    backupRows: fixture.rows.filter(row => row.device_number === '3P12635'),
    limit: 1,
    capturedAt: '2026-01-23T10:00:01.000Z'
});
assert.equal(down.kind, 'backup');
assert.equal(down.rows[0].bin, '3412449');
assert.equal(down.rows[0]._dobBackup, '2026-01-23T10:00:01.000Z');

const missing = backup.decideResponse({
    datasetId: 'e5aq-a4j2',
    liveStatus: 503,
    health: 'unavailable',
    backupRows: [],
    limit: 1
});
assert.equal(missing.kind, 'live-error');
assert.equal(missing.status, 503);

const badQuery = backup.decideResponse({
    datasetId: 'e5aq-a4j2',
    liveStatus: 400,
    health: 'incomplete',
    backupRows: fixture.rows,
    limit: 10
});
assert.equal(badQuery.kind, 'live-error');
assert.equal(badQuery.status, 400);

const merged = backup.decideResponse({
    datasetId: 'e5aq-a4j2',
    liveStatus: 200,
    liveRows: [{ device_number: '3P12635', bin: '3412449', cat1_latest_report_filed: '2026-11-01T00:00:00.000' }],
    health: 'incomplete',
    backupRows: fixture.rows,
    limit: 10,
    capturedAt: '2026-01-23T10:00:01.000Z'
});
assert.equal(merged.kind, 'merged');
const liveRow = merged.rows.find(row => row.device_number === '3P12635');
const backupRow = merged.rows.find(row => row.device_number === '4P10183');
assert.equal(liveRow.cat1_latest_report_filed, '2026-11-01T00:00:00.000');
assert.equal(liveRow._dobBackup, undefined);
assert.ok(backupRow._dobBackup);

const healthyMiss = backup.decideResponse({
    datasetId: 'e5aq-a4j2',
    liveStatus: 200,
    liveRows: [],
    health: 'healthy',
    backupRows: fixture.rows,
    limit: 10
});
assert.equal(healthyMiss.kind, 'live');
assert.equal(healthyMiss.rows.length, 0);

assert.equal(backup.formatBackupWhen('2026-01-23T10:00:01.000Z'), 'January 23, 2026');
assert.equal(backup.formatBackupWhen('2026-01-18T02:33:59.000Z'), 'January 17, 2026');

const manifest = JSON.parse(fs.readFileSync(new URL('../dob-backup/manifest.json', import.meta.url), 'utf8'));
context.__dobBackupManifest = manifest;
context.DobBackup.healthCache['e5aq-a4j2'] = { at: Date.now(), value: 'incomplete', count: 3713 };
const notice = backup.noticeFor('e5aq-a4j2');
assert.equal(notice.active, true);
assert.match(notice.text, /incomplete/);
assert.match(notice.text, /3,713/);
assert.match(notice.text, /January 23, 2026/);
assert.match(notice.text, /119,219/);
assert.match(notice.text, /saved test dates/);

const devicesPayload = JSON.parse(gunzipSync(fs.readFileSync(new URL('../dob-backup/devices.json.gz', import.meta.url))));
assert.equal(devicesPayload.rows.length, manifest.datasets['e5aq-a4j2'].rowCount);
assert.ok(devicesPayload.rows.length >= manifest.datasets['e5aq-a4j2'].minHealthyCount);
const devices = backup.buildIndex('e5aq-a4j2', backup.inflatePayload(devicesPayload));
const archived = backup.queryRows('e5aq-a4j2', 'https://data.cityofnewyork.us/resource/e5aq-a4j2.json?device_number=3P12635', devices);
assert.equal(archived.length, 1);
assert.equal(archived[0].bin, '3412449');
assert.equal(archived[0].street_name, 'BLAKE COURT');
const building = backup.queryRows('e5aq-a4j2', 'https://data.cityofnewyork.us/resource/e5aq-a4j2.json?bin=3412449&$limit=5000', devices);
assert.ok(building.some(row => row.device_number === '3P12635'));

const detailsPayload = JSON.parse(gunzipSync(fs.readFileSync(new URL('../dob-backup/device-details.json.gz', import.meta.url))));
assert.equal(detailsPayload.rows.length, manifest.datasets['juyv-2jek'].rowCount);
const sampleDetail = backup.inflatePayload({ fields: detailsPayload.fields, rows: [detailsPayload.rows[0]] })[0];
const details = backup.buildIndex('juyv-2jek', backup.inflatePayload(detailsPayload));
const detailHits = backup.queryRows(
    'juyv-2jek',
    `https://data.cityofnewyork.us/resource/juyv-2jek.json?device_id=${encodeURIComponent(sampleDetail.device_id)}`,
    details
);
assert.ok(detailHits.length >= 1);
assert.ok(detailHits.every(row => row.device_id === sampleDetail.device_id));

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /dob-backup\.js/);
assert.match(html, /id="dobBackupNotice"/);
assert.match(html, /liveOnly: true/);
assert.match(html, /dobBackupCapturedAt/);

console.log(`DOB backup checks passed (${devicesPayload.rows.length} devices, ${detailsPayload.rows.length} detail rows)`);
