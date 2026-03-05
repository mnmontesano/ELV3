/**
 * ELV3 PDF Parser Service
 * Extracts device numbers, violations, and building info from ELV3 inspection forms
 */

const { PDFDocument } = require('pdf-lib');

// ELV3 Code Mappings (from index.html)
const PART_CODES = {
    "01": "Emergency Stop Switch",
    "02": "Alarm System",
    "03": "Car Enclosure",
    "04": "Side Emergency Exit",
    "05": "Car Door/Gate",
    "06": "Car Door/Gate Contact",
    "07": "Door Reopening Device",
    "08": "Car Floor to Landing Sill",
    "09": "Car Floor",
    "10": "Car Door Gibs",
    "11": "Car Button Station",
    "12": "Car Lighting",
    "13": "Emergency Lighting",
    "14": "Car Mirror",
    "15": "Certificate Frame",
    "16": "Hoistway Doors",
    "17": "Hoistway Door Gibs",
    "18": "Hoistway Door Reinforcements",
    "19": "Hoistway Door Safety Retainer",
    "20": "Vision Panel",
    "21": "Interlocks",
    "22": "Parking Device",
    "23": "Hall Button Station",
    "24": "Indicators",
    "25": "Door Safety Retainer",
    "26": "Top Emergency Exit Cover",
    "27": "Governor Release Carrier",
    "28": "Door Hangers & Connectors",
    "29": "Door Operator",
    "30": "Normal Limits",
    "31": "Final Limits",
    "32": "Guide Shoes / Roller Guides",
    "33": "Counterweight",
    "34": "Hoistway",
    "35": "Electrical Wiring",
    "36": "Pipes and Ducts",
    "37": "Overhead & Deflector Sheave",
    "38": "Traveling Cable & Junction",
    "39": "Car Top",
    "40": "Machine Room",
    "41": "Machine Room Door",
    "42": "Controller—Selector",
    "43": "Reverse Phase Relay",
    "44": "Traction Sheave",
    "45": "Governor",
    "46": "Governor Switch",
    "47": "Drum",
    "48": "Pump Unit",
    "49": "Drum Machine Limit SW",
    "50": "Generator",
    "51": "Slack Rope Switch",
    "52": "Hoist Cables",
    "53": "Governor Ropes",
    "54": "Car Counterweight Rope",
    "55": "Drum Counterweight Rope",
    "56": "Hoist Machine",
    "57": "Hoist Motor",
    "58": "Worm / Gear / Bearings",
    "59": "Machine Brake",
    "60": "Lighting Machine Space",
    "61": "Machine Disconnect SW",
    "62": "Commutator",
    "63": "Motor Brushes",
    "64": "NYC Device #",
    "65": "Unintended Car Movement",
    "66": "Emergency Brake/Rope Gripper",
    "67": "Communication",
    "68": "Maintenance Log",
    "69": "Code Data Plate",
    "70": "Pit",
    "71": "Pit Light",
    "72": "Pit Stop Switch",
    "73": "Car Guide-Rails & Brackets",
    "74": "Cwt Guide-Rails & Brackets",
    "75": "Buffers",
    "76": "Car Safety & Tail Rope",
    "77": "Underside Platform",
    "78": "Tension Weight",
    "79": "Comp / Chains / Ropes / Switch",
    "80": "Counterweight Runby",
    "81": "Counterweight Runby Signage",
    "82": "Plunger Gripper",
    "83": "Fire Shutters",
    "84": "Skirt Switch",
    "85": "Skirt Deflection Device",
    "86": "Comb Plate / Comb Plate Teeth",
    "87": "Landing Plate / Impact Switches",
    "88": "Handrails / Handrail Safeties",
    "89": "Step / Thread",
    "90": "Key Switch",
    "91": "Emergency Stop Button",
    "92": "Decking and Balustrades",
    "93": "Ceiling Guards",
    "94": "Deck Barricades",
    "95": "Internal Safeties",
    "96": "Safety Signage",
    "97": "Entire Device",
    "98": "Current Five Year Tag",
    "99": "Current One Year Tag",
    "100": "Miscellaneous"
};

const CONDITION_CODES = {
    "A": "Altered",
    "B": "Insufficient",
    "C": "Padlocked",
    "D": "Unsecured",
    "E": "Rubbing",
    "F": "Lost Motion",
    "G": "Improper Fuses",
    "H": "Worn",
    "I": "Damaged",
    "J": "Misaligned",
    "K": "Rusted",
    "L": "Defective",
    "M": "Missing",
    "N": "By-passed",
    "O": "Dirty",
    "P": "No Means of Access",
    "Q": "Unguarded",
    "R": "Illegal",
    "S": "Not Fire Retardant",
    "T": "Unlabeled",
    "U": "Device Not Tagged",
    "V": "Not Level",
    "W": "Unlocked",
    "X": "Inoperative",
    "Y": "Oil Leak",
    "Z": "Water Leak",
    "AA": "Carbon Buildup",
    "BB": "Expired Tag"
};

const REMEDY_CODES = {
    "01": "Adjust",
    "02": "Clean",
    "03": "Install Guards",
    "04": "Patch",
    "05": "Perform & File Test",
    "06": "Properly Secure",
    "07": "Provide",
    "08": "Regroove",
    "09": "Remove",
    "10": "Repair",
    "11": "Replace",
    "12": "Reshackle",
    "13": "Seal",
    "14": "Shorten",
    "15": "Tag Device",
    "16": "Provide Means of Access",
    "17": "Re-inspection Required"
};

/**
 * Get the location suffix for a part code based on its numeric range
 * @param {string} partCode - The 2-digit part code
 * @returns {string} - Location suffix like "(Machine Room)" or empty string
 */
function getPartLocation(partCode) {
    const intValue = parseInt(partCode, 10);
    
    if (intValue >= 1 && intValue <= 15) {
        return " (Inside Car)";
    }
    if (intValue >= 16 && intValue <= 25) {
        return " (Outside Hoistway)";
    }
    if (intValue >= 26 && intValue <= 39) {
        return " (Top of Car)";
    }
    if (intValue >= 40 && intValue <= 69) {
        return " (Machine Room)";
    }
    if (intValue >= 70 && intValue <= 82) {
        return " (Pit)";
    }
    if (intValue >= 83 && intValue <= 96) {
        return " (Escalator/Moving Walk)";
    }
    if (intValue >= 97 && intValue <= 100) {
        return " (All Types)";
    }
    
    return "";
}

/**
 * Get full part description including location
 * @param {string} partCode - The 2-digit part code
 * @returns {string} - Full description like "Machine Brake (Machine Room)"
 */
function getPartDescriptionWithLocation(partCode) {
    const baseName = PART_CODES[partCode] || `Part ${partCode}`;
    const location = getPartLocation(partCode);
    return baseName + location;
}

/**
 * Parse an ELV3 PDF and extract inspection data
 * @param {Buffer} pdfBuffer - The PDF file as a buffer
 * @returns {Object} - Parsed inspection data
 */
async function parseELV3PDF(pdfBuffer) {
    const result = {
        success: false,
        inspectionDate: null,
        address: null,
        borough: null,
        block: null,
        lot: null,
        bin: null,
        reportType: null,
        devices: [],
        violations: [],
        rawText: null,
        error: null
    };

    try {
        // Extract form fields using pdf-lib (primary method for filled PDFs)
        const formData = await extractFormFields(pdfBuffer);
        
        // Parse the extracted data
        if (formData && Object.keys(formData).length > 0) {
            // Use form field data (reliable for filled PDFs)
            parseFormFieldData(formData, result);
        }
        
        result.success = result.devices.length > 0 || result.violations.length > 0;
        
        if (!result.success) {
            result.error = 'No devices or violations found in PDF form fields';
        }
        
    } catch (error) {
        result.error = `Failed to parse PDF: ${error.message}`;
    }

    return result;
}

/**
 * Extract form fields from PDF using pdf-lib
 */
async function extractFormFields(pdfBuffer) {
    const formData = {};
    
    try {
        const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        
        for (const field of fields) {
            const name = field.getName();
            let value = null;
            
            try {
                // Try to get the field value based on type
                if (field.constructor.name === 'PDFTextField') {
                    value = field.getText();
                } else if (field.constructor.name === 'PDFCheckBox') {
                    value = field.isChecked();
                } else if (field.constructor.name === 'PDFDropdown') {
                    value = field.getSelected();
                } else if (field.constructor.name === 'PDFRadioGroup') {
                    value = field.getSelected();
                }
            } catch (e) {
                // Field might not have a value
            }
            
            if (value !== null && value !== undefined && value !== '') {
                formData[name] = value;
            }
        }
    } catch (error) {
        console.log('Could not extract form fields:', error.message);
    }
    
    return formData;
}

/**
 * Parse ELV3 form with XFA-style field names
 * Scans ALL pages (Page2, Page3, Page4, etc.) for devices and violations
 * 
 * Field patterns:
 * - Device: topmostSubform[0].Page2[0].topmostSubform_0_\.Page2_0_\._1_Device_0_[0]
 * - Part: topmostSubform[0].Page2[0].topmostSubform_0_\.Page2_0_\.Elevator_Part_0_[0]
 * - Condition: topmostSubform[0].Page2[0].topmostSubform_0_\.Page2_0_\.Violation_Condition_0_[0]
 * - Remedy: topmostSubform[0].Page2[0].topmostSubform_0_\.Page2_0_\.Suggested_Remedy_0_[0]
 * 
 * Each device can have multiple violation rows:
 * - Row 1: Elevator_Part_N_0_, Violation_Condition_N_0_, Suggested_Remedy_N_0_
 * - Rows 2+: TextField1_X_, TextField1_X+1_, TextField1_X+2_ in triplets
 */
function parseXFAFormFields(formData, result) {
    console.log('Parsing XFA form fields, total fields:', Object.keys(formData).length);
    
    // Detect which pages exist in the form
    const pagesFound = new Set();
    for (const fieldName of Object.keys(formData)) {
        const pageMatch = fieldName.match(/Page(\d+)/i);
        if (pageMatch) {
            pagesFound.add(parseInt(pageMatch[1]));
        }
    }
    console.log('Pages found in PDF:', Array.from(pagesFound).sort((a,b) => a-b));
    
    // Step 1: Extract all devices and their numbers from ALL pages
    const devices = {}; // Global device index -> deviceNumber
    let globalDeviceIndex = 0;
    
    // Sort pages to process in order
    const sortedPages = Array.from(pagesFound).sort((a, b) => a - b);
    
    // First, look for devices on Page1 (devices 6+ have _N_Device pattern on Page1)
    for (const [fieldName, value] of Object.entries(formData)) {
        if (!value || value === '') continue;
        if (!fieldName.includes('Page1')) continue;
        
        // Look for device fields with pattern like _6_Device, _7_Device etc. (devices 6+)
        const deviceMatch = fieldName.match(/_(\d+)_Device/i);
        if (deviceMatch) {
            const deviceIndex = parseInt(deviceMatch[1]);
            // Only capture devices 6+ from Page1 (devices 1-5 come from Page2)
            if (deviceIndex >= 6) {
                const deviceNumber = extractDeviceNumber(value);
                if (deviceNumber && !devices[deviceIndex]) {
                    devices[deviceIndex] = deviceNumber;
                    globalDeviceIndex = Math.max(globalDeviceIndex, deviceIndex);
                    
                    if (!result.devices.find(d => d.deviceNumber === deviceNumber)) {
                        result.devices.push({
                            deviceNumber: deviceNumber,
                            satisfactory: false,
                            deviceType: 'Elevator'
                        });
                    }
                    console.log(`Found device on Page1: index ${deviceIndex} = ${deviceNumber}`);
                }
            }
        }
    }
    
    // Then process Page2+ for devices 1-5 and devices 10+
    for (const pageNum of sortedPages) {
        // Skip Page1 as devices 1-5 are detailed on Page2+
        if (pageNum < 2) continue;
        
        const pagePattern = new RegExp(`Page${pageNum}`, 'i');
        
        for (const [fieldName, value] of Object.entries(formData)) {
            if (!value || value === '') continue;
            if (!pagePattern.test(fieldName)) continue;
            
            // Look for device fields with pattern like _1_Device_0_ or _2_Device_0_ etc.
            // Support device indices from 1-99 to handle many devices
            const deviceMatch = fieldName.match(/_(\d+)_Device/i);
            if (deviceMatch) {
                const localIndex = parseInt(deviceMatch[1]);
                const deviceNumber = extractDeviceNumber(value);
                if (deviceNumber) {
                    // Calculate global index based on page and local index
                    // Page 2: devices 1-5, Page 3: devices 6-10, etc. (5 per page)
                    // But devices 10+ on Page2 use their actual index
                    let globalIdx;
                    if (localIndex >= 10) {
                        // Device 10+ on Page2 uses actual index
                        globalIdx = localIndex;
                    } else {
                        // Devices 1-5 per page
                        const devicesPerPage = 5;
                        const pageOffset = (pageNum - 2) * devicesPerPage;
                        globalIdx = pageOffset + localIndex;
                    }
                    
                    if (!devices[globalIdx]) {
                        devices[globalIdx] = deviceNumber;
                        globalDeviceIndex = Math.max(globalDeviceIndex, globalIdx);
                        
                        // Add to result devices if not already there
                        if (!result.devices.find(d => d.deviceNumber === deviceNumber)) {
                            result.devices.push({
                                deviceNumber: deviceNumber,
                                satisfactory: false,
                                deviceType: 'Elevator'
                            });
                        }
                        console.log(`Found device on Page${pageNum}: index ${globalIdx} = ${deviceNumber}`);
                    }
                }
            }
            
            // Extract address from first Page2 field found
            const lowerName = fieldName.toLowerCase();
            if (lowerName.includes('textfield1_0_') && pageNum === 2 && !result.address) {
                result.address = value.toString().trim();
            }
        }
    }
    
    console.log('Total devices found:', Object.keys(devices).length, devices);
    
    // Step 1b: Extract satisfactory/unsatisfactory status from Page1 checkboxes
    // On Page1, devices are listed with Satisfactory and Unsatisfactory checkboxes
    // Based on analysis:
    // Devices 1-5:   SAT = 34-38,  UNSAT = 39-43
    // Devices 6-10:  SAT = 44-48,  UNSAT = 49-53
    // Devices 11-15: SAT = 54-58,  UNSAT = 59-63
    // Devices 16-20: SAT = 64-68,  UNSAT = 69-73
    // Devices 21-25: SAT = 74-78,  UNSAT = 79-83
    const deviceStatus = {}; // deviceIndex -> { satisfactory: bool, unsatisfactory: bool }
    
    for (const [fieldName, value] of Object.entries(formData)) {
        if (!fieldName.includes('Page1')) continue;
        
        // Look for satisfactory checkbox pattern
        const checkboxMatch = fieldName.match(/CheckBox1_(\d+)/);
        if (checkboxMatch && value === true) {
            const checkboxNum = parseInt(checkboxMatch[1]);
            
            // Determine which device row (0=devices 1-5, 1=devices 6-10, etc.)
            // and whether it's SAT or UNSAT
            // Pattern: Each row of 5 devices has 5 SAT checkboxes then 5 UNSAT checkboxes
            // Row 0: 34-38 SAT, 39-43 UNSAT
            // Row 1: 44-48 SAT, 49-53 UNSAT
            // etc.
            
            if (checkboxNum >= 34) {
                const adjustedNum = checkboxNum - 34;
                const rowOf10 = Math.floor(adjustedNum / 10); // Each row has 10 checkboxes (5 SAT + 5 UNSAT)
                const posInRow = adjustedNum % 10;
                
                const isSatisfactory = posInRow < 5;
                const deviceInRow = posInRow < 5 ? posInRow : posInRow - 5;
                const deviceIdx = (rowOf10 * 5) + deviceInRow + 1;
                
                if (!deviceStatus[deviceIdx]) deviceStatus[deviceIdx] = {};
                
                if (isSatisfactory) {
                    deviceStatus[deviceIdx].satisfactory = true;
                    console.log(`Device ${deviceIdx} marked as SATISFACTORY (CheckBox1_${checkboxNum})`);
                } else {
                    deviceStatus[deviceIdx].unsatisfactory = true;
                    console.log(`Device ${deviceIdx} marked as UNSATISFACTORY (CheckBox1_${checkboxNum})`);
                }
            }
        }
    }
    
    // Update device satisfactory status in result
    for (const device of result.devices) {
        const deviceIdx = Object.entries(devices).find(([idx, num]) => num === device.deviceNumber)?.[0];
        if (deviceIdx && deviceStatus[deviceIdx]) {
            device.satisfactory = deviceStatus[deviceIdx].satisfactory === true && !deviceStatus[deviceIdx].unsatisfactory;
        }
    }
    
    console.log('Device status:', deviceStatus);
    
    // Step 2: Extract violations from main Elevator_Part fields (Row 1 for each device)
    // Scan ALL pages for violation data
    const mainViolations = {}; // globalDeviceIndex -> {partCode, conditionCode, remedyCode}
    
    for (const pageNum of sortedPages) {
        if (pageNum < 2) continue;
        
        const pagePattern = new RegExp(`Page${pageNum}`, 'i');
        const devicesPerPage = 5;
        const pageOffset = (pageNum - 2) * devicesPerPage;
        
        for (const [fieldName, value] of Object.entries(formData)) {
            if (!value || value === '') continue;
            if (!pagePattern.test(fieldName)) continue;
            
            // Elevator_Part_0_ = device 1 (index 0 maps to device index 1)
            // Elevator_Part_2_0_ = device 2 (index 2 maps to device index 2)
            // Elevator_Part_3_0_ = device 3, etc.
            const partMatch = fieldName.match(/Elevator_Part(?:_(\d+))?_0_/i);
            if (partMatch) {
                const fieldIndex = partMatch[1] ? parseInt(partMatch[1]) : 0;
                // Map field index to device: 0->1, 2->2, 3->3, 4->4, 5->5 (local to page)
                const localDeviceIndex = fieldIndex === 0 ? 1 : fieldIndex;
                const globalDeviceIdx = pageOffset + localDeviceIndex;
                if (!mainViolations[globalDeviceIdx]) mainViolations[globalDeviceIdx] = {};
                mainViolations[globalDeviceIdx].partCode = value.toString().trim().padStart(2, '0');
            }
            
            const conditionMatch = fieldName.match(/Violation_Condition(?:_(\d+))?_0_/i);
            if (conditionMatch) {
                const fieldIndex = conditionMatch[1] ? parseInt(conditionMatch[1]) : 0;
                const localDeviceIndex = fieldIndex === 0 ? 1 : fieldIndex;
                const globalDeviceIdx = pageOffset + localDeviceIndex;
                if (!mainViolations[globalDeviceIdx]) mainViolations[globalDeviceIdx] = {};
                mainViolations[globalDeviceIdx].conditionCode = value.toString().trim().toUpperCase();
            }
            
            const remedyMatch = fieldName.match(/Suggested_Remedy(?:_(\d+))?_0_/i);
            if (remedyMatch) {
                const fieldIndex = remedyMatch[1] ? parseInt(remedyMatch[1]) : 0;
                const localDeviceIndex = fieldIndex === 0 ? 1 : fieldIndex;
                const globalDeviceIdx = pageOffset + localDeviceIndex;
                if (!mainViolations[globalDeviceIdx]) mainViolations[globalDeviceIdx] = {};
                mainViolations[globalDeviceIdx].remedyCode = value.toString().trim().padStart(2, '0');
            }
        }
    }
    
    // Step 2b: Extract violations for devices 10+ using Elevator_Part_6[N] pattern
    // This section uses array indices: [1] = device 12, [2] = device 13, etc.
    // Formula: device_number = 11 + array_index
    const devices10PlusViolations = {}; // deviceIndex -> { partCode, conditionCode, remedyCode }
    
    for (const [fieldName, value] of Object.entries(formData)) {
        if (!value || value === '') continue;
        if (!fieldName.includes('Page2')) continue;
        
        // Match Elevator_Part_6[N] pattern (NOT Elevator_Part_6_0 which is underscore format)
        const partMatch6 = fieldName.match(/Elevator_Part_6\[(\d+)\]/i);
        if (partMatch6) {
            const arrayIndex = parseInt(partMatch6[1]);
            if (arrayIndex > 0) { // [0] is usually empty, [1]+ are devices 12+
                const deviceIdx = 11 + arrayIndex; // [1] = device 12, [2] = device 13
                if (!devices10PlusViolations[deviceIdx]) devices10PlusViolations[deviceIdx] = {};
                devices10PlusViolations[deviceIdx].partCode = value.toString().trim().padStart(2, '0');
                console.log(`Found device 10+ violation part: Device ${deviceIdx}, Part ${value}`);
            }
        }
        
        const conditionMatch6 = fieldName.match(/Violation_Condition_6\[(\d+)\]/i);
        if (conditionMatch6) {
            const arrayIndex = parseInt(conditionMatch6[1]);
            if (arrayIndex > 0) {
                const deviceIdx = 11 + arrayIndex;
                if (!devices10PlusViolations[deviceIdx]) devices10PlusViolations[deviceIdx] = {};
                devices10PlusViolations[deviceIdx].conditionCode = value.toString().trim().toUpperCase();
            }
        }
        
        const remedyMatch6 = fieldName.match(/Suggested_Remedy_6\[(\d+)\]/i);
        if (remedyMatch6) {
            const arrayIndex = parseInt(remedyMatch6[1]);
            if (arrayIndex > 0) {
                const deviceIdx = 11 + arrayIndex;
                if (!devices10PlusViolations[deviceIdx]) devices10PlusViolations[deviceIdx] = {};
                devices10PlusViolations[deviceIdx].remedyCode = value.toString().trim().padStart(2, '0');
            }
        }
    }
    
    // Add devices 10+ violations to mainViolations
    for (const [deviceIdx, viol] of Object.entries(devices10PlusViolations)) {
        if (viol.partCode) {
            mainViolations[deviceIdx] = viol;
        }
    }
    
    // Add main violations to result
    for (const [deviceIndex, viol] of Object.entries(mainViolations)) {
        const deviceNumber = devices[deviceIndex];
        if (deviceNumber && viol.partCode) {
            const violation = {
                deviceNumber: deviceNumber,
                partCode: viol.partCode,
                partDescription: getPartDescriptionWithLocation(viol.partCode),
                conditionCode: viol.conditionCode || null,
                conditionDescription: CONDITION_CODES[viol.conditionCode] || viol.conditionCode,
                remedyCode: viol.remedyCode || null,
                remedyDescription: REMEDY_CODES[viol.remedyCode] || `Remedy ${viol.remedyCode}`,
                comments: null
            };
            result.violations.push(violation);
            console.log(`Found main violation: Device ${violation.deviceNumber}, Part ${violation.partCode}, Condition ${violation.conditionCode}, Remedy ${violation.remedyCode}`);
        }
    }
    
    // Step 3: Extract additional violation rows from TextField1_ fields
    // Scan ALL pages for TextField data
    const textFieldsByPage = {}; // pageNum -> { fieldNum -> value }
    
    for (const pageNum of sortedPages) {
        if (pageNum < 2) continue;
        
        const pagePattern = new RegExp(`Page${pageNum}`, 'i');
        textFieldsByPage[pageNum] = {};
        
        for (const [fieldName, value] of Object.entries(formData)) {
            if (!value) continue;
            if (!pagePattern.test(fieldName)) continue;
            
            const match = fieldName.match(/TextField1_(\d+)_/);
            if (match) {
                const num = parseInt(match[1]);
                textFieldsByPage[pageNum][num] = value.toString().trim();
            }
        }
    }
    
    // Step 3b: Also collect TextField1[N] bracket notation (used for devices 10+ additional violations)
    const bracketTextFields = {}; // fieldNum -> value
    for (const [fieldName, value] of Object.entries(formData)) {
        if (!value) continue;
        if (!fieldName.includes('Page2')) continue;
        
        // Match TextField1[N] (bracket notation, not underscore)
        const bracketMatch = fieldName.match(/TextField1\[(\d+)\]$/);
        if (bracketMatch) {
            const num = parseInt(bracketMatch[1]);
            bracketTextFields[num] = value.toString().trim();
        }
    }
    
    // Scan for violation triplets (Part, Condition, Remedy)
    // Part: 2-digit number (01-99)
    // Condition: 1-2 letters (A-Z, BB, etc.)
    // Remedy: 2-digit number (01-99)
    const partPattern = /^\d{1,2}$/;
    const conditionPattern = /^[A-Z]{1,2}$/i;  // Allow 1-2 letters for conditions like "BB"
    const remedyPattern = /^\d{1,2}$/;
    
    // Each device section has ~27 fields (9 rows x 3 fields)
    const FIELDS_PER_DEVICE = 27;
    const FIRST_DEVICE_OFFSET = 7;
    const devicesPerPage = 5;
    
    // Find all valid triplets from ALL pages
    const foundTriplets = [];
    
    for (const pageNum of sortedPages) {
        if (pageNum < 2) continue;
        
        const textFields = textFieldsByPage[pageNum] || {};
        const pageOffset = (pageNum - 2) * devicesPerPage;
        
        // Scan up to 500 fields to handle many devices (increased from 200)
        for (let i = 0; i <= 500; i++) {
            const a = textFields[i];
            const b = textFields[i + 1];
            const c = textFields[i + 2];
            
            if (a && b && c) {
                const aClean = a.trim();
                const bClean = b.trim().toUpperCase();
                const cClean = c.trim();
                
                if (partPattern.test(aClean) && conditionPattern.test(bClean) && remedyPattern.test(cClean)) {
                    // Determine which device this belongs to based on field offset
                    const offset = i - FIRST_DEVICE_OFFSET;
                    const localDeviceIndex = Math.floor(offset / FIELDS_PER_DEVICE) + 1;
                    const globalDeviceIndex = pageOffset + localDeviceIndex;
                    
                    foundTriplets.push({
                        page: pageNum,
                        fieldStart: i,
                        deviceIndex: globalDeviceIndex,
                        partCode: aClean.padStart(2, '0'),
                        conditionCode: bClean,
                        remedyCode: cClean.padStart(2, '0')
                    });
                }
            }
        }
    }
    
    console.log(`Found ${foundTriplets.length} potential violation triplets across all pages`);
    
    // Step 3c: Find violation triplets in bracket notation TextField1[N] (for devices 10+)
    // TextField1[82/83/84] = 45/BB/05 for device 13's second violation
    // The mapping: fields 80-89 might be for device 13, 70-79 for device 12, etc.
    const bracketTriplets = [];
    const bracketIndices = Object.keys(bracketTextFields).map(Number).sort((a, b) => a - b);
    
    for (let i = 0; i < bracketIndices.length - 2; i++) {
        const idx1 = bracketIndices[i];
        const idx2 = bracketIndices[i + 1];
        const idx3 = bracketIndices[i + 2];
        
        // Check if they're consecutive
        if (idx2 === idx1 + 1 && idx3 === idx1 + 2) {
            const a = bracketTextFields[idx1];
            const b = bracketTextFields[idx2];
            const c = bracketTextFields[idx3];
            
            if (a && b && c) {
                const aClean = a.trim();
                const bClean = b.trim().toUpperCase();
                const cClean = c.trim();
                
                if (partPattern.test(aClean) && conditionPattern.test(bClean) && remedyPattern.test(cClean)) {
                    // For bracket notation, device mapping is different
                    // Based on analysis: TextField1[82-84] = device 13
                    // This suggests fields in 80s are for device 13, 70s for device 12, etc.
                    // Formula: device = Math.floor(idx1 / 10) - 5 + 11 = Math.floor(idx1 / 10) + 6
                    // For idx1=82: Math.floor(82/10) + 6 = 8 + 6 = 14... not quite right
                    // Let me use a simpler mapping: if we find bracket triplets, map to devices 12-16
                    // based on which devices already have violations from Elevator_Part_6
                    
                    // For now, associate with device 13 if in 80-89 range
                    // This is a heuristic - may need refinement
                    let targetDevice = null;
                    if (idx1 >= 80 && idx1 < 90) targetDevice = 13;
                    else if (idx1 >= 70 && idx1 < 80) targetDevice = 12;
                    else if (idx1 >= 90 && idx1 < 100) targetDevice = 14;
                    
                    if (targetDevice && devices[targetDevice]) {
                        bracketTriplets.push({
                            fieldStart: idx1,
                            deviceIndex: targetDevice,
                            partCode: aClean.padStart(2, '0'),
                            conditionCode: bClean,
                            remedyCode: cClean.padStart(2, '0')
                        });
                        console.log(`Found bracket violation: TextField1[${idx1}] -> Device ${targetDevice}, Part ${aClean}, Condition ${bClean}, Remedy ${cClean}`);
                    }
                }
            }
        }
    }
    
    // Add bracket triplet violations to result
    for (const triplet of bracketTriplets) {
        const deviceNumber = devices[triplet.deviceIndex];
        if (deviceNumber) {
            const violation = {
                deviceNumber: deviceNumber,
                partCode: triplet.partCode,
                partDescription: getPartDescriptionWithLocation(triplet.partCode),
                conditionCode: triplet.conditionCode,
                conditionDescription: CONDITION_CODES[triplet.conditionCode] || triplet.conditionCode,
                remedyCode: triplet.remedyCode,
                remedyDescription: REMEDY_CODES[triplet.remedyCode] || `Remedy ${triplet.remedyCode}`,
                comments: null
            };
            result.violations.push(violation);
            console.log(`Found bracket additional violation: Device ${violation.deviceNumber}, Part ${violation.partCode}, Condition ${violation.conditionCode}, Remedy ${violation.remedyCode}`);
        }
    }
    
    // Add TextField violations to result
    for (const triplet of foundTriplets) {
        const deviceNumber = devices[triplet.deviceIndex];
        if (deviceNumber) {
            // Check if this exact violation already exists (from main fields)
            const exists = result.violations.some(v => 
                v.deviceNumber === deviceNumber && 
                v.partCode === triplet.partCode && 
                v.conditionCode === triplet.conditionCode &&
                v.remedyCode === triplet.remedyCode
            );
            
            if (!exists) {
                const violation = {
                    deviceNumber: deviceNumber,
                    partCode: triplet.partCode,
                    partDescription: getPartDescriptionWithLocation(triplet.partCode),
                    conditionCode: triplet.conditionCode,
                    conditionDescription: CONDITION_CODES[triplet.conditionCode] || triplet.conditionCode,
                    remedyCode: triplet.remedyCode,
                    remedyDescription: REMEDY_CODES[triplet.remedyCode] || `Remedy ${triplet.remedyCode}`,
                    comments: null
                };
                result.violations.push(violation);
                console.log(`Found additional violation (Page${triplet.page} TextField1_${triplet.fieldStart}): Device ${violation.deviceNumber}, Part ${violation.partCode}, Condition ${violation.conditionCode}, Remedy ${violation.remedyCode}`);
            }
        } else {
            console.log(`Warning: Found triplet at Page${triplet.page} TextField1_${triplet.fieldStart} but couldn't map to device index ${triplet.deviceIndex}`);
        }
    }
    
    // Step 4: Look for comments in "Text Field" fields (note the space)
    // The ELV3 form has comment fields named "Text Field0", "Text Field1", etc.
    // These are global across all pages, with ~3 comment fields per device section
    const deviceComments = {};
    
    // Calculate comment fields per device based on total devices found
    const totalDevices = Object.keys(devices).length;
    // Typically 3 comment rows per device, but adjust if we have many devices
    const COMMENT_FIELDS_PER_DEVICE = 3;
    
    // Also collect comments from page-specific patterns
    for (const [fieldName, value] of Object.entries(formData)) {
        if (!value) continue;
        
        const strValue = value.toString().trim();
        if (!strValue) continue;
        
        // Look for "Text Field" pattern (with space) - these are the comment fields
        // They are global (not page-specific in their numbering)
        const textFieldMatch = fieldName.match(/Text Field(\d+)/);
        if (textFieldMatch) {
            const fieldNum = parseInt(textFieldMatch[1]);
            // Map field number to device index
            const deviceIndex = Math.floor(fieldNum / COMMENT_FIELDS_PER_DEVICE) + 1;
            const rowIndex = fieldNum % COMMENT_FIELDS_PER_DEVICE;
            
            if (devices[deviceIndex]) {
                if (!deviceComments[deviceIndex]) deviceComments[deviceIndex] = [];
                deviceComments[deviceIndex].push({
                    row: rowIndex,
                    comment: strValue
                });
                console.log(`Found comment for device ${deviceIndex} (${devices[deviceIndex]}) row ${rowIndex}: ${strValue.substring(0, 50)}...`);
            }
        }
        
        // Also check for Comment_N_ or Comments_N_ patterns (may appear on any page)
        const commentMatch = fieldName.match(/Comments?_(\d+)?/i);
        if (commentMatch && strValue.length > 0) {
            const deviceIdx = commentMatch[1] ? parseInt(commentMatch[1]) : 1;
            if (!deviceComments[deviceIdx]) deviceComments[deviceIdx] = [];
            deviceComments[deviceIdx].push({ row: 0, comment: strValue });
        }
    }
    
    console.log(`Found comments for ${Object.keys(deviceComments).length} devices`);
    
    // Attach comments to violations for each device
    for (const [deviceIndex, comments] of Object.entries(deviceComments)) {
        const deviceNumber = devices[deviceIndex];
        if (deviceNumber && comments.length > 0) {
            // Combine all comments for the device
            const combinedComment = comments.map(c => c.comment).join(' | ');
            // Add comment to all violations for this device
            for (const violation of result.violations) {
                if (violation.deviceNumber === deviceNumber && !violation.comments) {
                    violation.comments = combinedComment;
                }
            }
            console.log(`Attached comments to device ${deviceNumber}: ${combinedComment.substring(0, 80)}...`);
        }
    }
    
    // Step 5: Group violations by device for easier display
    result.violationsByDevice = {};
    for (const violation of result.violations) {
        if (!result.violationsByDevice[violation.deviceNumber]) {
            result.violationsByDevice[violation.deviceNumber] = [];
        }
        result.violationsByDevice[violation.deviceNumber].push(violation);
    }
    
    // Step 6: Separate devices into those with violations and satisfactory ones
    result.devicesWithViolations = [];
    result.satisfactoryDevices = [];
    
    for (const device of result.devices) {
        const hasViolations = result.violationsByDevice[device.deviceNumber]?.length > 0;
        if (hasViolations) {
            result.devicesWithViolations.push(device);
        } else if (device.satisfactory) {
            result.satisfactoryDevices.push(device);
        } else {
            // Device has no violations but wasn't marked satisfactory
            // Still include in satisfactory list (it was tested)
            result.satisfactoryDevices.push({
                ...device,
                satisfactory: true
            });
        }
    }
    
    console.log('Total violations found:', result.violations.length);
    console.log('Devices with violations:', result.devicesWithViolations.length);
    console.log('Satisfactory devices:', result.satisfactoryDevices.length);
}

/**
 * Parse form field data into structured result
 */
function parseFormFieldData(formData, result) {
    // Log form fields for debugging
    console.log('Form fields found:', Object.keys(formData).length);
    
    // Check if this is an XFA-style form (complex field names)
    const hasXFAFields = Object.keys(formData).some(name => 
        name.includes('topmostSubform') || name.includes('Page2')
    );
    
    if (hasXFAFields) {
        console.log('Detected XFA-style form, using XFA parser');
        parseXFAFormFields(formData, result);
    }
    
    // Common field name patterns in ELV3 forms
    for (const [fieldName, value] of Object.entries(formData)) {
        const lowerName = fieldName.toLowerCase();
        
        // Location info
        if (lowerName.includes('bin') && !result.bin) {
            result.bin = extractBIN(value);
        }
        if ((lowerName.includes('textfield1_0_') || lowerName.includes('address')) && !result.address) {
            if (typeof value === 'string' && value.trim()) {
                result.address = value.trim();
            }
        }
        if (lowerName.includes('borough') && !result.borough) {
            result.borough = value;
        }
        if (lowerName.includes('block') && !result.block) {
            result.block = value;
        }
        if (lowerName.includes('lot') && !result.lot) {
            result.lot = value;
        }
        
        // Device numbers - look for patterns like "device" or numbered fields
        if (lowerName.includes('device') && lowerName.includes('number')) {
            const deviceNum = extractDeviceNumber(value);
            if (deviceNum && !result.devices.find(d => d.deviceNumber === deviceNum)) {
                result.devices.push({
                    deviceNumber: deviceNum,
                    satisfactory: null,
                    deviceType: null
                });
            }
        }
        
        // Inspection date
        if (lowerName.includes('date') && lowerName.includes('inspection') || lowerName.includes('test')) {
            if (!result.inspectionDate && value) {
                result.inspectionDate = value;
            }
        }
    }
    
    // Parse violations from defects section (for non-XFA forms)
    if (!hasXFAFields) {
        parseViolationsFromFormFields(formData, result);
    }
}

/**
 * Parse violations from form fields
 */
function parseViolationsFromFormFields(formData, result) {
    // Group fields by device number (1-18 typically)
    for (let i = 1; i <= 18; i++) {
        let deviceNumber = null;
        let elevatorPart = null;
        let violationCondition = null;
        let suggestedRemedy = null;
        let comments = null;
        
        // Look for fields related to this device index
        for (const [fieldName, value] of Object.entries(formData)) {
            const lowerName = fieldName.toLowerCase();
            
            // Match patterns like "Device #1", "1. Device", "device_1", etc.
            const hasIndex = lowerName.includes(i.toString()) || 
                            fieldName.includes(`[${i}]`) ||
                            fieldName.includes(`_${i}_`) ||
                            fieldName.includes(`_${i}.`) ||
                            fieldName.endsWith(`_${i}`) ||
                            fieldName.endsWith(`.${i}`);
            
            if (!hasIndex) continue;
            
            if (lowerName.includes('device') && (lowerName.includes('#') || lowerName.includes('number'))) {
                deviceNumber = extractDeviceNumber(value);
            }
            if (lowerName.includes('part') || lowerName.includes('elevator part')) {
                elevatorPart = value?.toString().trim();
            }
            if (lowerName.includes('condition') || lowerName.includes('violation condition')) {
                violationCondition = value?.toString().trim().toUpperCase();
            }
            if (lowerName.includes('remedy') || lowerName.includes('suggested remedy')) {
                suggestedRemedy = value?.toString().trim();
            }
            if (lowerName.includes('comment')) {
                comments = value?.toString().trim();
            }
        }
        
        // If we found a device with violations, add it
        if (deviceNumber && elevatorPart && elevatorPart.toLowerCase() !== 'none') {
            const violation = {
                deviceNumber,
                partCode: elevatorPart,
                partDescription: PART_CODES[elevatorPart] || `Part ${elevatorPart}`,
                conditionCode: violationCondition,
                conditionDescription: CONDITION_CODES[violationCondition] || violationCondition,
                remedyCode: suggestedRemedy,
                remedyDescription: REMEDY_CODES[suggestedRemedy] || `Remedy ${suggestedRemedy}`,
                comments: comments || null
            };
            
            result.violations.push(violation);
            
            // Also add to devices if not already there
            if (!result.devices.find(d => d.deviceNumber === deviceNumber)) {
                result.devices.push({
                    deviceNumber,
                    satisfactory: false,
                    deviceType: null
                });
            }
        }
    }
}

/**
 * Parse text data as fallback
 */
function parseTextData(text, result) {
    // Try to extract BIN from text
    const binMatch = text.match(/BIN[:\s]*(\d{7})/i);
    if (binMatch) {
        result.bin = binMatch[1];
    }
    
    // Try to extract address
    const addressMatch = text.match(/Address[:\s]*([^\n]+)/i);
    if (addressMatch) {
        result.address = addressMatch[1].trim();
    }
    
    // Try to extract device numbers (patterns like 1P760, 2F1234, etc.)
    const devicePattern = /\b(\d[A-Z]\d{3,5})\b/g;
    let match;
    while ((match = devicePattern.exec(text)) !== null) {
        const deviceNum = match[1];
        if (!result.devices.find(d => d.deviceNumber === deviceNum)) {
            result.devices.push({
                deviceNumber: deviceNum,
                satisfactory: null,
                deviceType: null
            });
        }
    }
    
    // Parse violations from text - look for patterns in Defects Found section
    const defectsSection = text.match(/Defects Found[\s\S]*?(?=Property Owner|Inspecting Agency|$)/i);
    if (defectsSection) {
        parseViolationsFromText(defectsSection[0], result);
    }
}

/**
 * Parse violations from text content
 */
function parseViolationsFromText(text, result) {
    // Look for patterns like:
    // Device #: 1P760
    // Elevator Part: 02
    // Violation Condition: X
    // Suggested Remedy: 10
    
    const deviceBlocks = text.split(/\d+\.\s*Device\s*#/i);
    
    for (const block of deviceBlocks) {
        if (!block.trim()) continue;
        
        // Extract device number
        const deviceMatch = block.match(/^[:\s]*(\d[A-Z]\d{3,5})/i);
        if (!deviceMatch) continue;
        
        const deviceNumber = deviceMatch[1].toUpperCase();
        
        // Extract part code
        const partMatch = block.match(/Elevator\s*Part[:\s]*(\d{1,3})/i);
        const partCode = partMatch ? partMatch[1].padStart(2, '0') : null;
        
        // Extract condition code
        const conditionMatch = block.match(/Violation\s*Condition[:\s]*([A-Z]{1,2})/i);
        const conditionCode = conditionMatch ? conditionMatch[1].toUpperCase() : null;
        
        // Extract remedy code
        const remedyMatch = block.match(/Suggested\s*Remedy[:\s]*(\d{1,2})/i);
        const remedyCode = remedyMatch ? remedyMatch[1].padStart(2, '0') : null;
        
        // Extract comments
        const commentsMatch = block.match(/Comments?[:\s]*([^\n]+)/i);
        const comments = commentsMatch ? commentsMatch[1].trim() : null;
        
        // Skip if "None" or no real violation data
        if (!partCode || partCode.toLowerCase() === 'none') continue;
        
        const violation = {
            deviceNumber,
            partCode,
            partDescription: getPartDescriptionWithLocation(partCode),
            conditionCode,
            conditionDescription: CONDITION_CODES[conditionCode] || conditionCode,
            remedyCode,
            remedyDescription: REMEDY_CODES[remedyCode] || `Remedy ${remedyCode}`,
            comments: comments !== 'None' ? comments : null
        };
        
        result.violations.push(violation);
    }
}

/**
 * Extract device number from a string
 */
function extractDeviceNumber(value) {
    if (!value) return null;
    const str = value.toString().trim().toUpperCase();
    
    // NYC device number pattern: digit + letter + 3-5 digits (e.g., 1P760, 2F12345)
    const match = str.match(/(\d[A-Z]\d{3,5})/);
    return match ? match[1] : null;
}

/**
 * Extract BIN from a string
 */
function extractBIN(value) {
    if (!value) return null;
    const str = value.toString().trim();
    
    // BIN is 7 digits
    const match = str.match(/(\d{7})/);
    return match ? match[1] : null;
}

/**
 * Get human-readable descriptions for violation codes
 */
function getViolationDescription(partCode, conditionCode, remedyCode) {
    const part = getPartDescriptionWithLocation(partCode);
    const condition = CONDITION_CODES[conditionCode] || conditionCode;
    const remedy = REMEDY_CODES[remedyCode] || `Remedy ${remedyCode}`;
    
    return {
        part,
        condition,
        remedy,
        summary: `${part} - ${condition} - ${remedy}`
    };
}

module.exports = {
    parseELV3PDF,
    getViolationDescription,
    PART_CODES,
    CONDITION_CODES,
    REMEDY_CODES
};
