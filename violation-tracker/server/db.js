const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/violations.db');
let db;

function getDb() {
    if (!db) {
        // Ensure data directory exists
        const fs = require('fs');
        const dataDir = path.dirname(dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
    }
    return db;
}

function initialize() {
    const database = getDb();
    
    // Create core tables first (without category_id for backwards compatibility)
    database.exec(`
        -- Buildings to monitor (base table without category)
        CREATE TABLE IF NOT EXISTS buildings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bin VARCHAR(10) NOT NULL UNIQUE,
            address TEXT,
            nickname TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Devices at monitored buildings
        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_number VARCHAR(20) NOT NULL UNIQUE,
            bin VARCHAR(10) NOT NULL,
            device_type TEXT,
            device_status TEXT,
            last_checked DATETIME,
            FOREIGN KEY (bin) REFERENCES buildings(bin) ON DELETE CASCADE
        );

        -- Tracked violations
        CREATE TABLE IF NOT EXISTS violations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_number VARCHAR(20) NOT NULL,
            bin VARCHAR(10),
            violation_number VARCHAR(50),
            violation_type TEXT,
            issue_date DATE,
            description TEXT,
            status TEXT,
            severity TEXT,
            disposition TEXT,
            disposition_date DATE,
            first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_new BOOLEAN DEFAULT 1,
            acknowledged BOOLEAN DEFAULT 0,
            acknowledged_at DATETIME,
            UNIQUE(violation_number, device_number)
        );

        -- Check history for monitoring
        CREATE TABLE IF NOT EXISTS check_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            buildings_checked INTEGER,
            devices_checked INTEGER,
            new_violations_found INTEGER,
            status TEXT,
            error_message TEXT
        );

        -- Settings table for configuration
        CREATE TABLE IF NOT EXISTS settings (
            key VARCHAR(50) PRIMARY KEY,
            value TEXT
        );

        -- Create indexes for better query performance
        CREATE INDEX IF NOT EXISTS idx_violations_device ON violations(device_number);
        CREATE INDEX IF NOT EXISTS idx_violations_bin ON violations(bin);
        CREATE INDEX IF NOT EXISTS idx_violations_new ON violations(is_new);
        CREATE INDEX IF NOT EXISTS idx_devices_bin ON devices(bin);
    `);
    
    // Create categories table
    database.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT DEFAULT '#3b82f6',
            icon TEXT DEFAULT '📁',
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // Add category_id column to buildings if it doesn't exist (migration for existing databases)
    try {
        database.exec('ALTER TABLE buildings ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL');
        console.log('Added category_id column to buildings table');
    } catch (e) {
        // Column already exists, ignore
    }
    
    // Create index on category_id (only after column exists)
    try {
        database.exec('CREATE INDEX IF NOT EXISTS idx_buildings_category ON buildings(category_id)');
    } catch (e) {
        // Index may already exist or column doesn't exist
    }
    
    // Create ELV3 inspections table
    database.exec(`
        CREATE TABLE IF NOT EXISTS elv3_inspections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bin VARCHAR(10),
            address TEXT,
            inspection_date DATE,
            report_type TEXT,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            filename TEXT,
            raw_data TEXT,
            FOREIGN KEY (bin) REFERENCES buildings(bin) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS elv3_violations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inspection_id INTEGER NOT NULL,
            device_number VARCHAR(20) NOT NULL,
            bin VARCHAR(10),
            part_code VARCHAR(3),
            part_description TEXT,
            condition_code VARCHAR(2),
            condition_description TEXT,
            remedy_code VARCHAR(2),
            remedy_description TEXT,
            comments TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (inspection_id) REFERENCES elv3_inspections(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS idx_elv3_inspections_bin ON elv3_inspections(bin);
        CREATE INDEX IF NOT EXISTS idx_elv3_violations_inspection ON elv3_violations(inspection_id);
        CREATE INDEX IF NOT EXISTS idx_elv3_violations_device ON elv3_violations(device_number);
    `);

    // Set default settings if not exists
    const insertSetting = database.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('check_interval', '6'); // Check every 6 hours by default
    insertSetting.run('last_check', null);

    console.log('Database initialized successfully');
}

// Category operations
const categoryOps = {
    getAll: () => getDb().prepare('SELECT * FROM categories ORDER BY sort_order, name').all(),
    
    getById: (id) => getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id),
    
    getByName: (name) => getDb().prepare('SELECT * FROM categories WHERE name = ?').get(name),
    
    add: (name, color, icon) => {
        const stmt = getDb().prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)');
        return stmt.run(name, color || '#3b82f6', icon || '📁');
    },
    
    update: (id, name, color, icon) => {
        const stmt = getDb().prepare('UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?');
        return stmt.run(name, color, icon, id);
    },
    
    updateOrder: (id, sortOrder) => {
        const stmt = getDb().prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
        return stmt.run(sortOrder, id);
    },
    
    remove: (id) => {
        // Buildings in this category will have category_id set to NULL (ON DELETE SET NULL)
        return getDb().prepare('DELETE FROM categories WHERE id = ?').run(id);
    },
    
    getBuildingCount: (id) => {
        const result = getDb().prepare('SELECT COUNT(*) as count FROM buildings WHERE category_id = ?').get(id);
        return result ? result.count : 0;
    }
};

// Building operations
const buildingOps = {
    getAll: () => getDb().prepare(`
        SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM buildings b
        LEFT JOIN categories c ON b.category_id = c.id
        ORDER BY c.sort_order, c.name, b.created_at DESC
    `).all(),
    
    getByCategory: (categoryId) => getDb().prepare(`
        SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM buildings b
        LEFT JOIN categories c ON b.category_id = c.id
        WHERE b.category_id = ?
        ORDER BY b.created_at DESC
    `).all(categoryId),
    
    getUncategorized: () => getDb().prepare(`
        SELECT * FROM buildings WHERE category_id IS NULL ORDER BY created_at DESC
    `).all(),
    
    getByBin: (bin) => getDb().prepare(`
        SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM buildings b
        LEFT JOIN categories c ON b.category_id = c.id
        WHERE b.bin = ?
    `).get(bin),
    
    add: (bin, address, nickname, categoryId) => {
        const stmt = getDb().prepare('INSERT INTO buildings (bin, address, nickname, category_id) VALUES (?, ?, ?, ?)');
        return stmt.run(bin, address, nickname || null, categoryId || null);
    },
    
    update: (bin, address, nickname, categoryId) => {
        const stmt = getDb().prepare('UPDATE buildings SET address = ?, nickname = ?, category_id = ? WHERE bin = ?');
        return stmt.run(address, nickname, categoryId || null, bin);
    },
    
    setCategory: (bin, categoryId) => {
        const stmt = getDb().prepare('UPDATE buildings SET category_id = ? WHERE bin = ?');
        return stmt.run(categoryId || null, bin);
    },
    
    remove: (bin) => {
        const db = getDb();
        // Delete violations for devices in this building
        db.prepare('DELETE FROM violations WHERE bin = ?').run(bin);
        // Delete devices
        db.prepare('DELETE FROM devices WHERE bin = ?').run(bin);
        // Delete building
        return db.prepare('DELETE FROM buildings WHERE bin = ?').run(bin);
    }
};

// Device operations
const deviceOps = {
    getByBin: (bin) => getDb().prepare('SELECT * FROM devices WHERE bin = ? ORDER BY device_number').all(bin),
    
    getAll: () => getDb().prepare('SELECT * FROM devices ORDER BY bin, device_number').all(),
    
    upsert: (device) => {
        const stmt = getDb().prepare(`
            INSERT INTO devices (device_number, bin, device_type, device_status, last_checked)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(device_number) DO UPDATE SET
                device_type = excluded.device_type,
                device_status = excluded.device_status,
                last_checked = CURRENT_TIMESTAMP
        `);
        return stmt.run(device.device_number, device.bin, device.device_type, device.device_status);
    },
    
    updateLastChecked: (deviceNumber) => {
        const stmt = getDb().prepare('UPDATE devices SET last_checked = CURRENT_TIMESTAMP WHERE device_number = ?');
        return stmt.run(deviceNumber);
    }
};

// Violation operations
const violationOps = {
    getAll: (filters = {}) => {
        let query = 'SELECT v.*, d.device_type, b.address, b.nickname FROM violations v';
        query += ' LEFT JOIN devices d ON v.device_number = d.device_number';
        query += ' LEFT JOIN buildings b ON v.bin = b.bin';
        
        const conditions = [];
        const params = [];
        
        if (filters.is_new !== undefined) {
            conditions.push('v.is_new = ?');
            params.push(filters.is_new ? 1 : 0);
        }
        
        if (filters.acknowledged !== undefined) {
            conditions.push('v.acknowledged = ?');
            params.push(filters.acknowledged ? 1 : 0);
        }
        
        if (filters.bin) {
            conditions.push('v.bin = ?');
            params.push(filters.bin);
        }
        
        if (filters.device_number) {
            conditions.push('v.device_number = ?');
            params.push(filters.device_number);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY v.first_seen DESC, v.issue_date DESC';
        
        if (filters.limit) {
            query += ' LIMIT ?';
            params.push(filters.limit);
        }
        
        return getDb().prepare(query).all(...params);
    },
    
    getNew: () => {
        return getDb().prepare(`
            SELECT v.*, d.device_type, b.address, b.nickname 
            FROM violations v
            LEFT JOIN devices d ON v.device_number = d.device_number
            LEFT JOIN buildings b ON v.bin = b.bin
            WHERE v.is_new = 1 AND v.acknowledged = 0
            ORDER BY v.first_seen DESC
        `).all();
    },
    
    getByDevice: (deviceNumber) => {
        return getDb().prepare('SELECT * FROM violations WHERE device_number = ? ORDER BY issue_date DESC').all(deviceNumber);
    },
    
    exists: (violationNumber, deviceNumber) => {
        const result = getDb().prepare('SELECT 1 FROM violations WHERE violation_number = ? AND device_number = ?').get(violationNumber, deviceNumber);
        return !!result;
    },
    
    add: (violation) => {
        const stmt = getDb().prepare(`
            INSERT OR IGNORE INTO violations 
            (device_number, bin, violation_number, violation_type, issue_date, description, status, severity, disposition, disposition_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            violation.device_number,
            violation.bin,
            violation.violation_number,
            violation.violation_type,
            violation.issue_date,
            violation.description,
            violation.status,
            violation.severity,
            violation.disposition,
            violation.disposition_date
        );
    },
    
    acknowledge: (id) => {
        const stmt = getDb().prepare('UPDATE violations SET acknowledged = 1, acknowledged_at = CURRENT_TIMESTAMP WHERE id = ?');
        return stmt.run(id);
    },
    
    acknowledgeAll: () => {
        const stmt = getDb().prepare('UPDATE violations SET acknowledged = 1, acknowledged_at = CURRENT_TIMESTAMP WHERE acknowledged = 0');
        return stmt.run();
    },
    
    markNotNew: (id) => {
        const stmt = getDb().prepare('UPDATE violations SET is_new = 0 WHERE id = ?');
        return stmt.run(id);
    },
    
    getStats: () => {
        const db = getDb();
        return {
            total: db.prepare('SELECT COUNT(*) as count FROM violations').get().count,
            new: db.prepare('SELECT COUNT(*) as count FROM violations WHERE is_new = 1').get().count,
            unacknowledged: db.prepare('SELECT COUNT(*) as count FROM violations WHERE acknowledged = 0').get().count,
            byBuilding: db.prepare(`
                SELECT b.bin, b.address, b.nickname, COUNT(v.id) as violation_count
                FROM buildings b
                LEFT JOIN violations v ON b.bin = v.bin
                GROUP BY b.bin
                ORDER BY violation_count DESC
            `).all()
        };
    }
};

// Check history operations
const checkHistoryOps = {
    add: (result) => {
        const stmt = getDb().prepare(`
            INSERT INTO check_history (buildings_checked, devices_checked, new_violations_found, status, error_message)
            VALUES (?, ?, ?, ?, ?)
        `);
        return stmt.run(result.buildings_checked, result.devices_checked, result.new_violations_found, result.status, result.error_message);
    },
    
    getRecent: (limit = 10) => {
        return getDb().prepare('SELECT * FROM check_history ORDER BY checked_at DESC LIMIT ?').all(limit);
    },
    
    getLast: () => {
        return getDb().prepare('SELECT * FROM check_history ORDER BY checked_at DESC LIMIT 1').get();
    }
};

// Settings operations
const settingsOps = {
    get: (key) => {
        const result = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return result ? result.value : null;
    },
    
    set: (key, value) => {
        const stmt = getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        return stmt.run(key, value);
    }
};

// ELV3 Inspection operations
const elv3Ops = {
    // Inspections
    getAllInspections: () => {
        return getDb().prepare(`
            SELECT i.*, b.nickname as building_nickname,
                   (SELECT COUNT(*) FROM elv3_violations v WHERE v.inspection_id = i.id) as violation_count
            FROM elv3_inspections i
            LEFT JOIN buildings b ON i.bin = b.bin
            ORDER BY i.uploaded_at DESC
        `).all();
    },
    
    getInspectionById: (id) => {
        return getDb().prepare(`
            SELECT i.*, b.nickname as building_nickname
            FROM elv3_inspections i
            LEFT JOIN buildings b ON i.bin = b.bin
            WHERE i.id = ?
        `).get(id);
    },
    
    getInspectionsByBin: (bin) => {
        return getDb().prepare(`
            SELECT i.*, 
                   (SELECT COUNT(*) FROM elv3_violations v WHERE v.inspection_id = i.id) as violation_count
            FROM elv3_inspections i
            WHERE i.bin = ?
            ORDER BY i.uploaded_at DESC
        `).all(bin);
    },
    
    addInspection: (data) => {
        const stmt = getDb().prepare(`
            INSERT INTO elv3_inspections (bin, address, inspection_date, report_type, filename, raw_data)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            data.bin || null,
            data.address || null,
            data.inspectionDate || null,
            data.reportType || null,
            data.filename || null,
            null // rawData stored as null
        );
    },
    
    deleteInspection: (id) => {
        const db = getDb();
        // Violations will be deleted by CASCADE
        return db.prepare('DELETE FROM elv3_inspections WHERE id = ?').run(id);
    },
    
    // Violations
    getViolationsByInspection: (inspectionId) => {
        return getDb().prepare(`
            SELECT * FROM elv3_violations 
            WHERE inspection_id = ? 
            ORDER BY device_number, id
        `).all(inspectionId);
    },
    
    getViolationsByDevice: (deviceNumber) => {
        return getDb().prepare(`
            SELECT v.*, i.inspection_date, i.address
            FROM elv3_violations v
            JOIN elv3_inspections i ON v.inspection_id = i.id
            WHERE v.device_number = ?
            ORDER BY i.inspection_date DESC
        `).all(deviceNumber);
    },
    
    getViolationsByBin: (bin) => {
        return getDb().prepare(`
            SELECT v.*, i.inspection_date, i.address, i.filename
            FROM elv3_violations v
            JOIN elv3_inspections i ON v.inspection_id = i.id
            WHERE v.bin = ?
            ORDER BY i.inspection_date DESC, v.device_number
        `).all(bin);
    },
    
    getAllViolations: () => {
        return getDb().prepare(`
            SELECT v.*, i.inspection_date, i.address, i.filename, b.nickname as building_nickname
            FROM elv3_violations v
            JOIN elv3_inspections i ON v.inspection_id = i.id
            LEFT JOIN buildings b ON v.bin = b.bin
            ORDER BY i.uploaded_at DESC, v.device_number
        `).all();
    },
    
    addViolation: (violation) => {
        const stmt = getDb().prepare(`
            INSERT INTO elv3_violations 
            (inspection_id, device_number, bin, part_code, part_description, 
             condition_code, condition_description, remedy_code, remedy_description, comments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            violation.inspection_id,
            violation.device_number || null,
            violation.bin || null,
            violation.part_code || null,
            violation.part_description || null,
            violation.condition_code || null,
            violation.condition_description || null,
            violation.remedy_code || null,
            violation.remedy_description || null,
            violation.comments || null
        );
    },
    
    getStats: () => {
        const db = getDb();
        return {
            totalInspections: db.prepare('SELECT COUNT(*) as count FROM elv3_inspections').get().count,
            totalViolations: db.prepare('SELECT COUNT(*) as count FROM elv3_violations').get().count,
            recentInspections: db.prepare(`
                SELECT i.*, 
                       (SELECT COUNT(*) FROM elv3_violations v WHERE v.inspection_id = i.id) as violation_count
                FROM elv3_inspections i
                ORDER BY i.uploaded_at DESC
                LIMIT 5
            `).all()
        };
    }
};

module.exports = {
    getDb,
    initialize,
    categories: categoryOps,
    buildings: buildingOps,
    devices: deviceOps,
    violations: violationOps,
    checkHistory: checkHistoryOps,
    settings: settingsOps,
    elv3: elv3Ops
};
