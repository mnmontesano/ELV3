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

// Function to sort devices by date tested
function sortByDateTested() {
    applyAllFilters();
}

// Helper function to get the most recent test date for a device element
function getMostRecentDateFromDevice(deviceItem) {
    // Use the explicit device-number attribute so nested card text cannot be
    // mistaken for the identifier.
    const deviceNumber = (deviceItem.getAttribute('data-device-number') || '').trim();
    if (!deviceNumber) return null;
    
    // Look up the device in the stored results
    const data = window.lastBinSearchResults;
    if (!data) return null;
    
    const device = data.find(d => d.device_number === deviceNumber);
    if (!device) return null;
    
    // Get all test dates
    const cat1Date = device.cat1_latest_report_filed ? new Date(device.cat1_latest_report_filed) : null;
    const cat5Date = device.cat5_latest_report_filed ? new Date(device.cat5_latest_report_filed) : null;
    const pviDate = device.periodic_latest_inspection ? new Date(device.periodic_latest_inspection) : null;
    
    // Find most recent date
    const dates = [cat1Date, cat5Date, pviDate].filter(date => date !== null && !isNaN(date.getTime()));
    
    if (dates.length === 0) return null;
    
    return new Date(Math.max.apply(null, dates));
}

// Function to update the active filter status indicator
function updateActiveFilterStatus(typeFilter, eligibilityFilter, deviceNumberFilter, violationsFiltering, dateSortFilter) {
    const statusDiv = document.getElementById('activeFilterStatus');
    const statusText = document.getElementById('activeFilterText');
    
    if (!statusDiv || !statusText) return;
    
    // Build list of active filters
    const activeFilters = [];
    
    if (violationsFiltering) {
        activeFilters.push('Only Devices with Violations');
    }
    
    if (eligibilityFilter !== 'all') {
        const eligibilityLabels = {
            'eligible': 'Ready Devices',
            'not-eligible': 'Not Ready Devices',
            'completed': 'Completed Devices'
        };
        activeFilters.push(eligibilityLabels[eligibilityFilter] || eligibilityFilter);
    }
    
    if (typeFilter !== 'all') {
        if (typeFilter === 'REMOVED') {
            activeFilters.push('Removed/Deleted Devices Only');
        } else {
            activeFilters.push(`${typeFilter} Only`);
        }
    }
    
    if (deviceNumberFilter !== '') {
        activeFilters.push(`Device # containing "${deviceNumberFilter}"`);
    }
    
    if (dateSortFilter !== 'default') {
        const sortLabels = {
            'newest': 'Sorted by Newest First',
            'oldest': 'Sorted by Oldest First'
        };
        activeFilters.push(sortLabels[dateSortFilter] || dateSortFilter);
    }
    
    // Update the status display
    if (activeFilters.length > 0) {
        statusDiv.style.display = 'block';
        statusText.textContent = `You are currently viewing with the "${activeFilters.join('" + "')}" filter${activeFilters.length > 1 ? 's' : ''} on`;
    } else {
        statusDiv.style.display = 'none';
    }
}

// Centralized function to apply all filters together
function applyAllFilters() {
    const typeFilterEl = document.getElementById('deviceTypeFilter');
    const violationsFilterBtnEl = document.getElementById('violationsFilterBtn');
    if (!typeFilterEl || !violationsFilterBtnEl) return;

    const typeFilter = typeFilterEl.value;
    const eligibilityFilter = document.getElementById('testEligibilityFilter') ? document.getElementById('testEligibilityFilter').value : 'all';
    const deviceNumberFilter = document.getElementById('deviceNumberFilter') ? document.getElementById('deviceNumberFilter').value.trim().toUpperCase() : '';
    const dateSortFilter = document.getElementById('dateSortFilter') ? document.getElementById('dateSortFilter').value : 'default';
    const violationsFiltering = violationsFilterBtnEl.getAttribute('data-filtering') === 'true';
    const deviceItems = document.querySelectorAll('.device-item');
    
    // Update the active filter status indicator
    updateActiveFilterStatus(typeFilter, eligibilityFilter, deviceNumberFilter, violationsFiltering, dateSortFilter);
    
    // Get all device type sections (excluding removed devices)
    const deviceTypeSections = document.querySelectorAll('.device-type-section:not(.removed-devices)');
    
    deviceTypeSections.forEach(section => {
        const container = section.querySelector('div > div:last-child');
        if (!container) return;
        
        const items = Array.from(container.querySelectorAll('.device-item'));
        
        if (dateSortFilter === 'default') {
            // Sort by original index to restore the order when BIN was first searched
            items.sort((a, b) => {
                const indexA = parseInt(a.getAttribute('data-original-index')) || 0;
                const indexB = parseInt(b.getAttribute('data-original-index')) || 0;
                return indexA - indexB;
            });
        } else {
            // Sort items by date
            items.sort((a, b) => {
                const dateA = getMostRecentDateFromDevice(a);
                const dateB = getMostRecentDateFromDevice(b);
                
                // Handle null dates - put them at the end
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;
                
                if (dateSortFilter === 'oldest') {
                    return dateA.getTime() - dateB.getTime(); // Oldest first
                } else {
                    return dateB.getTime() - dateA.getTime(); // Newest first
                }
            });
        }
        
        // Re-append items in sorted order
        items.forEach(item => container.appendChild(item));
    });
    
    // Count only devices that survive every active filter below.
    let eligibilityCount = 0;
    deviceItems.forEach(item => {
        // Type filter check
        const deviceType = item.getAttribute('data-device-type');
        const deviceStatus = item.getAttribute('data-device-status');
        let typeMatch = false;
        
        if (typeFilter === 'all') {
            typeMatch = true;
        } else if (typeFilter === 'REMOVED') {
            // DELETED devices are also treated as REMOVED
            typeMatch = deviceStatus === 'REMOVED' || deviceStatus === 'DELETED';
        } else {
            // Type-specific views contain active devices only. Removed/deleted
            // devices have their own dedicated filter.
            typeMatch = deviceType === typeFilter &&
                deviceStatus !== 'REMOVED' && deviceStatus !== 'DELETED';
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
            const deviceNumber = (item.getAttribute('data-device-number') || '').trim().toUpperCase();
            deviceNumberMatch = deviceNumber.includes(deviceNumberFilter);
        }
        
        // Show item only if all filters match
        if (typeMatch && violationMatch && eligibilityMatch && deviceNumberMatch) {
            item.style.display = '';
            if (eligibilityFilter !== 'all' && deviceStatus !== 'REMOVED' && deviceStatus !== 'DELETED') {
                eligibilityCount++;
            }
        } else {
            item.style.display = 'none';
        }
    });

    // Update the count after all filters have been combined.
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
    
    updateDeviceTypeSectionVisibility();
}

// Updated resetFilters to handle all the new filters
function resetFilters() {
    // Reset violations filter
    const violationsFilterBtn = document.getElementById('violationsFilterBtn');
    const violationsFilterText = document.getElementById('violationsFilterText');
    const deviceTypeFilterEl = document.getElementById('deviceTypeFilter');
    if (!violationsFilterBtn || !violationsFilterText || !deviceTypeFilterEl) return;

    violationsFilterBtn.setAttribute('data-filtering', 'false');
    violationsFilterText.textContent = 'Show Only Devices with Violations';
    violationsFilterBtn.style.background = 'var(--panel-bg)';
    violationsFilterBtn.style.color = 'var(--text-color)';
    violationsFilterBtn.style.width = '240px';
    
    // Reset type filter
    deviceTypeFilterEl.value = 'all';
    
    // Reset test eligibility filter
    if (document.getElementById('testEligibilityFilter')) {
        document.getElementById('testEligibilityFilter').value = 'all';
    }
    
    // Reset device number filter
    if (document.getElementById('deviceNumberFilter')) {
        document.getElementById('deviceNumberFilter').value = '';
    }
    
    // Reset date sort filter
    if (document.getElementById('dateSortFilter')) {
        document.getElementById('dateSortFilter').value = 'default';
    }
    
    // Reset count display
    const countElement = document.getElementById('testEligibilityCount');
    if (countElement) {
        countElement.textContent = '';
    }
    
    // Hide the active filter status indicator
    const statusDiv = document.getElementById('activeFilterStatus');
    if (statusDiv) {
        statusDiv.style.display = 'none';
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
    window.sortByDateTested = sortByDateTested;
    window.getMostRecentDateFromDevice = getMostRecentDateFromDevice;
    window.applyAllFilters = applyAllFilters;
    window.resetFilters = resetFilters;
    window.setTestEligibilityFilterFromStatus = setTestEligibilityFilterFromStatus;
    window.updateActiveFilterStatus = updateActiveFilterStatus;
});
