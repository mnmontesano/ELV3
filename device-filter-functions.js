// Updated filterDevicesByType function to handle "Removed" as a special type filter
function filterDevicesByType() {
    applyAllFilters();
}

// New function to handle test eligibility dropdown filtering
function filterByTestEligibility() {
    applyAllFilters();
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
}); 