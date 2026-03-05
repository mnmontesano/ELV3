/**
 * Buildings API Routes
 * Manage monitored buildings
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const violationChecker = require('../services/violation-checker');
const dobApi = require('../services/dob-api');

/**
 * GET /api/buildings
 * Get all monitored buildings with device counts
 */
router.get('/', (req, res) => {
    try {
        const buildings = db.buildings.getAll();
        
        // Add device and violation counts
        const enrichedBuildings = buildings.map(building => {
            const devices = db.devices.getByBin(building.bin);
            const violations = db.violations.getAll({ bin: building.bin });
            const newViolations = violations.filter(v => v.is_new && !v.acknowledged);
            
            return {
                ...building,
                device_count: devices.length,
                violation_count: violations.length,
                new_violation_count: newViolations.length
            };
        });
        
        res.json(enrichedBuildings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/buildings
 * Add a new building to monitor
 */
router.post('/', async (req, res) => {
    try {
        const { bin, nickname, category_id } = req.body;
        
        if (!bin) {
            return res.status(400).json({ error: 'BIN is required' });
        }
        
        // Use the violation checker to add and check the building
        const result = await violationChecker.addAndCheckBuilding(bin, nickname, category_id);
        
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        
        res.status(201).json({
            message: 'Building added successfully',
            building: result.building,
            devices_found: result.devices.length,
            existing_violations: result.violations.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/buildings/:bin/category
 * Update a building's category
 */
router.put('/:bin/category', (req, res) => {
    try {
        const { bin } = req.params;
        const { category_id } = req.body;
        
        const building = db.buildings.getByBin(bin);
        if (!building) {
            return res.status(404).json({ error: 'Building not found' });
        }
        
        // Validate category exists if provided
        if (category_id) {
            const category = db.categories.getById(category_id);
            if (!category) {
                return res.status(400).json({ error: 'Category not found' });
            }
        }
        
        db.buildings.setCategory(bin, category_id);
        
        res.json({
            message: 'Building category updated',
            building: db.buildings.getByBin(bin)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SPECIFIC ROUTES - Must come BEFORE /:bin
// ============================================

/**
 * GET /api/buildings/lookup/:bin
 * Preview a building before adding (no database changes)
 */
router.get('/lookup/:bin', async (req, res) => {
    try {
        const { bin } = req.params;
        
        if (!dobApi.isValidBin(bin)) {
            return res.status(400).json({ error: 'Invalid BIN format' });
        }
        
        // Fetch from DOB API without saving
        const devices = await dobApi.fetchDevicesByBin(bin);
        
        if (devices.length === 0) {
            return res.status(404).json({ error: 'No devices found for this BIN' });
        }
        
        const address = devices[0].address;
        const borough = devices[0].borough;
        
        res.json({
            bin,
            address,
            borough,
            device_count: devices.length,
            devices: devices.map(d => ({
                device_number: d.device_number,
                device_type: d.device_type,
                device_status: d.device_status
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/buildings/device-lookup/:deviceNumber
 * Look up BIN and building info by device number
 */
router.get('/device-lookup/:deviceNumber', async (req, res) => {
    try {
        const { deviceNumber } = req.params;
        
        if (!deviceNumber || deviceNumber.trim().length < 2) {
            return res.status(400).json({ error: 'Device number is required' });
        }
        
        const result = await dobApi.lookupBinByDeviceNumber(deviceNumber);
        
        if (!result) {
            return res.status(404).json({ error: 'Device not found. Please check the device number.' });
        }
        
        // Also get all devices at this building for preview
        const allDevices = await dobApi.fetchDevicesByBin(result.bin);
        
        res.json({
            ...result,
            device_count: allDevices.length,
            all_devices: allDevices.map(d => ({
                device_number: d.device_number,
                device_type: d.device_type,
                device_status: d.device_status
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/buildings/device-search
 * Search for devices by partial device number
 */
router.get('/device-search', async (req, res) => {
    try {
        const { q, limit } = req.query;
        
        if (!q || q.trim().length < 2) {
            return res.status(400).json({ error: 'Search term must be at least 2 characters' });
        }
        
        const results = await dobApi.searchDevicesByNumber(q, parseInt(limit) || 10);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// WILDCARD ROUTES - Must come AFTER specific routes
// ============================================

/**
 * GET /api/buildings/:bin
 * Get a specific building with its devices and violations
 */
router.get('/:bin', (req, res) => {
    try {
        const { bin } = req.params;
        const building = db.buildings.getByBin(bin);
        
        if (!building) {
            return res.status(404).json({ error: 'Building not found' });
        }
        
        const devices = db.devices.getByBin(bin);
        const violations = db.violations.getAll({ bin });
        
        res.json({
            ...building,
            devices,
            violations
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/buildings/:bin
 * Update building info (nickname)
 */
router.put('/:bin', (req, res) => {
    try {
        const { bin } = req.params;
        const { nickname, address } = req.body;
        
        const building = db.buildings.getByBin(bin);
        if (!building) {
            return res.status(404).json({ error: 'Building not found' });
        }
        
        db.buildings.update(bin, address || building.address, nickname);
        
        res.json({
            message: 'Building updated successfully',
            building: db.buildings.getByBin(bin)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/buildings/:bin
 * Remove a building from monitoring
 */
router.delete('/:bin', (req, res) => {
    try {
        const { bin } = req.params;
        
        const building = db.buildings.getByBin(bin);
        if (!building) {
            return res.status(404).json({ error: 'Building not found' });
        }
        
        db.buildings.remove(bin);
        
        res.json({ message: 'Building removed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/buildings/:bin/devices
 * Get devices for a specific building
 */
router.get('/:bin/devices', (req, res) => {
    try {
        const { bin } = req.params;
        const devices = db.devices.getByBin(bin);
        res.json(devices);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/buildings/:bin/refresh
 * Refresh devices for a building from DOB API
 */
router.post('/:bin/refresh', async (req, res) => {
    try {
        const { bin } = req.params;
        
        const building = db.buildings.getByBin(bin);
        if (!building) {
            return res.status(404).json({ error: 'Building not found' });
        }
        
        // Fetch fresh data from API
        const result = await violationChecker.checkBuildingViolations(bin);
        
        res.json({
            message: 'Building refreshed',
            devices_checked: result.devices_checked,
            new_violations: result.new_violations.length,
            errors: result.errors
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
