/**
 * Cron Scheduler for Violation Checks
 * Runs periodic checks on monitored buildings
 */

const cron = require('node-cron');
const db = require('./db');
const violationChecker = require('./services/violation-checker');

let scheduledTask = null;

/**
 * Start the violation check scheduler
 */
function startScheduler() {
    // Get check interval from settings (default 6 hours)
    const intervalHours = parseInt(db.settings.get('check_interval')) || 6;
    
    // Create cron expression for the interval
    // Runs at minute 0 of every N hours
    const cronExpression = `0 */${intervalHours} * * *`;
    
    console.log(`Starting violation check scheduler (every ${intervalHours} hours)`);
    console.log(`Cron expression: ${cronExpression}`);
    
    // Stop existing task if any
    if (scheduledTask) {
        scheduledTask.stop();
    }
    
    // Schedule the task
    scheduledTask = cron.schedule(cronExpression, async () => {
        console.log(`\n[${new Date().toISOString()}] Running scheduled violation check...`);
        
        try {
            const result = await violationChecker.checkAllBuildings();
            
            if (result.new_violations_found > 0) {
                console.log(`Found ${result.new_violations_found} new violation(s)!`);
                // Future: Add email/notification here
            } else {
                console.log('No new violations found.');
            }
            
            if (result.errors.length > 0) {
                console.log(`Completed with ${result.errors.length} error(s)`);
            }
        } catch (error) {
            console.error('Scheduled check failed:', error);
        }
    }, {
        scheduled: true,
        timezone: "America/New_York" // NYC timezone
    });
    
    // Run an initial check after a short delay (give server time to fully start)
    setTimeout(async () => {
        const buildings = db.buildings.getAll();
        if (buildings.length > 0) {
            console.log(`\nRunning initial violation check for ${buildings.length} building(s)...`);
            try {
                await violationChecker.checkAllBuildings();
            } catch (error) {
                console.error('Initial check failed:', error);
            }
        } else {
            console.log('\nNo buildings to monitor yet. Add buildings to start tracking violations.');
        }
    }, 5000);
    
    return scheduledTask;
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        console.log('Violation check scheduler stopped');
    }
}

/**
 * Update the check interval and restart scheduler
 */
function updateInterval(hours) {
    if (hours < 1 || hours > 24) {
        throw new Error('Interval must be between 1 and 24 hours');
    }
    
    db.settings.set('check_interval', hours.toString());
    console.log(`Check interval updated to ${hours} hours`);
    
    // Restart scheduler with new interval
    startScheduler();
}

/**
 * Get scheduler status
 */
function getStatus() {
    const lastCheck = db.settings.get('last_check');
    const intervalHours = parseInt(db.settings.get('check_interval')) || 6;
    
    // Calculate the actual next cron run time based on fixed schedule
    // Cron runs at minute 0 of every N hours (0, N, 2N, etc.)
    const now = new Date();
    const currentHour = now.getHours();
    
    // Find the next hour that's divisible by the interval
    let nextHour = Math.ceil((currentHour + 1) / intervalHours) * intervalHours;
    
    // If we're past the last slot of the day, wrap to next day
    let nextCheck = new Date(now);
    if (nextHour >= 24) {
        nextCheck.setDate(nextCheck.getDate() + 1);
        nextHour = 0;
    }
    nextCheck.setHours(nextHour, 0, 0, 0);
    
    return {
        running: scheduledTask !== null,
        interval_hours: intervalHours,
        last_check: lastCheck,
        next_check: nextCheck.toISOString(),
        schedule_type: 'fixed' // Indicates this runs on fixed clock times
    };
}

/**
 * Manually trigger a check
 */
async function triggerCheck() {
    console.log(`\n[${new Date().toISOString()}] Manual violation check triggered...`);
    return await violationChecker.checkAllBuildings();
}

/**
 * Manually trigger a check with progress callback
 * @param {Function} onProgress - Callback function called with progress updates
 */
async function triggerCheckWithProgress(onProgress) {
    console.log(`\n[${new Date().toISOString()}] Manual violation check triggered (with progress)...`);
    return await violationChecker.checkAllBuildingsWithProgress(onProgress);
}

module.exports = {
    startScheduler,
    stopScheduler,
    updateInterval,
    getStatus,
    triggerCheck,
    triggerCheckWithProgress
};
