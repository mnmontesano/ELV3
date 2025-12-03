// Updated filterDevicesByType function to handle "Removed" as a special type filter
function filterDevicesByType() {
    applyAllFilters();
}

// New function to handle test eligibility dropdown filtering
function filterByTestEligibility() {
    applyAllFilters();
}

// Function to set test eligibility filter from status text click
function setTestEligibilityFilterFromStatus(statusText) {
    const dropdown = document.getElementById('testEligibilityFilter');
    if (!dropdown) return;
    
    // Map status text to dropdown value
    let filterValue = 'all';
    switch(statusText) {
        case 'Completed':
            filterValue = 'completed';
            break;
        case 'Ready':
            filterValue = 'eligible';
            break;
        case 'Not Ready':
            filterValue = 'not-eligible';
            break;
        case 'CAT 5 Required':
            // CAT 5 Required is still eligible/ready
            filterValue = 'eligible';
            break;
        default:
            filterValue = 'all';
    }
    
    // Update dropdown value
    dropdown.value = filterValue;
    
    // Apply the filter
    filterByTestEligibility();
}

// New function to filter devices by device number
function filterByDeviceNumber() {
    applyAllFilters();
}

// Centralized function to apply all filters together
function applyAllFilters() {
    const typeFilter = document.getElementById('deviceTypeFilter').value;
    const eligibilityFilter = document.getElementById('testEligibilityFilter') ? document.getElementById('testEligibilityFilter').value : 'all';
    const deviceNumberFilter = document.getElementById('deviceNumberFilter') ? document.getElementById('deviceNumberFilter').value.trim().toUpperCase() : '';
    const violationsFiltering = document.getElementById('violationsFilterBtn').getAttribute('data-filtering') === 'true';
    const deviceItems = document.querySelectorAll('.device-item');
    
    // Count devices matching the test eligibility filter specifically
    let eligibilityCount = 0;
    deviceItems.forEach(item => {
        // Skip removed devices - they shouldn't be counted in active device counts
        const deviceStatus = item.getAttribute('data-device-status');
        if (deviceStatus && deviceStatus.toUpperCase() === 'REMOVED') {
            return;
        }
        
        const testStatusElement = item.querySelector('[data-test-status]');
        if (!testStatusElement) {
            // If no test status element, skip this device
            return;
        }
        
        const isEligibleAttr = testStatusElement.getAttribute('data-test-status');
        const isEligible = isEligibleAttr === 'true' || isEligibleAttr === true;
        const testStatusText = (testStatusElement.getAttribute('data-test-status-text') || '').trim();
        let matchesEligibilityFilter = false;
        
        if (eligibilityFilter === 'all') {
            matchesEligibilityFilter = true;
        } else if (eligibilityFilter === 'eligible') {
            // Count devices that are eligible (Ready or CAT 5 Required)
            // Both have isEligible = true
            matchesEligibilityFilter = isEligible === true;
        } else if (eligibilityFilter === 'not-eligible') {
            // Count devices that are not eligible and not completed
            // Exclude completed devices and eligible devices from not-eligible filter
            matchesEligibilityFilter = isEligible !== true && testStatusText !== 'Completed';
        } else if (eligibilityFilter === 'completed') {
            // Count devices with Completed status
            matchesEligibilityFilter = testStatusText === 'Completed';
        }
        
        if (matchesEligibilityFilter) {
            eligibilityCount++;
        }
    });
    
    // Update the count display
    const countElement = document.getElementById('testEligibilityCount');
    if (countElement && eligibilityFilter !== 'all') {
        const filterLabels = {
            'eligible': 'Ready',
            'not-eligible': 'Not Ready',
            'completed': 'Completed'
        };
        const filterLabel = filterLabels[eligibilityFilter] || eligibilityFilter;
        countElement.textContent = `Showing ${eligibilityCount} ${filterLabel} device${eligibilityCount !== 1 ? 's' : ''}`;
    } else if (countElement) {
        countElement.textContent = '';
    }
    
    deviceItems.forEach(item => {
        // Type filter check
        const deviceType = item.getAttribute('data-device-type');
        const deviceStatus = item.getAttribute('data-device-status');
        let typeMatch = false;
        
        if (typeFilter === 'all') {
            typeMatch = true;
        } else if (typeFilter === 'REMOVED') {
            typeMatch = deviceStatus === 'REMOVED';
        } else {
            typeMatch = deviceType === typeFilter;
        }
        
        // Violations filter check
        const hasViolations = item.getAttribute('data-has-violations') === 'true';
        const violationMatch = !violationsFiltering || hasViolations;
        
        // Test eligibility filter check
        const testStatusElement = item.querySelector('[data-test-status]');
        const isEligible = testStatusElement?.getAttribute('data-test-status') === 'true';
        const testStatusText = testStatusElement?.getAttribute('data-test-status-text') || '';
        let eligibilityMatch = true;
        
        if (eligibilityFilter === 'eligible') {
            eligibilityMatch = isEligible;
        } else if (eligibilityFilter === 'not-eligible') {
            // Exclude completed devices from not-eligible filter
            eligibilityMatch = !isEligible && testStatusText !== 'Completed';
        } else if (eligibilityFilter === 'completed') {
            eligibilityMatch = testStatusText === 'Completed';
        }
        
        // Device number filter check
        let deviceNumberMatch = true;
        if (deviceNumberFilter !== '') {
            const deviceNumberElement = item.querySelector('div:first-child');
            if (deviceNumberElement) {
                const deviceNumberText = deviceNumberElement.textContent;
                const deviceNumber = deviceNumberText.replace('Device #:', '').trim().toUpperCase();
                deviceNumberMatch = deviceNumber.includes(deviceNumberFilter);
            }
        }
        
        // Show item only if all filters match
        if (typeMatch && violationMatch && eligibilityMatch && deviceNumberMatch) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
    
    updateDeviceTypeSectionVisibility();
}

// Updated resetFilters to handle all the new filters
function resetFilters() {
    // Reset violations filter
    const violationsFilterBtn = document.getElementById('violationsFilterBtn');
    violationsFilterBtn.setAttribute('data-filtering', 'false');
    document.getElementById('violationsFilterText').textContent = 'Show Only Devices with Violations';
    violationsFilterBtn.style.background = 'var(--panel-bg)';
    violationsFilterBtn.style.color = 'var(--text-color)';
    violationsFilterBtn.style.width = '240px';
    
    // Reset type filter
    document.getElementById('deviceTypeFilter').value = 'all';
    
    // Reset test eligibility filter
    if (document.getElementById('testEligibilityFilter')) {
        document.getElementById('testEligibilityFilter').value = 'all';
    }
    
    // Reset device number filter
    if (document.getElementById('deviceNumberFilter')) {
        document.getElementById('deviceNumberFilter').value = '';
    }
    
    // Reset count display
    const countElement = document.getElementById('testEligibilityCount');
    if (countElement) {
        countElement.textContent = '';
    }
    
    // Show all devices
    document.querySelectorAll('.device-item').forEach(item => {
        item.style.display = '';
    });
    
    // Show all sections
    document.querySelectorAll('.device-type-section').forEach(section => {
        section.style.display = '';
    });
}

// Override the existing functions when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Replace the existing functions
    window.filterDevicesByType = filterDevicesByType;
    window.filterByTestEligibility = filterByTestEligibility;
    window.filterByDeviceNumber = filterByDeviceNumber;
    window.applyAllFilters = applyAllFilters;
    window.resetFilters = resetFilters;
    window.setTestEligibilityFilterFromStatus = setTestEligibilityFilterFromStatus;
}); 