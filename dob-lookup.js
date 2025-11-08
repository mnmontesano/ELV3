// DOB Now Device Lookup Functionality

// Function to handle DOB Now device lookup automation
function openDOBNowDeviceLookup(deviceNumber, binNumber = null) {
    if (!deviceNumber) {
        alert('Device number is required for DOB lookup');
        return;
    }

    try {
        // Open DOB NOW in a new window
        const dobWindow = window.open('https://a810-dobnow.nyc.gov/publish/Index.html#!/', '_blank');
        
        if (!dobWindow) {
            alert("Please allow pop-ups to use the DOB lookup feature");
            return;
        }

        // Store device info for potential automation
        window.dobLookupData = {
            deviceNumber: deviceNumber,
            binNumber: binNumber,
            timestamp: Date.now()
        };

        // Optional: Try to communicate with the DOB window after it loads
        // This is limited by cross-origin restrictions, but we can try
        setTimeout(() => {
            try {
                dobWindow.postMessage({
                    type: 'DEVICE_LOOKUP',
                    deviceNumber: deviceNumber,
                    binNumber: binNumber
                }, 'https://a810-dobnow.nyc.gov');
            } catch (error) {
                // Cross-origin communication not available, user will need to search manually
            }
        }, 3000);

        // Show a helpful message to the user
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--panel-bg);
            color: var(--text-color);
            padding: 15px 20px;
            border-radius: 8px;
            border: 1px solid var(--input-border);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 350px;
            font-size: 14px;
            line-height: 1.4;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <strong style="color: var(--header-color);">DOB Now Opened</strong>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: var(--text-color); cursor: pointer; font-size: 18px; padding: 0; margin-left: 10px;">&times;</button>
            </div>
            <div>Device #${deviceNumber} lookup initiated.</div>
            ${binNumber ? `<div>BIN: ${binNumber}</div>` : ''}
            <div style="margin-top: 8px; font-size: 12px; opacity: 0.8;">
                Search for the device number in the DOB Now portal to find permits and related information.
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove notification after 8 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 8000);

    } catch (error) {
        console.error('DOB lookup failed:', error);
        alert('Failed to open DOB Now. Please try again or visit the site manually.');
    }
}

// Function to open DOB public website with device number lookup
function openDOBPublicDeviceLookup(deviceNumber) {
    if (!deviceNumber) {
        alert('Device number is required for DOB lookup');
        return;
    }

    try {
        // Open DOB BIS (Buildings Information System) device lookup page
        // This is the public DOB website for device lookups
        const dobUrl = `https://a810-bisweb.nyc.gov/bisweb/DeviceQueryByNumberServlet?devnum=${encodeURIComponent(deviceNumber)}`;
        window.open(dobUrl, '_blank');
    } catch (error) {
        console.error('DOB public lookup failed:', error);
        alert('Failed to open DOB public website. Please try again or visit the site manually.');
    }
}

// Function to create a DOB public website lookup button
function createDOBPublicLookupButton(deviceNumber, size = 'small') {
    if (!deviceNumber) return '';
    
    const buttonSize = size === 'large' ? '24px' : '18px';
    const iconSize = size === 'large' ? '14px' : '12px';
    const padding = size === 'large' ? '8px 12px' : '6px 8px';
    
    // Escape single quotes and other special characters for use in HTML attributes
    const escapedDeviceNumber = String(deviceNumber).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    return `
        <button onclick="openDOBPublicDeviceLookup('${escapedDeviceNumber}')" 
                title="Look up device #${escapedDeviceNumber} on DOB public website"
                style="background: #28a745; color: white; border: none; border-radius: 4px; 
                       cursor: pointer; padding: ${padding}; margin-left: 8px; 
                       display: inline-flex; align-items: center; gap: 4px; 
                       font-size: 12px; transition: all 0.2s ease; height: ${buttonSize};
                       white-space: nowrap;">
            <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z"/>
            </svg>
            DOB Site
        </button>
    `;
}

// Function to create a DOB lookup button
function createDOBLookupButton(deviceNumber, binNumber = null, size = 'small') {
    const buttonSize = size === 'large' ? '24px' : '18px';
    const iconSize = size === 'large' ? '14px' : '12px';
    const padding = size === 'large' ? '8px 12px' : '6px 8px';
    
    return `
        <button onclick="openDOBNowDeviceLookup('${deviceNumber}'${binNumber ? `, '${binNumber}'` : ''})" 
                title="Look up device #${deviceNumber} on DOB Now"
                style="background: #4a9eff; color: white; border: none; border-radius: 4px; 
                       cursor: pointer; padding: ${padding}; margin-left: 8px; 
                       display: inline-flex; align-items: center; gap: 4px; 
                       font-size: 12px; transition: all 0.2s ease; height: ${buttonSize};">
            <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z"/>
            </svg>
            DOB
        </button>
    `;
} 