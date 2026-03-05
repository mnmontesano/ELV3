/**
 * ELV3 API Routes
 * Handle ELV3 PDF uploads and inspection data
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const elv3Parser = require('../services/elv3-parser');
const dobApi = require('../services/dob-api');

// Configure multer for PDF uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

/**
 * POST /api/elv3/upload
 * Upload and parse an ELV3 PDF
 */
router.post('/upload', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        // Parse the PDF
        const parseResult = await elv3Parser.parseELV3PDF(req.file.buffer);
        
        if (!parseResult.success && parseResult.violations.length === 0) {
            return res.status(400).json({ 
                error: 'Could not parse ELV3 form. No devices or violations found.',
                details: parseResult.error,
                rawText: parseResult.rawText?.substring(0, 500) // First 500 chars for debugging
            });
        }

        // Try to find BIN from device numbers if not in form
        let bin = parseResult.bin;
        let address = parseResult.address;
        let buildingAdded = false;
        
        // If we have devices but no BIN, look up BIN from first device
        if (!bin && parseResult.devices.length > 0) {
            for (const device of parseResult.devices) {
                try {
                    const lookup = await dobApi.lookupBinByDeviceNumber(device.deviceNumber);
                    if (lookup && lookup.bin) {
                        bin = lookup.bin;
                        address = address || lookup.address;
                        break;
                    }
                } catch (e) {
                    console.log(`Could not look up device ${device.deviceNumber}:`, e.message);
                }
            }
        }
        
        // Also try from violations
        if (!bin && parseResult.violations.length > 0) {
            for (const violation of parseResult.violations) {
                try {
                    const lookup = await dobApi.lookupBinByDeviceNumber(violation.deviceNumber);
                    if (lookup && lookup.bin) {
                        bin = lookup.bin;
                        address = address || lookup.address;
                        break;
                    }
                } catch (e) {
                    console.log(`Could not look up device ${violation.deviceNumber}:`, e.message);
                }
            }
        }

        if (!bin) {
            return res.status(400).json({ 
                error: 'Could not determine building BIN. Please ensure the PDF contains valid device numbers.',
                devices: parseResult.devices,
                violations: parseResult.violations
            });
        }

        // Check if building is already tracked, if not add it
        let building = db.buildings.getByBin(bin);
        if (!building) {
            try {
                // Fetch building info and devices from DOB API
                const apiDevices = await dobApi.fetchDevicesByBin(bin);
                
                if (apiDevices.length > 0) {
                    address = address || apiDevices[0].address;
                    
                    // Add building
                    db.buildings.add(bin, address, null, null);
                    building = db.buildings.getByBin(bin);
                    
                    // Add devices
                    for (const device of apiDevices) {
                        db.devices.upsert(device);
                    }
                    
                    buildingAdded = true;
                } else {
                    // Add building with just the info we have
                    db.buildings.add(bin, address, null, null);
                    building = db.buildings.getByBin(bin);
                    buildingAdded = true;
                }
            } catch (e) {
                // Add building anyway with available info
                db.buildings.add(bin, address || 'Unknown', null, null);
                building = db.buildings.getByBin(bin);
                buildingAdded = true;
            }
        }

        // Prepare clean data for database insertion
        const cleanAddress = (address || building?.address || '').toString().trim() || null;
        const cleanInspectionDate = parseResult.inspectionDate ? String(parseResult.inspectionDate) : null;
        const cleanReportType = parseResult.reportType ? String(parseResult.reportType) : null;
        const cleanFilename = req.file.originalname ? String(req.file.originalname) : null;
        
        console.log('Creating inspection record:', { bin, cleanAddress, cleanInspectionDate, cleanReportType, cleanFilename });
        
        // Create inspection record
        const inspectionResult = db.elv3.addInspection({
            bin: bin,
            address: cleanAddress,
            inspectionDate: cleanInspectionDate,
            reportType: cleanReportType,
            filename: cleanFilename,
            rawData: null
        });

        const inspectionId = inspectionResult.lastInsertRowid;
        console.log('Inspection created with ID:', inspectionId);

        // Add violations
        let violationsAdded = 0;
        for (const violation of parseResult.violations) {
            console.log('Adding violation:', violation);
            db.elv3.addViolation({
                inspection_id: inspectionId,
                device_number: String(violation.deviceNumber || ''),
                bin: bin,
                part_code: String(violation.partCode || ''),
                part_description: String(violation.partDescription || ''),
                condition_code: String(violation.conditionCode || ''),
                condition_description: String(violation.conditionDescription || ''),
                remedy_code: String(violation.remedyCode || ''),
                remedy_description: String(violation.remedyDescription || ''),
                comments: violation.comments ? String(violation.comments) : null
            });
            violationsAdded++;
        }

        res.status(201).json({
            success: true,
            message: 'ELV3 form uploaded successfully',
            inspection_id: inspectionId,
            bin,
            address: address || building?.address,
            building_added: buildingAdded,
            devices_found: parseResult.devices.length,
            violations_added: violationsAdded,
            violations: parseResult.violations,
            violationsByDevice: parseResult.violationsByDevice || {},
            devicesWithViolations: parseResult.devicesWithViolations || [],
            satisfactoryDevices: parseResult.satisfactoryDevices || []
        });

    } catch (error) {
        console.error('ELV3 upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/elv3/inspections
 * Get all ELV3 inspections
 */
router.get('/inspections', (req, res) => {
    try {
        const inspections = db.elv3.getAllInspections();
        res.json(inspections);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/elv3/inspections/:id
 * Get a specific inspection with its violations
 */
router.get('/inspections/:id', (req, res) => {
    try {
        const { id } = req.params;
        const inspection = db.elv3.getInspectionById(id);
        
        if (!inspection) {
            return res.status(404).json({ error: 'Inspection not found' });
        }
        
        const violations = db.elv3.getViolationsByInspection(id);
        
        res.json({
            ...inspection,
            violations
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/elv3/inspections/:id
 * Delete an inspection and its violations
 */
router.delete('/inspections/:id', (req, res) => {
    try {
        const { id } = req.params;
        const inspection = db.elv3.getInspectionById(id);
        
        if (!inspection) {
            return res.status(404).json({ error: 'Inspection not found' });
        }
        
        db.elv3.deleteInspection(id);
        
        res.json({ message: 'Inspection deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/elv3/violations
 * Get all ELV3 violations
 */
router.get('/violations', (req, res) => {
    try {
        const { bin, device } = req.query;
        
        let violations;
        if (bin) {
            violations = db.elv3.getViolationsByBin(bin);
        } else if (device) {
            violations = db.elv3.getViolationsByDevice(device);
        } else {
            violations = db.elv3.getAllViolations();
        }
        
        res.json(violations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/elv3/stats
 * Get ELV3 statistics
 */
router.get('/stats', (req, res) => {
    try {
        const stats = db.elv3.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/elv3/codes
 * Get ELV3 code mappings (for reference)
 */
router.get('/codes', (req, res) => {
    res.json({
        parts: elv3Parser.PART_CODES,
        conditions: elv3Parser.CONDITION_CODES,
        remedies: elv3Parser.REMEDY_CODES
    });
});

module.exports = router;
