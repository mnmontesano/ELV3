/**
 * Violation Checker Service
 * Compares current violations from DOB API against stored data
 * to detect new violations
 */

const db = require('../db');
const dobApi = require('./dob-api');

/**
 * Check a single building for new violations
 * @param {string} bin - Building Identification Number
 * @returns {Object} - Results of the check
 */
async function checkBuildingViolations(bin) {
    const result = {
        bin,
        devices_checked: 0,
        new_violations: [],
        errors: []
    };

    try {
        // Fetch current devices from DOB API
        const apiDevices = await dobApi.fetchDevicesByBin(bin);
        result.devices_checked = apiDevices.length;

        // Update devices in our database
        for (const device of apiDevices) {
            db.devices.upsert(device);
        }

        // Fetch current violations from DOB API
        const apiViolations = await dobApi.fetchAllViolationsByBin(bin);

        // Check each violation against our database
        for (const violation of apiViolations) {
            try {
                // Check if we've already seen this violation
                const exists = db.violations.exists(violation.violation_number, violation.device_number);
                
                if (!exists) {
                    // This is a new violation!
                    const addResult = db.violations.add(violation);
                    
                    if (addResult.changes > 0) {
                        result.new_violations.push({
                            ...violation,
                            id: addResult.lastInsertRowid
                        });
                    }
                }
            } catch (err) {
                result.errors.push(`Error processing violation ${violation.violation_number}: ${err.message}`);
            }
        }

    } catch (error) {
        result.errors.push(`Error checking building ${bin}: ${error.message}`);
    }

    return result;
}

/**
 * Check all monitored buildings for new violations
 * @returns {Object} - Summary of the check
 */
async function checkAllBuildings() {
    const summary = {
        started_at: new Date().toISOString(),
        buildings_checked: 0,
        devices_checked: 0,
        new_violations_found: 0,
        all_new_violations: [],
        errors: [],
        status: 'success'
    };

    try {
        // Get all monitored buildings
        const buildings = db.buildings.getAll();
        summary.buildings_checked = buildings.length;

        if (buildings.length === 0) {
            summary.status = 'no_buildings';
            return summary;
        }

        console.log(`Starting violation check for ${buildings.length} building(s)...`);

        // Check each building (with a small delay between to avoid rate limiting)
        for (const building of buildings) {
            try {
                const result = await checkBuildingViolations(building.bin);
                
                summary.devices_checked += result.devices_checked;
                summary.new_violations_found += result.new_violations.length;
                summary.all_new_violations.push(...result.new_violations);
                summary.errors.push(...result.errors);

                if (result.new_violations.length > 0) {
                    console.log(`Found ${result.new_violations.length} new violation(s) for BIN ${building.bin}`);
                }

                // Small delay to avoid hammering the API
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (err) {
                summary.errors.push(`Failed to check building ${building.bin}: ${err.message}`);
            }
        }

        // Record this check in history
        db.checkHistory.add({
            buildings_checked: summary.buildings_checked,
            devices_checked: summary.devices_checked,
            new_violations_found: summary.new_violations_found,
            status: summary.errors.length > 0 ? 'completed_with_errors' : 'success',
            error_message: summary.errors.length > 0 ? summary.errors.join('; ') : null
        });

        // Update last check time
        db.settings.set('last_check', new Date().toISOString());

        summary.completed_at = new Date().toISOString();
        
        if (summary.errors.length > 0) {
            summary.status = 'completed_with_errors';
        }

        console.log(`Violation check complete. Found ${summary.new_violations_found} new violation(s).`);

    } catch (error) {
        summary.status = 'error';
        summary.errors.push(`Critical error: ${error.message}`);
        
        db.checkHistory.add({
            buildings_checked: summary.buildings_checked,
            devices_checked: summary.devices_checked,
            new_violations_found: 0,
            status: 'error',
            error_message: error.message
        });
    }

    return summary;
}

/**
 * Add a new building and immediately check for violations
 * @param {string} bin - Building Identification Number
 * @param {string} nickname - Optional nickname for the building
 * @param {number} categoryId - Optional category ID to assign the building to
 * @returns {Object} - Building info and initial violations
 */
async function addAndCheckBuilding(bin, nickname = null, categoryId = null) {
    const result = {
        success: false,
        building: null,
        devices: [],
        violations: [],
        error: null
    };

    try {
        // Validate BIN
        if (!dobApi.isValidBin(bin)) {
            result.error = 'Invalid BIN format. BIN should be a 7-digit number.';
            return result;
        }

        // Check if building already exists
        const existingBuilding = db.buildings.getByBin(bin);
        if (existingBuilding) {
            result.error = 'Building is already being monitored.';
            result.building = existingBuilding;
            return result;
        }

        // Fetch building info and devices from DOB API
        const apiDevices = await dobApi.fetchDevicesByBin(bin);
        
        if (apiDevices.length === 0) {
            result.error = 'No devices found for this BIN. Please verify the BIN is correct.';
            return result;
        }

        // Get address from first device
        const address = apiDevices[0].address;

        // Add building to database with optional category
        db.buildings.add(bin, address, nickname, categoryId);
        result.building = db.buildings.getByBin(bin);

        // Add devices to database
        for (const device of apiDevices) {
            db.devices.upsert(device);
        }
        result.devices = apiDevices;

        // Fetch and store initial violations
        const violations = await dobApi.fetchAllViolationsByBin(bin);
        for (const violation of violations) {
            db.violations.add(violation);
        }
        result.violations = violations;

        result.success = true;

    } catch (error) {
        result.error = `Failed to add building: ${error.message}`;
    }

    return result;
}

/**
 * Get check status and statistics
 */
function getCheckStatus() {
    const lastCheck = db.settings.get('last_check');
    const checkInterval = db.settings.get('check_interval');
    const recentHistory = db.checkHistory.getRecent(5);
    const stats = db.violations.getStats();

    return {
        last_check: lastCheck,
        check_interval_hours: parseInt(checkInterval) || 6,
        recent_checks: recentHistory,
        violation_stats: stats
    };
}

/**
 * Check all monitored buildings for new violations with progress callback
 * @param {Function} onProgress - Callback function called with progress updates
 * @returns {Object} - Summary of the check
 */
async function checkAllBuildingsWithProgress(onProgress) {
    const summary = {
        started_at: new Date().toISOString(),
        buildings_checked: 0,
        devices_checked: 0,
        new_violations_found: 0,
        all_new_violations: [],
        errors: [],
        status: 'success'
    };

    try {
        // Get all monitored buildings
        const buildings = db.buildings.getAll();
        const totalBuildings = buildings.length;
        summary.buildings_checked = totalBuildings;

        // Time tracking for estimates
        const startTime = Date.now();
        const buildingTimes = [];

        // Send initial progress
        if (onProgress) {
            onProgress({
                current: 0,
                total: totalBuildings,
                percentage: 0,
                currentBuilding: null,
                status: 'starting',
                estimatedSecondsRemaining: null,
                elapsedSeconds: 0
            });
        }

        if (totalBuildings === 0) {
            summary.status = 'no_buildings';
            return summary;
        }

        console.log(`Starting violation check for ${totalBuildings} building(s)...`);

        // Check each building (with a small delay between to avoid rate limiting)
        for (let i = 0; i < buildings.length; i++) {
            const building = buildings[i];
            const buildingStartTime = Date.now();
            
            // Calculate time estimate based on average time per building
            let estimatedSecondsRemaining = null;
            if (buildingTimes.length > 0) {
                const avgTimePerBuilding = buildingTimes.reduce((a, b) => a + b, 0) / buildingTimes.length;
                const remainingBuildings = totalBuildings - i;
                estimatedSecondsRemaining = Math.round((avgTimePerBuilding * remainingBuildings) / 1000);
            } else if (i === 0) {
                // Initial estimate: ~2 seconds per building (rough estimate)
                estimatedSecondsRemaining = Math.round(totalBuildings * 2);
            }
            
            const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
            
            // Send progress update before checking
            if (onProgress) {
                onProgress({
                    current: i,
                    total: totalBuildings,
                    percentage: Math.round((i / totalBuildings) * 100),
                    currentBuilding: {
                        bin: building.bin,
                        nickname: building.nickname,
                        address: building.address
                    },
                    status: 'checking',
                    estimatedSecondsRemaining,
                    elapsedSeconds
                });
            }

            try {
                const result = await checkBuildingViolations(building.bin);
                
                summary.devices_checked += result.devices_checked;
                summary.new_violations_found += result.new_violations.length;
                summary.all_new_violations.push(...result.new_violations);
                summary.errors.push(...result.errors);

                if (result.new_violations.length > 0) {
                    console.log(`Found ${result.new_violations.length} new violation(s) for BIN ${building.bin}`);
                }

                // Small delay to avoid hammering the API
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (err) {
                summary.errors.push(`Failed to check building ${building.bin}: ${err.message}`);
            }
            
            // Track how long this building took
            buildingTimes.push(Date.now() - buildingStartTime);
        }

        const totalElapsedSeconds = Math.round((Date.now() - startTime) / 1000);

        // Send final progress update
        if (onProgress) {
            onProgress({
                current: totalBuildings,
                total: totalBuildings,
                percentage: 100,
                currentBuilding: null,
                status: 'completing',
                estimatedSecondsRemaining: 0,
                elapsedSeconds: totalElapsedSeconds
            });
        }

        // Record this check in history
        db.checkHistory.add({
            buildings_checked: summary.buildings_checked,
            devices_checked: summary.devices_checked,
            new_violations_found: summary.new_violations_found,
            status: summary.errors.length > 0 ? 'completed_with_errors' : 'success',
            error_message: summary.errors.length > 0 ? summary.errors.join('; ') : null
        });

        // Update last check time
        db.settings.set('last_check', new Date().toISOString());

        summary.completed_at = new Date().toISOString();
        
        if (summary.errors.length > 0) {
            summary.status = 'completed_with_errors';
        }

        console.log(`Violation check complete. Found ${summary.new_violations_found} new violation(s).`);

    } catch (error) {
        summary.status = 'error';
        summary.errors.push(`Critical error: ${error.message}`);
        
        db.checkHistory.add({
            buildings_checked: summary.buildings_checked,
            devices_checked: summary.devices_checked,
            new_violations_found: 0,
            status: 'error',
            error_message: error.message
        });
    }

    return summary;
}

module.exports = {
    checkBuildingViolations,
    checkAllBuildings,
    checkAllBuildingsWithProgress,
    addAndCheckBuilding,
    getCheckStatus
};
