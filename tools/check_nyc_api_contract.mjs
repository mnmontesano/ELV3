#!/usr/bin/env node

const API_ROOT = 'https://data.cityofnewyork.us/resource';

async function getJson(dataset, params = {}) {
    const url = new URL(`${API_ROOT}/${dataset}.json`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`${dataset} returned HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`${dataset} returned a non-array response`);
    return data;
}

async function getSchemaFields(dataset) {
    const response = await fetch(`https://data.cityofnewyork.us/api/views/${dataset}.json`, {
        signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`${dataset} metadata returned HTTP ${response.status}`);
    const metadata = await response.json();
    if (!Array.isArray(metadata.columns)) throw new Error(`${dataset} metadata has no columns`);
    return new Set(metadata.columns.map(column => column.fieldName).filter(Boolean));
}

function requireFields(dataset, schemaFields, fields) {
    const missing = fields.filter(field => !schemaFields.has(field));
    if (missing.length) throw new Error(`${dataset} is missing expected fields: ${missing.join(', ')}`);
}

async function main() {
    const deviceRows = await getJson('e5aq-a4j2', { '$limit': '1' });
    if (!deviceRows.length) throw new Error('e5aq-a4j2 returned no device records');
    requireFields('e5aq-a4j2', await getSchemaFields('e5aq-a4j2'), [
        'device_number', 'device_type', 'equipment_type', 'device_status', 'bin',
        'cat1_latest_report_filed', 'cat5_latest_report_filed', 'periodic_latest_inspection'
    ]);

    const typeRows = await getJson('e5aq-a4j2', {
        '$select': 'device_type,count(*) AS count',
        '$group': 'device_type',
        '$limit': '100'
    });
    const deviceTypes = new Set(typeRows.map(row => row.device_type));
    const expectedTypes = [
        'Elevator', 'Accessibility Lift', 'Personnel Hoist', 'Escalator',
        'Dumbwaiter', 'Conveyor', 'Manlift', 'Moving Walk'
    ];
    const missingTypes = expectedTypes.filter(type => !deviceTypes.has(type));
    if (missingTypes.length) throw new Error(`NYC device types changed; missing: ${missingTypes.join(', ')}`);
    for (const deprecated of ['Dumwaiter', 'Moving Walkway']) {
        if (deviceTypes.has(deprecated)) throw new Error(`Deprecated device type unexpectedly returned: ${deprecated}`);
    }

    const statusRows = await getJson('e5aq-a4j2', {
        '$select': 'device_status,count(*) AS count',
        '$group': 'device_status',
        '$limit': '100'
    });
    const statuses = new Set(statusRows.map(row => row.device_status));
    const expectedStatuses = [
        'Active', 'Removed', 'Work in Progress', 'Dismantled',
        'Deleted', 'Withdrawn', 'Sealed'
    ];
    const missingStatuses = expectedStatuses.filter(status => !statuses.has(status));
    if (missingStatuses.length) throw new Error(`NYC device statuses changed; missing: ${missingStatuses.join(', ')}`);

    const equipmentRows = await getJson('e5aq-a4j2', {
        '$select': 'equipment_type,count(*) AS count',
        '$group': 'equipment_type',
        '$limit': '100'
    });
    const equipmentTypes = new Set(equipmentRows.map(row => row.equipment_type));
    const expectedEquipment = [
        'Dumbwaiters', 'EscalatorsMovingWalks',
        'PlatformStairwayChairLifts', 'HydraulicElevators'
    ];
    const missingEquipment = expectedEquipment.filter(type => !equipmentTypes.has(type));
    if (missingEquipment.length) throw new Error(`NYC equipment types changed; missing: ${missingEquipment.join(', ')}`);

    const violationRows = await getJson('855j-jady', { '$limit': '1' });
    if (!violationRows.length) throw new Error('855j-jady returned no violation records');
    requireFields('855j-jady', await getSchemaFields('855j-jady'), [
        'device_number', 'violation_number', 'violation_issue_date',
        'violation_type', 'violation_remarks', 'violation_status'
    ]);

    const permitRows = await getJson('kfp4-dz4h', { '$limit': '1' });
    if (!permitRows.length) throw new Error('kfp4-dz4h returned no permit records');
    requireFields('kfp4-dz4h', await getSchemaFields('kfp4-dz4h'), [
        'bin', 'job_filing_number', 'filing_date', 'filing_status',
        'elevatordevicetype', 'descriptionofwork',
        'gl_expirationdate', 'worker_compensation'
    ]);
    const permitTypeRows = await getJson('kfp4-dz4h', {
        '$select': 'elevatordevicetype,count(*) AS count',
        '$group': 'elevatordevicetype',
        '$limit': '100'
    });
    const permitTypes = new Set(permitTypeRows.map(row => row.elevatordevicetype));
    if (!permitTypes.has('Dumbwaiter')) throw new Error('NYC permit device type changed; missing: Dumbwaiter');
    for (const deprecated of ['Dumwaiter', 'Moving Walkway']) {
        if (permitTypes.has(deprecated)) throw new Error(`Deprecated permit device type unexpectedly returned: ${deprecated}`);
    }

    const detailRows = await getJson('juyv-2jek', { '$limit': '1' });
    if (!detailRows.length) throw new Error('juyv-2jek returned no device detail records');
    requireFields('juyv-2jek', await getSchemaFields('juyv-2jek'), [
        'device_id', 'device_type', 'device_status', 'machine_type',
        'elevator_manufacturer', 'cargovernor_type', 'cwtgovernor_type',
        'car_buffer_type', 'mode_of_operation', 'car_safety_type',
        'fire_emergency_phase', 'controller_manufacturer', 'elevator_control',
        'elevator_capacity_lbs', 'elevator_speed_fpm'
    ]);

    console.log(`NYC API contract OK (${expectedTypes.length} recognized device types).`);
}

main().catch(error => {
    console.error(`NYC API contract failed: ${error.message}`);
    process.exitCode = 1;
});
