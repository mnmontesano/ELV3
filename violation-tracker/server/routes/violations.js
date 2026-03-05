/**
 * Violations API Routes
 * Query and manage violations
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/violations
 * Get all violations with optional filters
 * Query params: is_new, acknowledged, bin, device_number, limit
 */
router.get('/', (req, res) => {
    try {
        const filters = {};
        
        if (req.query.is_new !== undefined) {
            filters.is_new = req.query.is_new === 'true';
        }
        
        if (req.query.acknowledged !== undefined) {
            filters.acknowledged = req.query.acknowledged === 'true';
        }
        
        if (req.query.bin) {
            filters.bin = req.query.bin;
        }
        
        if (req.query.device_number) {
            filters.device_number = req.query.device_number;
        }
        
        if (req.query.limit) {
            filters.limit = parseInt(req.query.limit);
        }
        
        const violations = db.violations.getAll(filters);
        res.json(violations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/violations/new
 * Get all new/unacknowledged violations
 */
router.get('/new', (req, res) => {
    try {
        const violations = db.violations.getNew();
        res.json(violations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/violations/stats
 * Get violation statistics
 */
router.get('/stats', (req, res) => {
    try {
        const stats = db.violations.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/violations/:id
 * Get a specific violation
 */
router.get('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const violations = db.violations.getAll({ limit: 1 });
        const violation = violations.find(v => v.id === parseInt(id));
        
        if (!violation) {
            return res.status(404).json({ error: 'Violation not found' });
        }
        
        res.json(violation);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/violations/:id/acknowledge
 * Acknowledge a violation
 */
router.post('/:id/acknowledge', (req, res) => {
    try {
        const { id } = req.params;
        const result = db.violations.acknowledge(parseInt(id));
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Violation not found' });
        }
        
        res.json({ message: 'Violation acknowledged' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/violations/acknowledge-all
 * Acknowledge all violations
 */
router.post('/acknowledge-all', (req, res) => {
    try {
        const result = db.violations.acknowledgeAll();
        res.json({ 
            message: 'All violations acknowledged',
            count: result.changes
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/violations/device/:deviceNumber
 * Get violations for a specific device
 */
router.get('/device/:deviceNumber', (req, res) => {
    try {
        const { deviceNumber } = req.params;
        const violations = db.violations.getByDevice(deviceNumber);
        res.json(violations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
