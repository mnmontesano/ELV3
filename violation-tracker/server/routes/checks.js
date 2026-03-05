/**
 * Checks API Routes
 * Manage violation checks and scheduler
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const scheduler = require('../scheduler');
const violationChecker = require('../services/violation-checker');

/**
 * GET /api/checks/status
 * Get current check status and scheduler info
 */
router.get('/status', (req, res) => {
    try {
        const status = violationChecker.getCheckStatus();
        const schedulerStatus = scheduler.getStatus();
        
        res.json({
            ...status,
            scheduler: schedulerStatus
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/checks/run
 * Manually trigger a violation check
 */
router.post('/run', async (req, res) => {
    try {
        const result = await scheduler.triggerCheck();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/checks/run-stream
 * Manually trigger a violation check with SSE progress updates
 */
router.get('/run-stream', async (req, res) => {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    // Send initial connection event
    res.write('event: connected\ndata: {}\n\n');
    
    try {
        const result = await scheduler.triggerCheckWithProgress((progress) => {
            // Send progress update
            res.write(`event: progress\ndata: ${JSON.stringify(progress)}\n\n`);
        });
        
        // Send completion event
        res.write(`event: complete\ndata: ${JSON.stringify(result)}\n\n`);
    } catch (error) {
        // Send error event
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    } finally {
        res.end();
    }
});

/**
 * GET /api/checks/history
 * Get recent check history
 */
router.get('/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const history = db.checkHistory.getRecent(limit);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/checks/interval
 * Update check interval
 */
router.put('/interval', (req, res) => {
    try {
        const { hours } = req.body;
        
        if (!hours || hours < 1 || hours > 24) {
            return res.status(400).json({ 
                error: 'Invalid interval. Must be between 1 and 24 hours.' 
            });
        }
        
        scheduler.updateInterval(hours);
        
        res.json({ 
            message: 'Check interval updated',
            interval_hours: hours
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/checks/last
 * Get last check result
 */
router.get('/last', (req, res) => {
    try {
        const lastCheck = db.checkHistory.getLast();
        
        if (!lastCheck) {
            return res.json({ message: 'No checks have been run yet' });
        }
        
        res.json(lastCheck);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
