#!/usr/bin/env node
// Rebuild the shipped DOB backup from NYC Open Data when the city file is complete.
// A partial republish (the live elevator file dropping from ~120,000 devices to a few thousand)
// is refused, so a bad publish cannot replace the backup.
//
//   node tools/refresh_dob_backup.mjs
//   node tools/refresh_dob_backup.mjs --from-csv e5aq-a4j2 /path/devices.csv 2026-01-23T10:00:01.000Z
//   node tools/refresh_dob_backup.mjs --from-csv juyv-2jek /path/details.csv 2026-01-18T02:33:59.000Z

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'dob-backup', 'manifest.json');
const API = 'https://data.cityofnewyork.us/resource';

const DATASETS = {
    'e5aq-a4j2': {
        file: 'dob-backup/devices.json.gz',
        label: 'elevator devices',
        minHealthyCount: 100000,
        order: 'device_number',
        capturedAt: null,
        source: 'NYC Open Data DOB NOW Elevator Safety Compliance (e5aq-a4j2).',
        csvColumns: {
            'Device Number': 'device_number',
            'Device Type': 'device_type',
            'Device Status': 'device_status',
            'Status Date': 'status_date',
            'Equipment Type': 'equipment_type',
            'Periodic Report Year': 'periodic_report_year',
            'CAT1 Report Year': 'cat1_report_year',
            'CAT1 Latest Report Filed Date': 'cat1_latest_report_filed',
            'CAT5 Latest Report Filed Date': 'cat5_latest_report_filed',
            'Periodic Latest Inspection Date': 'periodic_latest_inspection',
            BIN: 'bin',
            Borough: 'borough',
            'House Number': 'house_number',
            'Street Name': 'street_name',
            Block: 'block',
            Lot: 'lot',
            Postcode: 'zip_code',
            Latitude: 'latitude',
            Longitude: 'longitude'
        },
        dateFields: ['status_date', 'cat1_latest_report_filed', 'cat5_latest_report_filed', 'periodic_latest_inspection'],
        fields: [
            'device_number', 'device_type', 'device_status', 'status_date', 'equipment_type',
            'periodic_report_year', 'cat1_report_year', 'cat1_latest_report_filed', 'cat5_latest_report_filed',
            'periodic_latest_inspection', 'bin', 'borough', 'house_number', 'street_name',
            'block', 'lot', 'zip_code', 'latitude', 'longitude'
        ]
    },
    'juyv-2jek': {
        file: 'dob-backup/device-details.json.gz',
        label: 'device details',
        minHealthyCount: 50000,
        order: 'device_id',
        capturedAt: null,
        source: 'NYC Open Data DOB NOW Elevator Device Details (juyv-2jek).',
        csvColumns: {
            JOB_FILING_NUMBER: 'job_filing_number',
            DEVICE_ID: 'device_id',
            DEVICE_TYPE: 'device_type',
            DEVICE_STATUS: 'device_status',
            MACHINE_TYPE: 'machine_type',
            ELEVATOR_MANUFACTURER: 'elevator_manufacturer',
            CARGOVERNOR_TYPE: 'cargovernor_type',
            CWTGOVERNOR_TYPE: 'cwtgovernor_type',
            CAR_BUFFER_TYPE: 'car_buffer_type',
            MODE_OF_OPERATION: 'mode_of_operation',
            CAR_SAFETY_TYPE: 'car_safety_type',
            FIRE_EMERGENCY_PHASE: 'fire_emergency_phase',
            CONTROLLER_MANUFACTURER: 'controller_manufacturer',
            ELEVATOR_CONTROL: 'elevator_control',
            'ELEVATOR_CAPACITY(LBS)': 'elevator_capacity_lbs',
            'ELEVATOR_SPEED(FPM)': 'elevator_speed_fpm'
        },
        dateFields: [],
        fields: [
            'job_filing_number', 'device_id', 'device_type', 'device_status', 'machine_type',
            'elevator_manufacturer', 'cargovernor_type', 'cwtgovernor_type', 'car_buffer_type',
            'mode_of_operation', 'car_safety_type', 'fire_emergency_phase', 'controller_manufacturer',
            'elevator_control', 'elevator_capacity_lbs', 'elevator_speed_fpm'
        ]
    }
};

function readManifest() {
    try {
        return JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
        return { datasets: {} };
    }
}

function writeGzip(datasetId, rowObjects, capturedAt, sourceNote) {
    const spec = DATASETS[datasetId];
    const rows = rowObjects.map(row => spec.fields.map(field => {
        const value = row[field];
        return value == null ? '' : String(value);
    }));
    const payload = JSON.stringify({
        dataset: datasetId,
        capturedAt,
        fields: spec.fields,
        rows
    });
    const target = join(root, spec.file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, gzipSync(payload));
    const manifest = readManifest();
    manifest.updatedAt = new Date().toISOString();
    manifest.datasets = manifest.datasets || {};
    manifest.datasets[datasetId] = {
        file: spec.file,
        label: spec.label,
        capturedAt,
        rowCount: rows.length,
        minHealthyCount: spec.minHealthyCount,
        source: sourceNote || spec.source
    };
    for (const id of ['855j-jady', 'kfp4-dz4h']) {
        manifest.datasets[id] = manifest.datasets[id] || {
            label: id === '855j-jady' ? 'violations' : 'elevator permits',
            minHealthyCount: id === '855j-jady' ? 900000 : 1000,
            source: 'Saved in this browser after a successful lookup. Not shipped with the page because the full city file is too large.'
        };
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${datasetId}: wrote ${rows.length} rows to ${spec.file}`);
}

function toIsoDate(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text;
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) return text;
    const month = match[1].padStart(2, '0');
    const day = match[2].padStart(2, '0');
    return `${match[3]}-${month}-${day}T00:00:00.000`;
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                cell += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(cell);
            cell = '';
        } else if (char === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else if (char !== '\r') {
            cell += char;
        }
    }
    if (cell.length || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

function rowsFromCsv(datasetId, csvPath) {
    const spec = DATASETS[datasetId];
    const table = parseCsv(readFileSync(csvPath, 'utf8'));
    const header = table.shift() || [];
    const indexes = spec.fields.map(field => {
        const csvName = Object.keys(spec.csvColumns).find(name => spec.csvColumns[name] === field);
        return header.indexOf(csvName);
    });
    if (indexes.some(index => index < 0)) {
        throw new Error(`${datasetId} CSV is missing expected columns`);
    }
    return table.filter(cells => cells.some(cell => String(cell || '').trim())).map(cells => {
        const row = {};
        spec.fields.forEach((field, index) => {
            let value = cells[indexes[index]] == null ? '' : String(cells[indexes[index]]).trim();
            if (spec.dateFields.includes(field)) value = toIsoDate(value);
            if (value) row[field] = value;
        });
        return row;
    });
}

async function liveCount(datasetId) {
    const response = await fetch(`${API}/${datasetId}.json?$select=count(*)`);
    if (!response.ok) throw new Error(`${datasetId} count returned HTTP ${response.status}`);
    const data = await response.json();
    const raw = data && data[0] && (data[0].count || data[0].count_1 || Object.values(data[0])[0]);
    return Number(raw) || 0;
}

async function pullLive(datasetId) {
    const spec = DATASETS[datasetId];
    const rows = [];
    const pageSize = 50000;
    for (let offset = 0; ; offset += pageSize) {
        const params = new URLSearchParams();
        params.set('$select', spec.fields.join(','));
        params.set('$order', spec.order);
        params.set('$limit', String(pageSize));
        params.set('$offset', String(offset));
        const response = await fetch(`${API}/${datasetId}.json?${params}`);
        if (!response.ok) throw new Error(`${datasetId} page ${offset} returned HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) break;
        rows.push(...data);
        console.log(`${datasetId}: ${rows.length} rows`);
        if (data.length < pageSize) break;
    }
    return rows;
}

async function refreshLive() {
    for (const datasetId of Object.keys(DATASETS)) {
        const spec = DATASETS[datasetId];
        const count = await liveCount(datasetId);
        if (count < spec.minHealthyCount) {
            console.log(`${datasetId}: left the backup in place. Live row count is ${count}, below ${spec.minHealthyCount}.`);
            continue;
        }
        const rows = await pullLive(datasetId);
        if (rows.length < spec.minHealthyCount) {
            console.log(`${datasetId}: download had ${rows.length} rows, so the backup was not replaced.`);
            continue;
        }
        writeGzip(datasetId, rows, new Date().toISOString(), spec.source + ' Refreshed from the live SODA API.');
    }
}

const args = process.argv.slice(2);
if (args[0] === '--from-csv') {
    const datasetId = args[1];
    const csvPath = args[2];
    const capturedAt = args[3];
    if (!DATASETS[datasetId] || !csvPath || !capturedAt) {
        console.error('Usage: node tools/refresh_dob_backup.mjs --from-csv <datasetId> <csvPath> <capturedAt ISO>');
        process.exit(1);
    }
    const spec = DATASETS[datasetId];
    writeGzip(datasetId, rowsFromCsv(datasetId, csvPath), capturedAt, `${spec.source} Seeded from an archived NYC Open Data export captured at ${capturedAt}.`);
} else {
    refreshLive().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}
