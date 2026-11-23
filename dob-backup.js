// Saved DOB records for when NYC Open Data is down or publishes a partial file.
// Device and BIN lookups read this backup. Map date updates stay on the live file.
(function (root) {
    const API_HOST = 'https://data.cityofnewyork.us/resource/';
    const SPECS = {
        'e5aq-a4j2': {
            label: 'elevator devices',
            file: 'dob-backup/devices.json.gz',
            minHealthyCount: 100000,
            deviceField: 'device_number',
            binField: 'bin',
            keyFields: ['device_number'],
            fields: [
                'device_number', 'device_type', 'device_status', 'status_date', 'equipment_type',
                'periodic_report_year', 'cat1_report_year', 'cat1_latest_report_filed', 'cat5_latest_report_filed',
                'periodic_latest_inspection', 'bin', 'borough', 'house_number', 'street_name',
                'block', 'lot', 'zip_code', 'latitude', 'longitude'
            ]
        },
        'juyv-2jek': {
            label: 'device details',
            file: 'dob-backup/device-details.json.gz',
            minHealthyCount: 50000,
            deviceField: 'device_id',
            binField: '',
            keyFields: ['device_id', 'job_filing_number'],
            fields: [
                'job_filing_number', 'device_id', 'device_type', 'device_status', 'machine_type',
                'elevator_manufacturer', 'cargovernor_type', 'cwtgovernor_type', 'car_buffer_type',
                'mode_of_operation', 'car_safety_type', 'fire_emergency_phase', 'controller_manufacturer',
                'elevator_control', 'elevator_capacity_lbs', 'elevator_speed_fpm'
            ]
        },
        '855j-jady': {
            label: 'violations',
            file: '',
            minHealthyCount: 900000,
            deviceField: 'device_number',
            binField: 'bin',
            keyFields: ['violation_number'],
            fields: [
                'bin', 'device_number', 'violation_number', 'violation_issue_date',
                'violation_type', 'violation_remarks', 'violation_status'
            ]
        },
        'kfp4-dz4h': {
            label: 'elevator permits',
            file: '',
            minHealthyCount: 1000,
            deviceField: '',
            binField: 'bin',
            keyFields: ['job_filing_number'],
            fields: [
                'bin', 'job_filing_number', 'job_number', 'filing_date', 'filing_type', 'filing_status',
                'elevatordevicetype', 'descriptionofwork', 'gl_expirationdate', 'worker_compensation',
                'house_number', 'street_name', 'applicant_firstname', 'applicant_lastname',
                'applicant_businessname', 'owner_businessname'
            ]
        }
    };

    const indexes = {};
    const loaders = {};
    const healthCache = {};
    let manifestPromise = null;
    let refreshStarted = false;
    let nativeFetch = null;

    function specFor(datasetId) {
        return SPECS[datasetId] || null;
    }

    function datasetIdFromUrl(url) {
        const match = String(url || '').match(/\/resource\/([a-z0-9]{4}-[a-z0-9]{4})\.json/i);
        if (!match) return '';
        const id = match[1].toLowerCase();
        return SPECS[id] ? id : '';
    }

    function isPassthrough(url) {
        const text = String(url || '');
        return /[?&]\$select=[^&]*count\(/i.test(text) || /[?&]\$query=/i.test(text);
    }

    function liveOnlyRequested(init) {
        const headers = init && init.headers;
        if (!headers) return false;
        if (typeof headers.get === 'function') return headers.get('X-ELV3-Dob-Live-Only') === '1';
        return headers['X-ELV3-Dob-Live-Only'] === '1';
    }

    function requestUrl(input) {
        if (typeof input === 'string') return input;
        if (input && typeof input.url === 'string') return input.url;
        return '';
    }

    function searchParamsOf(url) {
        return new URL(url, API_HOST).searchParams;
    }

    function limitOf(url) {
        try {
            const raw = searchParamsOf(url).get('$limit');
            const value = Number(raw);
            if (!raw || !Number.isFinite(value) || value < 1) return 1000;
            return Math.min(Math.floor(value), 5000);
        } catch (error) {
            return 1000;
        }
    }

    function rowKey(datasetId, row) {
        const spec = specFor(datasetId);
        if (!spec || !row) return '';
        const parts = spec.keyFields.map(field => String(row[field] || '').trim().toUpperCase());
        if (parts.every(part => !part)) return '';
        return parts.join('|');
    }

    function compileWhere(source) {
        const text = String(source || '');
        let index = 0;

        function skip() {
            while (text[index] === ' ' || text[index] === '\n' || text[index] === '\t' || text[index] === '\r') index += 1;
        }

        function parseString() {
            skip();
            if (text[index] !== "'") throw new Error('Expected a quoted value');
            index += 1;
            let value = '';
            while (index < text.length) {
                if (text[index] === "'" && text[index + 1] === "'") {
                    value += "'";
                    index += 2;
                    continue;
                }
                if (text[index] === "'") {
                    index += 1;
                    return value;
                }
                value += text[index];
                index += 1;
            }
            throw new Error('Unterminated string');
        }

        function parseField() {
            skip();
            let upper = false;
            if (/^upper\s*\(/i.test(text.slice(index))) {
                upper = true;
                index = text.indexOf('(', index) + 1;
                skip();
            }
            const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(index));
            if (!match) throw new Error('Expected a field');
            const name = match[0].toLowerCase();
            index += match[0].length;
            skip();
            if (upper) {
                if (text[index] !== ')') throw new Error('Expected )');
                index += 1;
            }
            return { name, upper };
        }

        function readValue(row, field) {
            const raw = row && row[field.name] != null ? String(row[field.name]) : '';
            return field.upper ? raw.toUpperCase() : raw;
        }

        function likeExpression(pattern) {
            let expression = '';
            for (const char of pattern) {
                if (char === '%') expression += '.*';
                else if (char === '_') expression += '.';
                else expression += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
            return new RegExp('^' + expression + '$');
        }

        function parsePredicate() {
            const field = parseField();
            skip();
            const rest = text.slice(index);
            if (/^in\b/i.test(rest)) {
                index += 2;
                skip();
                if (text[index] !== '(') throw new Error('Expected (');
                index += 1;
                const values = [];
                skip();
                if (text[index] !== ')') {
                    values.push(field.upper ? parseString().toUpperCase() : parseString());
                    skip();
                    while (text[index] === ',') {
                        index += 1;
                        values.push(field.upper ? parseString().toUpperCase() : parseString());
                        skip();
                    }
                }
                if (text[index] !== ')') throw new Error('Expected )');
                index += 1;
                const set = new Set(values);
                return row => set.has(readValue(row, field));
            }
            if (/^like\b/i.test(rest)) {
                index += 4;
                const pattern = field.upper ? parseString().toUpperCase() : parseString();
                const expression = likeExpression(pattern);
                return row => expression.test(readValue(row, field));
            }
            if (text[index] !== '=') throw new Error('Unsupported comparison');
            index += 1;
            const expected = field.upper ? parseString().toUpperCase() : parseString();
            return row => readValue(row, field) === expected;
        }

        function parseFactor() {
            skip();
            if (text[index] === '(') {
                index += 1;
                const expression = parseExpr();
                skip();
                if (text[index] === ')') index += 1;
                return expression;
            }
            return parsePredicate();
        }

        function parseTerm() {
            let left = parseFactor();
            skip();
            while (/^and\b/i.test(text.slice(index))) {
                index += 3;
                const right = parseFactor();
                const previous = left;
                left = row => previous(row) && right(row);
                skip();
            }
            return left;
        }

        function parseExpr() {
            let left = parseTerm();
            skip();
            while (/^or\b/i.test(text.slice(index))) {
                index += 2;
                const right = parseTerm();
                const previous = left;
                left = row => previous(row) || right(row);
                skip();
            }
            return left;
        }

        const predicate = parseExpr();
        skip();
        if (index < text.length) throw new Error('Could not read the rest of the DOB query');
        return predicate;
    }

    function fieldEquals(row, field, expected) {
        return String(row && row[field] != null ? row[field] : '').toUpperCase() === String(expected || '').toUpperCase();
    }

    function rowsForScan(index, datasetId) {
        if (!index || !index.overlay || index.overlay.size === 0) return index ? index.rows : [];
        if (index.materialized && index.materializedCount === index.overlay.size) return index.materialized;
        const merged = new Map();
        index.rows.forEach(row => {
            const key = rowKey(datasetId, row);
            if (key) merged.set(key, row);
        });
        index.overlay.forEach((row, key) => merged.set(key, row));
        index.materialized = [...merged.values()];
        index.materializedCount = index.overlay.size;
        return index.materialized;
    }

    function collectMatches(datasetId, url, index) {
        const params = searchParamsOf(url);
        const where = params.get('$where');
        const spec = specFor(datasetId);
        if (where) {
            const predicate = compileWhere(where);
            return rowsForScan(index, datasetId).filter(predicate);
        }
        const filters = [];
        params.forEach((value, key) => {
            if (!key.startsWith('$') && value) filters.push({ key: key.toLowerCase(), value });
        });
        if (filters.length === 1 && spec && filters[0].key === spec.deviceField && index.byDevice) {
            const id = filters[0].value.toUpperCase();
            const base = (index.byDevice.get(id) || []).slice();
            if (!index.overlay || index.overlay.size === 0) return base;
            const merged = new Map();
            base.forEach(row => {
                const key = rowKey(datasetId, row);
                if (key) merged.set(key, row);
            });
            index.overlay.forEach((row, key) => {
                if (String(row[spec.deviceField] || '').trim().toUpperCase() === id) merged.set(key, row);
            });
            return [...merged.values()];
        }
        if (filters.length === 1 && filters[0].key === 'bin' && index.byBin) {
            const bin = filters[0].value.trim();
            const base = index.byBin.get(bin) || [];
            if (!index.overlay || index.overlay.size === 0) return base.slice();
            const merged = new Map();
            base.forEach(row => {
                const key = rowKey(datasetId, row);
                if (key) merged.set(key, row);
            });
            index.overlay.forEach((row, key) => {
                if (String(row.bin || '').trim() === bin) merged.set(key, row);
            });
            return [...merged.values()];
        }
        return rowsForScan(index, datasetId).filter(row => filters.every(filter => fieldEquals(row, filter.key, filter.value)));
    }

    function queryRows(datasetId, url, index) {
        if (!index) return [];
        return collectMatches(datasetId, url, index).slice(0, limitOf(url));
    }

    function buildIndex(datasetId, rows) {
        const spec = specFor(datasetId);
        const byDevice = new Map();
        const byBin = new Map();
        (rows || []).forEach(row => {
            const device = spec && spec.deviceField ? String(row[spec.deviceField] || '').trim().toUpperCase() : '';
            if (device) {
                if (!byDevice.has(device)) byDevice.set(device, []);
                byDevice.get(device).push(row);
            }
            const bin = spec && spec.binField ? String(row[spec.binField] || '').trim() : '';
            if (bin) {
                if (!byBin.has(bin)) byBin.set(bin, []);
                byBin.get(bin).push(row);
            }
        });
        return { datasetId, rows: rows || [], byDevice, byBin, overlay: new Map() };
    }

    function mergeRows(datasetId, backupRows, liveRows, capturedAt) {
        const merged = new Map();
        backupRows.forEach((row, position) => {
            const key = rowKey(datasetId, row) || `backup-${position}`;
            merged.set(key, Object.assign({}, row, { _dobBackup: capturedAt || 'backup' }));
        });
        (liveRows || []).forEach((row, position) => {
            const key = rowKey(datasetId, row) || `live-${position}`;
            merged.set(key, row);
        });
        return [...merged.values()];
    }

    function decideResponse(options) {
        const liveStatus = Number(options.liveStatus);
        const liveRows = options.liveRows;
        const health = options.health || 'unknown';
        const backupRows = Array.isArray(options.backupRows) ? options.backupRows : [];
        const limit = options.limit || 1000;
        const capturedAt = options.capturedAt || '';
        const liveOk = liveStatus === 200 && Array.isArray(liveRows);
        if (!liveOk) {
            const outage = !liveStatus || liveStatus === 429 || liveStatus >= 500;
            if (outage && backupRows.length) {
                return { kind: 'backup', rows: mergeRows(options.datasetId, backupRows.slice(0, limit), [], capturedAt).slice(0, limit) };
            }
            return { kind: 'live-error', status: liveStatus || 503 };
        }
        if (health === 'incomplete' && backupRows.length) {
            return { kind: 'merged', rows: mergeRows(options.datasetId, backupRows, liveRows, capturedAt).slice(0, limit) };
        }
        return { kind: 'live', rows: liveRows };
    }

    function inflatePayload(payload) {
        const fields = payload && payload.fields || [];
        return (payload && payload.rows || []).map(values => {
            const row = {};
            for (let i = 0; i < fields.length; i++) {
                if (values[i] != null && values[i] !== '') row[fields[i]] = String(values[i]);
            }
            return row;
        });
    }

    function capturedAtFor(datasetId) {
        const entry = root.__dobBackupManifest && root.__dobBackupManifest.datasets
            ? root.__dobBackupManifest.datasets[datasetId]
            : null;
        return entry && entry.capturedAt || '';
    }

    function formatBackupWhen(iso) {
        if (!iso) return 'an earlier save';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return 'the saved DOB backup';
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(date);
    }

    function noticeFor(datasetId) {
        const health = healthCache[datasetId];
        const spec = specFor(datasetId);
        const captured = formatBackupWhen(capturedAtFor(datasetId));
        const count = health && health.count;
        const saved = root.__dobBackupManifest && root.__dobBackupManifest.datasets[datasetId];
        const savedCount = saved && saved.rowCount ? Number(saved.rowCount).toLocaleString('en-US') : '';
        if (!health) return null;
        if (health.value === 'incomplete') {
            const liveCount = count ? Number(count).toLocaleString('en-US') : 'only part of the';
            return {
                active: true,
                text: `NYC Open Data is publishing an incomplete ${spec.label} file (${liveCount} rows). Lookups are using the DOB backup from ${captured}${savedCount ? ` (${savedCount} rows)` : ''}. A row the city is still publishing is used instead of the backup. Backup dates are as of ${captured}. DOB Info Update still waits for the live file, so saved test dates are left as they are.`
            };
        }
        if (health.value === 'unavailable') {
            return {
                active: true,
                text: `NYC Open Data is not responding for ${spec.label}. Lookups use the DOB backup from ${captured}${savedCount ? ` (${savedCount} rows)` : ''}. DOB Info Update still waits for the live file, so saved test dates are left as they are.`
            };
        }
        if (savedCount) {
            return {
                active: false,
                text: `DOB backup is on file: ${savedCount} ${spec.label} from ${captured}. Lookups use it if NYC Open Data goes down or publishes an incomplete file.`
            };
        }
        return {
            active: false,
            text: `DOB ${spec.label} from successful lookups are kept in this browser and reused if NYC Open Data goes down.`
        };
    }

    function renderNotice() {
        if (!root.document) return;
        const device = noticeFor('e5aq-a4j2');
        const details = healthCache['juyv-2jek'];
        let text = device ? device.text : '';
        if (device && device.active && details && details.value !== 'healthy') {
            const detailWhen = formatBackupWhen(capturedAtFor('juyv-2jek'));
            text += ` Device specifications use the backup from ${detailWhen} when the city file is missing them.`;
        }
        const active = !!(device && device.active);
        const quickText = active
            ? `DOB backup is covering lookups (${formatBackupWhen(capturedAtFor('e5aq-a4j2'))}). Saved map test dates stay on the live file.`
            : text;
        [
            ['dobBackupNotice', text],
            ['quickDobBackupNotice', quickText]
        ].forEach(([id, message]) => {
            const element = root.document.getElementById(id);
            if (!element) return;
            if (!message) {
                element.hidden = true;
                element.textContent = '';
                return;
            }
            element.hidden = false;
            element.textContent = message;
            element.style.borderColor = active ? '#ff9800' : 'var(--input-border)';
            element.style.background = active ? 'rgba(255,152,0,0.14)' : 'var(--panel-bg)';
            element.style.fontWeight = active ? '600' : '500';
        });
    }

    async function loadManifest(fetchImpl) {
        if (root.__dobBackupManifest) return root.__dobBackupManifest;
        if (!manifestPromise) {
            manifestPromise = fetchImpl('dob-backup/manifest.json').then(response => {
                if (!response.ok) throw new Error('manifest');
                return response.json();
            }).then(manifest => {
                root.__dobBackupManifest = manifest;
                if (manifest && manifest.datasets) {
                    Object.keys(manifest.datasets).forEach(id => {
                        if (!SPECS[id]) return;
                        const entry = manifest.datasets[id];
                        if (entry.file) SPECS[id].file = entry.file;
                        if (entry.minHealthyCount) SPECS[id].minHealthyCount = entry.minHealthyCount;
                    });
                }
                return manifest;
            }).catch(() => {
                root.__dobBackupManifest = { datasets: {} };
                return root.__dobBackupManifest;
            });
        }
        return manifestPromise;
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            if (!root.indexedDB) {
                reject(new Error('IndexedDB is unavailable'));
                return;
            }
            const request = root.indexedDB.open('elv3-dob-backup', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots');
                if (!db.objectStoreNames.contains('records')) db.createObjectStore('records');
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function idbRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function readSnapshot(datasetId) {
        try {
            const db = await openDb();
            const snapshot = await idbRequest(db.transaction('snapshots').objectStore('snapshots').get(datasetId));
            const records = await idbRequest(db.transaction('records').objectStore('records').getAll());
            db.close();
            return {
                snapshot,
                records: (records || []).filter(record => record && record.dataset === datasetId).map(record => record.row)
            };
        } catch (error) {
            return { snapshot: null, records: [] };
        }
    }

    async function writeSnapshot(datasetId, payload) {
        const db = await openDb();
        await idbRequest(db.transaction('snapshots', 'readwrite').objectStore('snapshots').put(payload, datasetId));
        db.close();
    }

    async function rememberRows(datasetId, rows) {
        const index = indexes[datasetId];
        if (index) {
            if (!index.overlay) index.overlay = new Map();
            rows.forEach(row => {
                const key = rowKey(datasetId, row);
                if (key) index.overlay.set(key, row);
            });
            index.materialized = null;
        }
        try {
            const db = await openDb();
            const store = db.transaction('records', 'readwrite').objectStore('records');
            rows.forEach(row => {
                const key = rowKey(datasetId, row);
                if (!key) return;
                store.put({ dataset: datasetId, key, row, savedAt: new Date().toISOString() }, `${datasetId}|${key}`);
            });
            await new Promise((resolve, reject) => {
                store.transaction.oncomplete = resolve;
                store.transaction.onerror = () => reject(store.transaction.error);
            });
            db.close();
        } catch (error) {
            // The shipped file still covers lookups when the browser cannot store a fresher copy.
        }
    }

    async function loadGzip(fetchImpl, url) {
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error(`Backup file ${url} returned HTTP ${response.status}`);
        if (typeof root.DecompressionStream === 'function' && response.body && response.body.pipeThrough) {
            const stream = response.body.pipeThrough(new root.DecompressionStream('gzip'));
            const text = await new root.Response(stream).text();
            return JSON.parse(text);
        }
        throw new Error('This browser cannot read the DOB backup file');
    }

    async function loadIndex(datasetId, fetchImpl) {
        await loadManifest(fetchImpl);
        const spec = specFor(datasetId);
        const stored = await readSnapshot(datasetId);
        let rows = [];
        let capturedAt = capturedAtFor(datasetId);
        const snapshot = stored.snapshot;
        const snapshotHealthy = snapshot && Array.isArray(snapshot.rows) && snapshot.rows.length >= (spec.minHealthyCount || 0);
        if (snapshotHealthy && (!capturedAt || String(snapshot.capturedAt || '') >= capturedAt)) {
            rows = inflatePayload(snapshot);
            capturedAt = snapshot.capturedAt || capturedAt;
            if (root.__dobBackupManifest && root.__dobBackupManifest.datasets) {
                root.__dobBackupManifest.datasets[datasetId] = Object.assign({}, root.__dobBackupManifest.datasets[datasetId], {
                    capturedAt,
                    rowCount: rows.length
                });
            }
        } else if (spec.file) {
            const payload = await loadGzip(fetchImpl, spec.file);
            rows = inflatePayload(payload);
            capturedAt = payload.capturedAt || capturedAt;
        }
        if (stored.records.length) {
            const merged = new Map();
            rows.forEach(row => {
                const key = rowKey(datasetId, row);
                if (key) merged.set(key, row);
            });
            stored.records.forEach(row => {
                const key = rowKey(datasetId, row);
                if (key) merged.set(key, row);
            });
            rows = [...merged.values()];
        }
        const index = buildIndex(datasetId, rows);
        index.capturedAt = capturedAt;
        indexes[datasetId] = index;
        return index;
    }

    function ensureIndex(datasetId, fetchImpl) {
        if (indexes[datasetId]) return Promise.resolve(indexes[datasetId]);
        if (!loaders[datasetId]) {
            loaders[datasetId] = loadIndex(datasetId, fetchImpl).catch(error => {
                delete loaders[datasetId];
                console.warn('DOB backup could not be loaded', error);
                return null;
            });
        }
        return loaders[datasetId];
    }

    async function healthFor(datasetId, fetchImpl) {
        const cached = healthCache[datasetId];
        if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.value;
        const spec = specFor(datasetId);
        try {
            const response = await fetchImpl(`${API_HOST}${datasetId}.json?$select=count(*)`);
            if (!response.ok) throw new Error(String(response.status));
            const data = await response.json();
            const raw = data && data[0] ? (data[0].count || data[0].count_1 || Object.values(data[0])[0]) : 0;
            const count = Number(raw) || 0;
            const value = count >= (spec.minHealthyCount || Number.MAX_SAFE_INTEGER) ? 'healthy' : 'incomplete';
            healthCache[datasetId] = { at: Date.now(), value, count };
            return value;
        } catch (error) {
            healthCache[datasetId] = { at: Date.now(), value: 'unavailable', count: 0 };
            return 'unavailable';
        }
    }

    function jsonResponse(rows, backup) {
        const headers = { 'content-type': 'application/json' };
        if (backup) headers['X-ELV3-Dob-Backup'] = backup;
        return new root.Response(JSON.stringify(rows), { status: 200, headers });
    }

    function errorResponse(status) {
        return new root.Response(JSON.stringify({ message: 'NYC Open Data is unavailable and the DOB backup has no matching rows' }), {
            status: status || 503,
            headers: { 'content-type': 'application/json' }
        });
    }

    async function refreshDataset(datasetId, fetchImpl) {
        const spec = specFor(datasetId);
        if (!spec || !spec.file) return;
        const health = healthCache[datasetId];
        if (!health || health.value !== 'healthy' || health.count > 200000) return;
        const rows = [];
        const pageSize = 50000;
        for (let offset = 0; ; offset += pageSize) {
            const params = new URLSearchParams();
            params.set('$select', spec.fields.join(','));
            params.set('$order', spec.deviceField || spec.keyFields[0]);
            params.set('$limit', String(pageSize));
            params.set('$offset', String(offset));
            const response = await fetchImpl(`${API_HOST}${datasetId}.json?${params}`, {
                headers: { 'X-ELV3-Dob-Live-Only': '1' }
            });
            if (!response.ok) throw new Error(`Backup refresh failed (${response.status})`);
            const data = await response.json();
            if (!Array.isArray(data) || data.length === 0) break;
            rows.push(...data);
            if (data.length < pageSize) break;
        }
        if (rows.length < spec.minHealthyCount) return;
        const capturedAt = new Date().toISOString();
        const payload = {
            dataset: datasetId,
            capturedAt,
            fields: spec.fields,
            rows: rows.map(row => spec.fields.map(field => row[field] == null ? '' : String(row[field])))
        };
        await writeSnapshot(datasetId, payload);
        indexes[datasetId] = buildIndex(datasetId, rows);
        indexes[datasetId].capturedAt = capturedAt;
        if (root.__dobBackupManifest && root.__dobBackupManifest.datasets) {
            root.__dobBackupManifest.datasets[datasetId] = Object.assign({}, root.__dobBackupManifest.datasets[datasetId], {
                capturedAt,
                rowCount: rows.length
            });
        }
        renderNotice();
    }

    function scheduleRefresh(fetchImpl) {
        if (refreshStarted || !root.indexedDB) return;
        const device = healthCache['e5aq-a4j2'];
        if (!device || device.value !== 'healthy') return;
        refreshStarted = true;
        setTimeout(() => {
            refreshDataset('e5aq-a4j2', fetchImpl)
                .then(() => refreshDataset('juyv-2jek', fetchImpl))
                .catch(error => console.warn('DOB backup refresh failed', error));
        }, 5000);
    }

    async function warmHealth(fetchImpl) {
        await loadManifest(fetchImpl);
        await Promise.all(Object.keys(SPECS).map(datasetId => healthFor(datasetId, fetchImpl)));
        renderNotice();
        const device = healthCache['e5aq-a4j2'];
        const details = healthCache['juyv-2jek'];
        if (device && device.value !== 'healthy') ensureIndex('e5aq-a4j2', fetchImpl).then(renderNotice);
        if (details && details.value !== 'healthy') ensureIndex('juyv-2jek', fetchImpl);
        scheduleRefresh(fetchImpl);
    }

    function install() {
        if (!root.fetch || root.fetch.__dobBackup) return;
        nativeFetch = root.fetch.bind(root);
        async function wrapped(input, init) {
            const url = requestUrl(input);
            const datasetId = datasetIdFromUrl(url);
            if (!datasetId || isPassthrough(url) || liveOnlyRequested(init)) return nativeFetch(input, init);
            let liveStatus = 0;
            let liveRows = null;
            try {
                const response = await nativeFetch(input, init);
                liveStatus = response.status;
                if (response.ok) {
                    const data = await response.json();
                    if (!Array.isArray(data)) {
                        return new root.Response(JSON.stringify(data == null ? null : data), {
                            status: 200,
                            headers: { 'content-type': 'application/json' }
                        });
                    }
                    liveRows = data;
                }
            } catch (error) {
                liveStatus = 0;
            }
            const health = await healthFor(datasetId, nativeFetch);
            renderNotice();
            const serviceDown = !liveStatus || liveStatus === 429 || liveStatus >= 500;
            const needsBackup = serviceDown || (liveStatus === 200 && health === 'incomplete');
            let backupRows = [];
            let capturedAt = '';
            if (needsBackup) {
                const index = await ensureIndex(datasetId, nativeFetch);
                if (index) {
                    try {
                        backupRows = collectMatches(datasetId, url, index);
                        capturedAt = index.capturedAt || capturedAtFor(datasetId);
                    } catch (error) {
                        backupRows = [];
                    }
                }
            }
            const decision = decideResponse({
                datasetId,
                liveStatus,
                liveRows,
                health,
                backupRows,
                limit: limitOf(url),
                capturedAt
            });
            if (decision.kind === 'live-error') return errorResponse(decision.status);
            if (decision.kind === 'live') {
                if (health !== 'unavailable' && liveRows && liveRows.length) rememberRows(datasetId, liveRows);
                scheduleRefresh(nativeFetch);
                return jsonResponse(decision.rows);
            }
            const liveOnlyRows = (liveRows || []).filter(row => row && !row._dobBackup);
            if (health !== 'unavailable' && liveOnlyRows.length) rememberRows(datasetId, liveOnlyRows);
            const stamp = decision.rows.some(row => row && row._dobBackup) ? (capturedAt || 'backup') : '';
            return jsonResponse(decision.rows, stamp);
        }
        wrapped.__dobBackup = true;
        root.fetch = wrapped;
        const start = () => warmHealth(nativeFetch);
        if (root.document && root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start);
        else start();
    }

    root.DobBackup = {
        SPECS,
        compileWhere,
        queryRows,
        buildIndex,
        mergeRows,
        decideResponse,
        inflatePayload,
        noticeFor,
        formatBackupWhen,
        install,
        healthCache
    };

    if (root.document && root.fetch && !root.__DOB_BACKUP_NO_INSTALL) install();
})(typeof window !== 'undefined' ? window : globalThis);
