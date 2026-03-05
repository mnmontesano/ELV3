/**
 * NYC DOB Open Data API Integration
 * Fetches device and violation data from NYC Open Data portal
 */

// API endpoints
const ENDPOINTS = {
    // Elevator/device data
    devices: 'https://data.cityofnewyork.us/resource/e5aq-a4j2.json',
    // DOB Safety Violations - same as index.html uses (855j-jady)
    // This is the primary violations endpoint used by the existing site
    dobSafetyViolations: 'https://data.cityofnewyork.us/resource/855j-jady.json',
    // DOB violations (general building violations) - backup
    dobViolations: 'https://data.cityofnewyork.us/resource/3h2n-5cm9.json',
    // ECB violations (Environmental Control Board)
    ecbViolations: 'https://data.cityofnewyork.us/resource/6bgk-3dad.json'
};

/**
 * Fetch devices for a specific BIN (Building Identification Number)
 */
async function fetchDevicesByBin(bin) {
    try {
        const url = `${ENDPOINTS.devices}?bin=${encodeURIComponent(bin)}&$limit=1000`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`DOB API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Transform the data to our format
        return data.map(device => ({
            device_number: device.device_number,
            bin: device.bin,
            device_type: device.device_type,
            device_status: device.device_status,
            address: `${device.house_number || ''} ${device.street_name || ''}`.trim(),
            borough: device.borough,
            // Additional fields that might be useful
            cat1_report_year: device.cat1_report_year,
            cat5_report_year: device.cat5_report_year,
            periodic_report_year: device.periodic_report_year,
            periodic_latest_inspection: device.periodic_latest_inspection
        }));
    } catch (error) {
        console.error(`Error fetching devices for BIN ${bin}:`, error);
        throw error;
    }
}

/**
 * Fetch a single device by device number
 */
async function fetchDeviceByNumber(deviceNumber) {
    try {
        const url = `${ENDPOINTS.devices}?device_number=${encodeURIComponent(deviceNumber)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`DOB API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data[0] || null;
    } catch (error) {
        console.error(`Error fetching device ${deviceNumber}:`, error);
        throw error;
    }
}

/**
 * Look up BIN and building info by device number
 * Uses the same approach as index.html - direct device_number query
 * @param {string} deviceNumber - The device number to search for
 * @returns {Object} - Building info including BIN, address, and device details
 */
async function lookupBinByDeviceNumber(deviceNumber) {
    try {
        // Clean up the device number - remove spaces
        const cleanDeviceNumber = deviceNumber.trim();
        
        // Use the same API call pattern as index.html:
        // https://data.cityofnewyork.us/resource/e5aq-a4j2.json?device_number=${deviceNumber}
        const url = `${ENDPOINTS.devices}?device_number=${encodeURIComponent(cleanDeviceNumber)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`DOB API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Check if we got results - same pattern as index.html
        if (data && data.length > 0) {
            const device = data[0];
            return {
                bin: device.bin || null,
                device_number: device.device_number,
                device_type: device.device_type,
                device_status: device.device_status,
                address: `${device.house_number || ''} ${device.street_name || ''}`.trim(),
                borough: device.borough,
                // Include additional fields that might be useful
                house_number: device.house_number,
                street_name: device.street_name,
                zip_code: device.zip_code,
                block: device.block,
                lot: device.lot
            };
        }
        
        return null;
    } catch (error) {
        console.error(`Error looking up BIN for device ${deviceNumber}:`, error);
        throw error;
    }
}

/**
 * Search devices by partial device number
 * @param {string} searchTerm - Partial device number to search for
 * @param {number} limit - Maximum results to return
 * @returns {Array} - Matching devices
 */
async function searchDevicesByNumber(searchTerm, limit = 10) {
    try {
        const cleanTerm = searchTerm.trim().toUpperCase();
        
        // Use LIKE query for partial matching
        const url = `${ENDPOINTS.devices}?$where=upper(device_number) like '%25${encodeURIComponent(cleanTerm)}%25'&$limit=${limit}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`DOB API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        return data.map(device => ({
            bin: device.bin,
            device_number: device.device_number,
            device_type: device.device_type,
            device_status: device.device_status,
            address: `${device.house_number || ''} ${device.street_name || ''}`.trim(),
            borough: device.borough
        }));
    } catch (error) {
        console.error(`Error searching devices for ${searchTerm}:`, error);
        throw error;
    }
}

/**
 * Check if a violation is active
 * Uses the same logic as index.html (lines 2728-2730, 5067-5070):
 * v.violation_status?.toUpperCase() === 'ACTIVE' || v.violation_status?.toUpperCase() === 'OPEN'
 */
function isActiveViolation(violation) {
    const status = (violation.violation_status || violation.current_status || '').toUpperCase();
    return status === 'ACTIVE' || status === 'OPEN';
}

/**
 * Fetch DOB violations for a specific BIN
 * These are general building violations
 * Only returns ACTIVE or OPEN violations (same filter as index.html)
 */
async function fetchDobViolationsByBin(bin) {
    try {
        const url = `${ENDPOINTS.dobViolations}?bin=${encodeURIComponent(bin)}&$limit=5000`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`DOB Violations API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Filter for elevator-related violations and transform
        // Only include ACTIVE or OPEN violations (same as index.html)
        return data
            .filter(v => {
                // First check if it's an active violation (same logic as index.html)
                if (!isActiveViolation(v)) {
                    return false;
                }
                
                // Then filter for elevator-related violations
                const description = (v.description || '').toLowerCase();
                const violationType = (v.violation_type || '').toLowerCase();
                return description.includes('elevator') || 
                       description.includes('escalator') ||
                       description.includes('device') ||
                       violationType.includes('elev') ||
                       violationType.includes('ll') || // Local Law violations often relate to elevators
                       v.device_number; // If it has a device number, it's device-related
            })
            .map(v => ({
                violation_number: v.isn_dob_bis_viol || v.violation_number || `DOB-${v.bin}-${Date.now()}`,
                device_number: v.device_number || 'BUILDING',
                bin: v.bin,
                violation_type: v.violation_type || 'DOB',
                issue_date: v.issue_date,
                description: v.description || v.violation_description,
                status: v.violation_status || v.current_status,
                severity: v.violation_category || v.severity,
                disposition: v.disposition_comments,
                disposition_date: v.disposition_date
            }));
    } catch (error) {
        console.error(`Error fetching DOB violations for BIN ${bin}:`, error);
        // Return empty array instead of throwing - DOB violations might not always be available
        return [];
    }
}

/**
 * Check if an ECB violation is active
 * Only return true for explicitly ACTIVE or OPEN status
 * Same strict filtering as DOB Safety Violations
 */
function isActiveEcbViolation(violation) {
    const status = (violation.ecb_violation_status || violation.hearing_status || '').toUpperCase();
    // Only include explicitly ACTIVE or OPEN - same logic as index.html
    return status === 'ACTIVE' || status === 'OPEN';
}

/**
 * Fetch ECB violations for a specific BIN
 * These are Environmental Control Board violations
 * Only returns ACTIVE/OPEN violations for elevator-related devices
 */
async function fetchEcbViolationsByBin(bin) {
    try {
        const url = `${ENDPOINTS.ecbViolations}?bin=${encodeURIComponent(bin)}&$limit=5000`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`ECB Violations API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Filter for conveyance device ECB violations that are ACTIVE or OPEN only
        return data
            .filter(v => {
                // First check if it's an active violation (ACTIVE or OPEN only)
                if (!isActiveEcbViolation(v)) {
                    return false;
                }
                
                // Check if it has a conveyance device number
                if (v.device_number && isConveyanceDeviceNumber(v.device_number)) {
                    return true;
                }
                
                // Check description for conveyance device terms
                const description = (v.violation_description || '').toLowerCase();
                const infCode = (v.infraction_code1 || '').toLowerCase();
                return description.includes('elevator') || 
                       description.includes('escalator') ||
                       description.includes('dumbwaiter') ||
                       description.includes('wheelchair lift') ||
                       description.includes('moving walk') ||
                       infCode.includes('elev') ||
                       infCode.includes('escal');
            })
            .map(v => ({
                violation_number: v.ecb_violation_number || `ECB-${v.bin}-${Date.now()}`,
                device_number: v.device_number || 'BUILDING',
                bin: v.bin,
                violation_type: 'ECB',
                issue_date: v.issue_date,
                description: v.violation_description,
                status: v.ecb_violation_status || v.hearing_status,
                severity: v.severity || v.violation_type,
                disposition: v.hearing_status,
                disposition_date: v.hearing_date
            }));
    } catch (error) {
        console.error(`Error fetching ECB violations for BIN ${bin}:`, error);
        // Return empty array instead of throwing
        return [];
    }
}

/**
 * Check if a device type is a conveyance device we want to track
 * Based on device_search.html and index.html device types:
 * - ELEVATOR
 * - ESCALATOR
 * - DUMWAITER (dumbwaiter)
 * - MOVING WALKWAY
 * - WHEELCHAIR (lifts)
 * - HYDRAULIC
 */
function isConveyanceDevice(deviceType) {
    if (!deviceType) return false;
    const type = deviceType.toUpperCase();
    return type.includes('ELEVATOR') || 
           type.includes('ESCALATOR') ||
           type.includes('DUMBWAITER') ||
           type.includes('DUMWAITER') ||  // DOB sometimes spells it without the 'B'
           type.includes('MOVING WALK') ||
           type.includes('WHEELCHAIR') ||
           type.includes('HYDRAULIC');
}

/**
 * Check if a device number is for a conveyance device
 * Based on NYC DOB device numbering:
 * - P = Passenger elevator
 * - F = Freight elevator
 * - H = Hydraulic elevator
 * - T = Traction elevator
 * - S = Service elevator
 * - E = Escalator
 * - D = Dumbwaiter
 * - W = Wheelchair lift / Moving walkway
 * - M = Manlift
 * Device numbers format: borough digit + type letter + number
 */
function isConveyanceDeviceNumber(deviceNumber) {
    if (!deviceNumber) return false;
    // Conveyance device numbers: digit + letter + digits
    // P/F/H/T/S = Elevators, E = Escalator, D = Dumbwaiter, W = Wheelchair/Walkway, M = Manlift
    return /^\d+[PFHTSEDWM]\d+$/i.test(deviceNumber);
}

/**
 * Fetch violations from DOB Safety Violations API (855j-jady)
 * This is the same API and filtering used by index.html (line 12132)
 * Only returns ACTIVE or OPEN violations for ELEVATOR devices
 */
async function fetchSafetyViolationsByBin(bin) {
    try {
        // Same API call as index.html fetchViolationsForBin function (line 12132):
        // https://data.cityofnewyork.us/resource/855j-jady.json?$where=bin='${bin}'
        const url = `${ENDPOINTS.dobSafetyViolations}?$where=bin='${bin}'&$limit=5000`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`DOB Safety Violations API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Filter for:
        // 1. Active violations only (same logic as index.html lines 2728-2730, 5067-5070)
        // 2. Conveyance devices only (Elevator, Escalator, Dumbwaiter, Moving Walkway, Wheelchair Lift, Hydraulic)
        const activeConveyanceViolations = data.filter(v => {
            // First check status - must be ACTIVE or OPEN
            const status = (v.violation_status || '').toUpperCase();
            if (status !== 'ACTIVE' && status !== 'OPEN') {
                return false;
            }
            
            // Then check if it's a conveyance device
            // Must have either: conveyance device type OR a valid conveyance device number
            const deviceType = v.device_type || '';
            const deviceNumber = v.device_number || '';
            
            return isConveyanceDevice(deviceType) || isConveyanceDeviceNumber(deviceNumber);
        });
        
        // Transform to our format
        return activeConveyanceViolations.map(v => ({
            violation_number: v.violation_number || `SAF-${bin}-${Date.now()}`,
            device_number: v.device_number || 'BUILDING',
            bin: v.bin,
            violation_type: v.violation_type || 'DOB Safety',
            issue_date: v.violation_issue_date || v.issue_date,
            description: v.violation_description || v.violation_remarks || v.description,
            status: v.violation_status,
            severity: v.violation_category,
            disposition: v.disposition_comments,
            disposition_date: v.disposition_date
        }));
    } catch (error) {
        console.error(`Error fetching safety violations for BIN ${bin}:`, error);
        return [];
    }
}

/**
 * Fetch all violations (DOB Safety + ECB) for a specific BIN
 * Only returns ACTIVE/OPEN violations (same as index.html)
 */
async function fetchAllViolationsByBin(bin) {
    try {
        // Fetch from the primary Safety Violations API (same as index.html)
        // and ECB violations in parallel
        const [safetyViolations, ecbViolations] = await Promise.all([
            fetchSafetyViolationsByBin(bin),
            fetchEcbViolationsByBin(bin)
        ]);
        
        // Combine violations
        const allViolations = [...safetyViolations, ...ecbViolations];
        
        // Sort by issue date (newest first)
        allViolations.sort((a, b) => {
            const dateA = new Date(a.issue_date || 0);
            const dateB = new Date(b.issue_date || 0);
            return dateB - dateA;
        });
        
        return allViolations;
    } catch (error) {
        console.error(`Error fetching all violations for BIN ${bin}:`, error);
        throw error;
    }
}

/**
 * Get building info from devices API (address, etc.)
 */
async function getBuildingInfo(bin) {
    try {
        const devices = await fetchDevicesByBin(bin);
        if (devices.length > 0) {
            const device = devices[0];
            return {
                bin: device.bin,
                address: device.address,
                borough: device.borough
            };
        }
        return null;
    } catch (error) {
        console.error(`Error getting building info for BIN ${bin}:`, error);
        return null;
    }
}

/**
 * Validate a BIN number format
 */
function isValidBin(bin) {
    // BIN is typically a 7-digit number
    return /^\d{7}$/.test(bin);
}

module.exports = {
    fetchDevicesByBin,
    fetchDeviceByNumber,
    lookupBinByDeviceNumber,
    searchDevicesByNumber,
    fetchSafetyViolationsByBin,
    fetchDobViolationsByBin,
    fetchEcbViolationsByBin,
    fetchAllViolationsByBin,
    getBuildingInfo,
    isValidBin,
    isActiveViolation,
    ENDPOINTS
};
