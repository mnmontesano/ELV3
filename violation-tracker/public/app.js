/**
 * DOB Violation Tracker - Frontend Application
 */

// API Base URL
const API_BASE = '/api';

// State
let buildings = [];
let violations = [];
let categories = [];
let elv3Inspections = [];
let checkStatus = {};
let lookupMode = 'bin'; // 'bin', 'device', or 'multi'
let foundBin = null; // Store BIN found from device lookup
let selectedCategoryFilter = 'all';
let buildingSearchTerm = '';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    
    // Refresh data every 30 seconds
    setInterval(loadDashboard, 30000);
});

/**
 * Load all dashboard data
 */
async function loadDashboard() {
    try {
        await Promise.all([
            loadCategories(),
            loadBuildings(),
            loadViolations(),
            loadCheckStatus(),
            loadHistory(),
            loadELV3Inspections()
        ]);
        updateStats();
        updateAlertBanner();
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

/**
 * Load categories list
 */
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE}/categories`);
        const data = await response.json();
        categories = data.categories || [];
        updateCategorySelects();
    } catch (error) {
        console.error('Failed to load categories:', error);
        categories = [];
    }
}

/**
 * Update all category select dropdowns
 */
function updateCategorySelects() {
    // Update the filter dropdown
    const filterSelect = document.getElementById('categoryFilter');
    if (filterSelect) {
        const currentValue = filterSelect.value;
        filterSelect.innerHTML = `
            <option value="all">All Buildings</option>
            <option value="uncategorized">Uncategorized</option>
            ${categories.map(c => `<option value="${c.id}">${c.name} (${c.building_count})</option>`).join('')}
        `;
        filterSelect.value = currentValue;
    }
    
    // Update the add building category dropdown
    const categorySelect = document.getElementById('categorySelect');
    if (categorySelect) {
        const currentValue = categorySelect.value;
        categorySelect.innerHTML = `
            <option value="">No Category</option>
            ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        `;
        if (currentValue) categorySelect.value = currentValue;
    }
}

/**
 * Load buildings list
 */
async function loadBuildings() {
    try {
        const response = await fetch(`${API_BASE}/buildings`);
        buildings = await response.json();
        renderBuildings();
    } catch (error) {
        console.error('Failed to load buildings:', error);
        document.getElementById('buildingsList').innerHTML = 
            '<div class="error-message">Failed to load buildings</div>';
    }
}

/**
 * Render buildings list
 */
function renderBuildings() {
    const container = document.getElementById('buildingsList');
    
    // Filter buildings based on selected category
    let filteredBuildings = buildings;
    if (selectedCategoryFilter === 'uncategorized') {
        filteredBuildings = buildings.filter(b => !b.category_id);
    } else if (selectedCategoryFilter !== 'all') {
        filteredBuildings = buildings.filter(b => b.category_id == selectedCategoryFilter);
    }
    
    // Apply search filter
    if (buildingSearchTerm) {
        filteredBuildings = filteredBuildings.filter(b => {
            const nickname = (b.nickname || '').toLowerCase();
            const address = (b.address || '').toLowerCase();
            const bin = (b.bin || '').toLowerCase();
            const categoryName = (b.category_name || '').toLowerCase();
            
            return nickname.includes(buildingSearchTerm) ||
                   address.includes(buildingSearchTerm) ||
                   bin.includes(buildingSearchTerm) ||
                   categoryName.includes(buildingSearchTerm);
        });
    }
    
    if (buildings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏢</div>
                <h3>No Buildings Yet</h3>
                <p>Add a building to start monitoring for violations</p>
                <button class="btn btn-primary" onclick="showAddBuildingModal()">+ Add Building</button>
            </div>
        `;
        return;
    }
    
    if (filteredBuildings.length === 0) {
        const message = buildingSearchTerm 
            ? `No buildings match "${buildingSearchTerm}"`
            : 'No buildings match the selected filter';
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <h3>No Buildings Found</h3>
                <p>${message}</p>
            </div>
        `;
        return;
    }
    
    // Group buildings by category if showing all
    if (selectedCategoryFilter === 'all') {
        // Group by category
        const grouped = {};
        const uncategorized = [];
        
        filteredBuildings.forEach(building => {
            if (building.category_id) {
                if (!grouped[building.category_id]) {
                    grouped[building.category_id] = {
                        name: building.category_name,
                        color: building.category_color,
                        buildings: []
                    };
                }
                grouped[building.category_id].buildings.push(building);
            } else {
                uncategorized.push(building);
            }
        });
        
        let html = '';
        
        // Render categorized buildings
        Object.keys(grouped).forEach(categoryId => {
            const group = grouped[categoryId];
            html += `
                <div class="category-group">
                    <div class="category-group-header">
                        <span class="category-color-dot" style="background: ${group.color}"></span>
                        <h3>${group.name}</h3>
                        <span class="category-group-count">${group.buildings.length} building${group.buildings.length !== 1 ? 's' : ''}</span>
                    </div>
                    ${group.buildings.map(building => renderBuildingItem(building)).join('')}
                </div>
            `;
        });
        
        // Render uncategorized
        if (uncategorized.length > 0) {
            html += `
                <div class="category-group">
                    <div class="category-group-header">
                        <span class="category-color-dot" style="background: #6b7280"></span>
                        <h3>Uncategorized</h3>
                        <span class="category-group-count">${uncategorized.length} building${uncategorized.length !== 1 ? 's' : ''}</span>
                    </div>
                    ${uncategorized.map(building => renderBuildingItem(building)).join('')}
                </div>
            `;
        }
        
        container.innerHTML = html;
    } else {
        // Just render the filtered list
        container.innerHTML = filteredBuildings.map(building => renderBuildingItem(building)).join('');
    }
}

/**
 * Render a single building item
 */
function renderBuildingItem(building) {
    const categoryBadge = building.category_name 
        ? `<span class="building-category-badge" style="background: ${building.category_color}20; color: ${building.category_color}; border: 1px solid ${building.category_color}">${building.category_name}</span>`
        : '';
    
    return `
        <div class="building-item ${building.new_violation_count > 0 ? 'has-new-violations' : ''}" 
             onclick="showBuildingDetails('${building.bin}')">
            <div class="building-header">
                <div>
                    <div class="building-name">${building.nickname || building.address || 'Building'}</div>
                    <div class="building-bin">BIN: ${building.bin}</div>
                    ${categoryBadge}
                </div>
            </div>
            ${building.address && building.nickname ? `<div class="building-address">${building.address}</div>` : ''}
            <div class="building-stats">
                <div class="building-stat">
                    <span>📦</span> ${building.device_count} device${building.device_count !== 1 ? 's' : ''}
                </div>
                <div class="building-stat ${building.new_violation_count > 0 ? 'warning' : ''}">
                    <span>⚠️</span> ${building.new_violation_count} new
                </div>
                <div class="building-stat">
                    <span>📋</span> ${building.violation_count} total
                </div>
            </div>
        </div>
    `;
}

/**
 * Filter buildings by category
 */
function filterBuildingsByCategory() {
    selectedCategoryFilter = document.getElementById('categoryFilter').value;
    renderBuildings();
}

/**
 * Search buildings by name, address, or BIN
 */
function searchBuildings() {
    buildingSearchTerm = document.getElementById('buildingSearch').value.toLowerCase().trim();
    renderBuildings();
}

/**
 * Load violations
 */
async function loadViolations() {
    const container = document.getElementById('violationsList');
    
    try {
        const filter = document.getElementById('violationFilter')?.value || 'new';
        let url = `${API_BASE}/violations`;
        
        if (filter === 'new') {
            url = `${API_BASE}/violations/new`;
        } else if (filter === 'unacknowledged') {
            url += '?acknowledged=false';
        } else if (filter === 'acknowledged') {
            url += '?acknowledged=true';
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        violations = await response.json();
        updateYearFilter();
        renderViolations();
    } catch (error) {
        console.error('Failed to load violations:', error);
        violations = [];
        if (container) {
            container.innerHTML = `
                <div class="error-message" style="text-align: center; padding: 20px;">
                    <p>Failed to load violations</p>
                    <small style="color: var(--text-muted);">${error.message}</small>
                    <br><br>
                    <button class="btn btn-small btn-secondary" onclick="loadViolations()">Retry</button>
                </div>
            `;
        }
    }
}

/**
 * Update year filter dropdown based on available violations
 */
function updateYearFilter() {
    const yearSelect = document.getElementById('yearFilter');
    if (!yearSelect) return;
    
    const currentValue = yearSelect.value;
    
    // Extract unique years from violations
    const years = new Set();
    violations.forEach(v => {
        if (v.issue_date) {
            const year = new Date(v.issue_date).getFullYear();
            if (!isNaN(year)) {
                years.add(year);
            }
        }
    });
    
    // Sort years descending (newest first)
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    
    // Build options
    yearSelect.innerHTML = `
        <option value="all">All Years</option>
        ${sortedYears.map(year => `<option value="${year}">${year}</option>`).join('')}
    `;
    
    // Restore previous selection if still valid
    if (currentValue && (currentValue === 'all' || sortedYears.includes(parseInt(currentValue)))) {
        yearSelect.value = currentValue;
    }
}

/**
 * Get year from a violation's issue date
 */
function getViolationYear(violation) {
    if (!violation.issue_date) return null;
    const year = new Date(violation.issue_date).getFullYear();
    return isNaN(year) ? null : year;
}

/**
 * Render violations list
 */
function renderViolations() {
    const container = document.getElementById('violationsList');
    const filter = document.getElementById('violationFilter')?.value || 'new';
    const yearFilter = document.getElementById('yearFilter')?.value || 'all';
    
    // Filter violations by year if a specific year is selected
    let filteredViolations = violations;
    if (yearFilter !== 'all') {
        const selectedYear = parseInt(yearFilter);
        filteredViolations = violations.filter(v => getViolationYear(v) === selectedYear);
    }
    
    if (filteredViolations.length === 0) {
        let emptyTitle = 'No Violations';
        let emptyMessage = 'No violations found for monitored buildings';
        
        if (filter === 'new') {
            emptyTitle = 'No New Violations';
            emptyMessage = 'All violations have been acknowledged';
        } else if (filter === 'unacknowledged') {
            emptyTitle = 'No Unacknowledged Violations';
            emptyMessage = 'All violations have been acknowledged';
        } else if (filter === 'acknowledged') {
            emptyTitle = 'No Acknowledged Violations';
            emptyMessage = 'You haven\'t acknowledged any violations yet';
        }
        
        if (yearFilter !== 'all') {
            emptyMessage = `No violations found for ${yearFilter}`;
        }
        
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">✅</div>
                <h3>${emptyTitle}</h3>
                <p>${emptyMessage}</p>
            </div>
        `;
        return;
    }
    
    // Group violations by year (newest to oldest)
    const violationsByYear = {};
    filteredViolations.forEach(v => {
        const year = getViolationYear(v) || 'Unknown';
        if (!violationsByYear[year]) {
            violationsByYear[year] = [];
        }
        violationsByYear[year].push(v);
    });
    
    // Sort years descending (newest first), with 'Unknown' at the end
    const sortedYears = Object.keys(violationsByYear).sort((a, b) => {
        if (a === 'Unknown') return 1;
        if (b === 'Unknown') return -1;
        return parseInt(b) - parseInt(a);
    });
    
    // Render grouped violations
    let html = '';
    sortedYears.forEach(year => {
        const yearViolations = violationsByYear[year];
        html += `
            <div class="year-group">
                <div class="year-group-header">
                    <h3>${year}</h3>
                    <span class="year-group-count">${yearViolations.length} violation${yearViolations.length !== 1 ? 's' : ''}</span>
                </div>
                ${yearViolations.map(v => renderViolationItem(v)).join('')}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

/**
 * Render a single violation item
 */
function renderViolationItem(v) {
    return `
        <div class="violation-item ${v.is_new && !v.acknowledged ? 'is-new' : ''}">
            <div class="violation-header">
                <div>
                    <div class="violation-number">${v.violation_number || 'Unknown'}</div>
                    <span class="violation-type ${(v.violation_type || '').toLowerCase()}">${v.violation_type || 'Unknown'}</span>
                </div>
                <div class="violation-date">${formatDate(v.issue_date)}</div>
            </div>
            <div class="violation-description">${v.description || 'No description available'}</div>
            <div class="violation-meta">
                <div>
                    <span title="Device">${v.device_number || 'N/A'}</span>
                    ${v.address ? ` • ${v.address}` : ''}
                    ${v.nickname ? ` (${v.nickname})` : ''}
                </div>
                <div class="violation-actions">
                    ${!v.acknowledged ? `<button class="btn btn-small btn-secondary" onclick="acknowledgeViolation(${v.id}, event)">Acknowledge</button>` : `<button class="btn btn-small btn-secondary" onclick="unacknowledgeViolation(${v.id}, event)">Undo</button>`}
                </div>
            </div>
        </div>
    `;
}

/**
 * Filter violations
 */
function filterViolations() {
    loadViolations();
}

/**
 * Load check status
 */
async function loadCheckStatus() {
    try {
        const response = await fetch(`${API_BASE}/checks/status`);
        checkStatus = await response.json();
        updateStatusIndicator();
        
        // Update interval selector
        const intervalSelect = document.getElementById('intervalSelect');
        if (intervalSelect && checkStatus.scheduler) {
            intervalSelect.value = checkStatus.scheduler.interval_hours;
        }
    } catch (error) {
        console.error('Failed to load check status:', error);
    }
}

/**
 * Update status indicator
 */
function updateStatusIndicator() {
    const lastCheckText = document.getElementById('lastCheckText');
    
    let statusText = '';
    
    if (checkStatus.last_check) {
        const lastCheck = new Date(checkStatus.last_check);
        statusText = `Last: ${formatTimeAgo(lastCheck)}`;
    } else {
        statusText = 'No checks yet';
    }
    
    // Show next scheduled check time
    if (checkStatus.scheduler && checkStatus.scheduler.next_check) {
        const nextCheck = new Date(checkStatus.scheduler.next_check);
        const nextCheckTime = nextCheck.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            timeZone: 'America/New_York'
        });
        statusText += ` • Next: ${nextCheckTime}`;
    }
    
    lastCheckText.textContent = statusText;
}

/**
 * Load check history
 */
async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE}/checks/history?limit=10`);
        const history = await response.json();
        renderHistory(history);
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

/**
 * Render check history
 */
function renderHistory(history) {
    const container = document.getElementById('historyList');
    
    if (!history || history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No checks have been run yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = history.map(h => `
        <div class="history-item">
            <div class="history-time">${formatDateTime(h.checked_at)}</div>
            <div class="history-stats">
                <span class="history-stat">${h.buildings_checked} building${h.buildings_checked !== 1 ? 's' : ''}</span>
                <span class="history-stat">${h.devices_checked} device${h.devices_checked !== 1 ? 's' : ''}</span>
                <span class="history-stat ${h.new_violations_found > 0 ? 'new-found' : ''}">${h.new_violations_found} new</span>
            </div>
            <span class="history-status ${h.status === 'success' ? 'success' : 'error'}">${h.status}</span>
        </div>
    `).join('');
}

/**
 * Update stats cards
 */
function updateStats() {
    document.getElementById('buildingCount').textContent = buildings.length;
    
    const totalDevices = buildings.reduce((sum, b) => sum + (b.device_count || 0), 0);
    document.getElementById('deviceCount').textContent = totalDevices;
    
    const newViolations = buildings.reduce((sum, b) => sum + (b.new_violation_count || 0), 0);
    document.getElementById('newViolationCount').textContent = newViolations;
    
    const totalViolations = buildings.reduce((sum, b) => sum + (b.violation_count || 0), 0);
    document.getElementById('totalViolationCount').textContent = totalViolations;
}

/**
 * Update alert banner
 */
function updateAlertBanner() {
    const banner = document.getElementById('alertBanner');
    const alertText = document.getElementById('alertText');
    const newCount = buildings.reduce((sum, b) => sum + (b.new_violation_count || 0), 0);
    
    if (newCount > 0) {
        banner.style.display = 'flex';
        alertText.textContent = `You have ${newCount} new violation${newCount !== 1 ? 's' : ''}!`;
    } else {
        banner.style.display = 'none';
    }
}

/**
 * Show new violations
 */
function showNewViolations() {
    document.getElementById('violationFilter').value = 'new';
    loadViolations();
    document.querySelector('.violations-panel').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Run manual check with progress bar
 */
async function runManualCheck() {
    const btn = document.getElementById('checkNowBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressPercentage = document.getElementById('progressPercentage');
    const progressStatus = document.getElementById('progressStatus');
    
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Checking...';
    
    // Show progress bar
    if (progressContainer) {
        progressContainer.classList.add('active');
        progressBar.style.width = '0%';
        progressPercentage.textContent = '0%';
        progressStatus.innerHTML = 'Preparing to check buildings...';
        
        // Scroll to progress bar
        progressContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // Try SSE first, fall back to regular POST if it fails
    let useSSE = true;
    let result = null;
    
    try {
        // Test if SSE endpoint is available by attempting connection
        const eventSource = new EventSource(`${API_BASE}/checks/run-stream`);
        
        await new Promise((resolve, reject) => {
            let connected = false;
            
            // Timeout for initial connection
            const connectionTimeout = setTimeout(() => {
                if (!connected) {
                    eventSource.close();
                    reject(new Error('SSE_TIMEOUT'));
                }
            }, 5000);
            
            eventSource.addEventListener('connected', () => {
                connected = true;
                clearTimeout(connectionTimeout);
            });
            
            eventSource.addEventListener('progress', (event) => {
                connected = true;
                clearTimeout(connectionTimeout);
                
                const progress = JSON.parse(event.data);
                
                if (progressContainer) {
                    // Update progress bar
                    progressBar.style.width = `${progress.percentage}%`;
                    progressPercentage.textContent = `${progress.percentage}%`;
                    
                    // Format time estimate
                    const timeEstimate = formatTimeEstimate(progress.estimatedSecondsRemaining);
                    
                    // Update status text
                    if (progress.status === 'starting') {
                        const initialEstimate = progress.estimatedSecondsRemaining ? ` — Est. ${formatTimeEstimate(progress.estimatedSecondsRemaining)}` : '';
                        progressStatus.innerHTML = `Checking ${progress.total} building${progress.total !== 1 ? 's' : ''}...${initialEstimate}`;
                    } else if (progress.status === 'checking' && progress.currentBuilding) {
                        const buildingName = progress.currentBuilding.nickname || progress.currentBuilding.address || 'Building';
                        const timeText = timeEstimate ? `<span class="time-estimate">~${timeEstimate} remaining</span>` : '';
                        progressStatus.innerHTML = `
                            Checking <span class="building-name">${buildingName}</span>
                            <span class="building-bin">(BIN: ${progress.currentBuilding.bin})</span>
                            — ${progress.current + 1} of ${progress.total}
                            ${timeText}
                        `;
                    } else if (progress.status === 'completing') {
                        progressStatus.innerHTML = 'Finalizing results...';
                    }
                }
            });
            
            eventSource.addEventListener('complete', (event) => {
                result = JSON.parse(event.data);
                eventSource.close();
                resolve();
            });
            
            eventSource.addEventListener('error', (event) => {
                clearTimeout(connectionTimeout);
                eventSource.close();
                if (event.data) {
                    const error = JSON.parse(event.data);
                    reject(new Error(error.error || 'Check failed'));
                } else if (!connected) {
                    reject(new Error('SSE_FAILED'));
                } else {
                    reject(new Error('Connection lost'));
                }
            });
            
            // Handle connection errors
            eventSource.onerror = () => {
                clearTimeout(connectionTimeout);
                if (eventSource.readyState === EventSource.CLOSED || eventSource.readyState === EventSource.CONNECTING) {
                    eventSource.close();
                    if (!connected && !result) {
                        reject(new Error('SSE_FAILED'));
                    } else if (!result) {
                        reject(new Error('Connection closed unexpectedly'));
                    }
                }
            };
        });
        
    } catch (error) {
        // If SSE failed to connect, fall back to regular POST
        if (error.message === 'SSE_FAILED' || error.message === 'SSE_TIMEOUT') {
            console.log('SSE not available, falling back to regular check...');
            useSSE = false;
            
            if (progressContainer) {
                progressStatus.innerHTML = 'Checking violations (please wait)...';
                progressBar.style.width = '50%';
            }
            
            try {
                const response = await fetch(`${API_BASE}/checks/run`, { method: 'POST' });
                result = await response.json();
            } catch (fetchError) {
                console.error('Fallback check failed:', fetchError);
                throw fetchError;
            }
        } else {
            throw error;
        }
    }
    
    // Handle successful result
    if (result) {
        if (progressContainer) {
            // Show completion state
            progressBar.style.width = '100%';
            progressPercentage.textContent = '100%';
            progressStatus.innerHTML = `
                <span class="progress-complete">
                    <span class="check-icon">✓</span>
                    Check complete! Found ${result.new_violations_found} new violation${result.new_violations_found !== 1 ? 's' : ''}.
                </span>
            `;
        }
        
        // Reload dashboard to show new data
        await loadDashboard();
        
        // Hide progress bar after a delay
        if (progressContainer) {
            setTimeout(() => {
                progressContainer.classList.remove('active');
            }, 3000);
        }
    }
    
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🔄</span> Check Now';
}

/**
 * Legacy run manual check (fallback without progress)
 */
async function runManualCheckFallback() {
    const btn = document.getElementById('checkNowBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Checking...';
    
    try {
        const response = await fetch(`${API_BASE}/checks/run`, { method: 'POST' });
        const result = await response.json();
        
        // Reload dashboard to show new data
        await loadDashboard();
        
        // Show result
        if (result.new_violations_found > 0) {
            alert(`Check complete! Found ${result.new_violations_found} new violation(s).`);
        } else {
            alert('Check complete. No new violations found.');
        }
    } catch (error) {
        console.error('Manual check failed:', error);
        alert('Check failed. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">🔄</span> Check Now';
    }
}

/**
 * Update check interval
 */
async function updateInterval() {
    const hours = parseInt(document.getElementById('intervalSelect').value);
    
    try {
        await fetch(`${API_BASE}/checks/interval`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hours })
        });
    } catch (error) {
        console.error('Failed to update interval:', error);
        alert('Failed to update check interval');
    }
}

/**
 * Acknowledge a violation
 */
async function acknowledgeViolation(id, event) {
    event.stopPropagation();
    
    try {
        await fetch(`${API_BASE}/violations/${id}/acknowledge`, { method: 'POST' });
        await loadDashboard();
    } catch (error) {
        console.error('Failed to acknowledge violation:', error);
        alert('Failed to acknowledge violation');
    }
}

/**
 * Acknowledge all violations
 */
async function acknowledgeAll() {
    if (!confirm('Acknowledge all violations?')) return;
    
    try {
        await fetch(`${API_BASE}/violations/acknowledge-all`, { method: 'POST' });
        await loadDashboard();
    } catch (error) {
        console.error('Failed to acknowledge all:', error);
        alert('Failed to acknowledge violations');
    }
}

/**
 * Show add building modal
 */
function showAddBuildingModal() {
    document.getElementById('addBuildingModal').style.display = 'flex';
    document.getElementById('binInput').value = '';
    document.getElementById('deviceInput').value = '';
    document.getElementById('nicknameInput').value = '';
    document.getElementById('multiBinInput').value = '';
    document.getElementById('buildingPreview').style.display = 'none';
    document.getElementById('multiBinResults').style.display = 'none';
    document.getElementById('addBuildingError').style.display = 'none';
    foundBin = null;
    
    // Reset to BIN mode
    setLookupMode('bin');
    document.getElementById('binInput').focus();
}

/**
 * Set lookup mode (bin, device, or multi)
 */
function setLookupMode(mode) {
    lookupMode = mode;
    foundBin = null;
    
    // Update toggle buttons
    document.getElementById('binToggle').classList.toggle('active', mode === 'bin');
    document.getElementById('deviceToggle').classList.toggle('active', mode === 'device');
    document.getElementById('multiToggle').classList.toggle('active', mode === 'multi');
    
    // Show/hide input groups
    document.getElementById('binInputGroup').style.display = mode === 'bin' ? 'block' : 'none';
    document.getElementById('deviceInputGroup').style.display = mode === 'device' ? 'block' : 'none';
    document.getElementById('multiInputGroup').style.display = mode === 'multi' ? 'block' : 'none';
    document.getElementById('singleNicknameGroup').style.display = mode === 'multi' ? 'none' : 'block';
    
    // Show/hide appropriate buttons
    document.getElementById('previewBtn').style.display = mode === 'multi' ? 'none' : 'inline-flex';
    document.getElementById('addBuildingBtn').style.display = mode === 'multi' ? 'none' : 'inline-flex';
    document.getElementById('addMultiBtn').style.display = mode === 'multi' ? 'inline-flex' : 'none';
    
    // Clear preview and errors
    document.getElementById('buildingPreview').style.display = 'none';
    document.getElementById('multiBinResults').style.display = 'none';
    document.getElementById('addBuildingError').style.display = 'none';
    
    // Focus the appropriate input
    if (mode === 'bin') {
        document.getElementById('binInput').focus();
    } else if (mode === 'device') {
        document.getElementById('deviceInput').focus();
    } else {
        document.getElementById('multiBinInput').focus();
    }
}

/**
 * Close modal
 */
function closeModal() {
    document.getElementById('addBuildingModal').style.display = 'none';
    foundBin = null;
}

/**
 * Preview building before adding
 */
async function previewBuilding() {
    const errorDiv = document.getElementById('addBuildingError');
    const previewDiv = document.getElementById('buildingPreview');
    
    errorDiv.style.display = 'none';
    previewDiv.classList.remove('found-by-device');
    
    if (lookupMode === 'bin') {
        await previewByBin();
    } else {
        await previewByDevice();
    }
}

/**
 * Preview building by BIN number
 */
async function previewByBin() {
    const bin = document.getElementById('binInput').value.trim();
    const errorDiv = document.getElementById('addBuildingError');
    const previewDiv = document.getElementById('buildingPreview');
    
    if (!bin || bin.length !== 7) {
        errorDiv.textContent = 'Please enter a valid 7-digit BIN';
        errorDiv.style.display = 'block';
        return;
    }
    
    document.getElementById('previewContent').innerHTML = '<div class="loading">Loading...</div>';
    previewDiv.style.display = 'block';
    foundBin = null;
    
    try {
        const response = await fetch(`${API_BASE}/buildings/lookup/${bin}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to lookup building');
        }
        
        foundBin = bin;
        renderBuildingPreview(data, null);
    } catch (error) {
        document.getElementById('previewContent').innerHTML = '';
        previewDiv.style.display = 'none';
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    }
}

/**
 * Preview building by device number
 * Uses the same API pattern as index.html searchDeviceInLookup function (line 13539):
 * fetch(`https://data.cityofnewyork.us/resource/e5aq-a4j2.json?device_number=${deviceNumber.trim()}`)
 */
async function previewByDevice() {
    const deviceInput = document.getElementById('deviceInput');
    const deviceNumber = deviceInput.value.trim().toUpperCase();
    const errorDiv = document.getElementById('addBuildingError');
    const previewDiv = document.getElementById('buildingPreview');
    
    if (!deviceNumber || deviceNumber.length < 2) {
        errorDiv.textContent = 'Please enter a device number (e.g., 1P723)';
        errorDiv.style.display = 'block';
        previewDiv.style.display = 'none';
        return;
    }
    
    // Show loading state - similar to index.html pattern (line 13535)
    document.getElementById('previewContent').innerHTML = '<div class="loading">Searching device...</div>';
    previewDiv.style.display = 'block';
    previewDiv.classList.remove('found-by-device');
    errorDiv.style.display = 'none';
    foundBin = null;
    
    try {
        const response = await fetch(`${API_BASE}/buildings/device-lookup/${encodeURIComponent(deviceNumber)}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Device not found');
        }
        
        // Extract BIN from response - same pattern as index.html (line 13555)
        const binNumber = data.bin || null;
        
        if (!binNumber) {
            throw new Error('Device found but no BIN available');
        }
        
        // Store the found BIN for when user clicks Add
        foundBin = binNumber;
        previewDiv.classList.add('found-by-device');
        
        // Render the preview with device highlighted
        renderBuildingPreview(data, deviceNumber);
        
    } catch (error) {
        document.getElementById('previewContent').innerHTML = '';
        previewDiv.style.display = 'none';
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
        foundBin = null;
    }
}

/**
 * Render building preview content
 */
function renderBuildingPreview(data, searchedDevice) {
    const devices = data.devices || data.all_devices || [];
    const deviceCount = data.device_count || devices.length;
    
    let html = '';
    
    // Show device found highlight if searched by device
    if (searchedDevice) {
        html += `
            <div class="found-device-highlight">
                <div class="label">Device Found</div>
                <div class="value">${data.device_number || searchedDevice}</div>
            </div>
        `;
    }
    
    html += `
        <p><strong>BIN:</strong> ${data.bin}</p>
        <p><strong>Address:</strong> ${data.address || 'N/A'}</p>
        <p><strong>Borough:</strong> ${data.borough || 'N/A'}</p>
        <p><strong>Total Devices:</strong> ${deviceCount}</p>
        <div class="devices-grid">
            ${devices.slice(0, 6).map(d => `
                <div class="device-card ${d.device_number === (data.device_number || searchedDevice) ? 'highlighted' : ''}">
                    <div class="device-number">${d.device_number}</div>
                    <div class="device-type">${d.device_type}</div>
                    <div class="device-status ${d.device_status === 'ACTIVE' ? 'active' : 'inactive'}">${d.device_status}</div>
                </div>
            `).join('')}
            ${deviceCount > 6 ? `<div class="device-card" style="display: flex; align-items: center; justify-content: center;">+${deviceCount - 6} more</div>` : ''}
        </div>
    `;
    
    document.getElementById('previewContent').innerHTML = html;
}

/**
 * Add building
 */
async function addBuilding() {
    const nickname = document.getElementById('nicknameInput').value.trim();
    const errorDiv = document.getElementById('addBuildingError');
    const addBtn = document.getElementById('addBuildingBtn');
    
    // Get BIN either from input or from device lookup
    let bin;
    if (lookupMode === 'bin') {
        bin = document.getElementById('binInput').value.trim();
        if (!bin || bin.length !== 7) {
            errorDiv.textContent = 'Please enter a valid 7-digit BIN';
            errorDiv.style.display = 'block';
            return;
        }
    } else {
        // Device mode - if no foundBin yet, try to look it up automatically
        if (!foundBin) {
            const deviceNumber = document.getElementById('deviceInput').value.trim();
            if (!deviceNumber || deviceNumber.length < 2) {
                errorDiv.textContent = 'Please enter a device number';
                errorDiv.style.display = 'block';
                return;
            }
            
            // Auto-lookup the device
            addBtn.disabled = true;
            addBtn.textContent = 'Looking up device...';
            errorDiv.style.display = 'none';
            
            try {
                const response = await fetch(`${API_BASE}/buildings/device-lookup/${encodeURIComponent(deviceNumber.toUpperCase())}`);
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Device not found');
                }
                
                if (!data.bin) {
                    throw new Error('Device found but no BIN available');
                }
                
                foundBin = data.bin;
                
                // Show the preview so user knows what they're adding
                const previewDiv = document.getElementById('buildingPreview');
                previewDiv.style.display = 'block';
                previewDiv.classList.add('found-by-device');
                renderBuildingPreview(data, deviceNumber.toUpperCase());
                
            } catch (error) {
                addBtn.disabled = false;
                addBtn.textContent = 'Add Building';
                errorDiv.textContent = error.message;
                errorDiv.style.display = 'block';
                return;
            }
        }
        bin = foundBin;
    }
    
    addBtn.disabled = true;
    addBtn.textContent = 'Adding...';
    errorDiv.style.display = 'none';
    
    // Get selected category
    const categorySelect = document.getElementById('categorySelect');
    const category_id = categorySelect && categorySelect.value ? parseInt(categorySelect.value) : null;
    
    try {
        const response = await fetch(`${API_BASE}/buildings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bin, nickname, category_id })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to add building');
        }
        
        closeModal();
        await loadDashboard();
        
        // Show success message
        alert(`Building added! Found ${data.devices_found} device(s) and ${data.existing_violations} existing violation(s).`);
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    } finally {
        addBtn.disabled = false;
        addBtn.textContent = 'Add Building';
    }
}

// Store current building details for expanding violations
let currentBuildingDetails = null;
let showAllViolations = false;

/**
 * Show building details
 */
async function showBuildingDetails(bin) {
    const modal = document.getElementById('buildingDetailsModal');
    const title = document.getElementById('buildingDetailsTitle');
    const content = document.getElementById('buildingDetailsContent');
    const removeBtn = document.getElementById('removeBuildingBtn');
    
    modal.style.display = 'flex';
    content.innerHTML = '<div class="loading">Loading...</div>';
    showAllViolations = false; // Reset when opening modal
    
    try {
        const response = await fetch(`${API_BASE}/buildings/${bin}`);
        const building = await response.json();
        
        currentBuildingDetails = building; // Store for later use
        title.textContent = building.nickname || building.address || `Building ${bin}`;
        
        renderBuildingDetailsContent(building);
        
        removeBtn.onclick = () => removeBuilding(bin);
    } catch (error) {
        content.innerHTML = `<div class="error-message">Failed to load building details: ${error.message}</div>`;
    }
}

/**
 * Render building details content
 */
function renderBuildingDetailsContent(building) {
    const content = document.getElementById('buildingDetailsContent');
    
    // Build category options
    const categoryOptions = categories.map(c => 
        `<option value="${c.id}" ${building.category_id == c.id ? 'selected' : ''}>${c.name}</option>`
    ).join('');
    
    // Determine how many violations to show
    const initialLimit = 10;
    const totalViolations = building.violations.length;
    const violationsToShow = showAllViolations ? building.violations : building.violations.slice(0, initialLimit);
    const hasMore = totalViolations > initialLimit;
    
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <p><strong>BIN:</strong> ${building.bin}</p>
            <p><strong>Address:</strong> ${building.address || 'N/A'}</p>
            ${building.nickname ? `<p><strong>Nickname:</strong> ${building.nickname}</p>` : ''}
            <p><strong>Added:</strong> ${formatDateTime(building.created_at)}</p>
            <div style="margin-top: 12px;">
                <label style="display: block; margin-bottom: 6px; font-weight: 500; color: var(--text-secondary);">Category:</label>
                <select id="buildingCategorySelect" onchange="updateBuildingCategory('${building.bin}', this.value)" style="width: 100%; max-width: 250px; padding: 8px 12px; border-radius: var(--radius); border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary);">
                    <option value="">No Category</option>
                    ${categoryOptions}
                </select>
            </div>
        </div>
        
        <h4>Devices (${building.devices.length})</h4>
        <div class="devices-grid">
            ${building.devices.map(d => `
                <div class="device-card">
                    <div class="device-number">${d.device_number}</div>
                    <div class="device-type">${d.device_type}</div>
                    <div class="device-status ${d.device_status === 'ACTIVE' ? 'active' : 'inactive'}">${d.device_status}</div>
                </div>
            `).join('')}
        </div>
        
        <h4 style="margin-top: 20px;">Violations (${totalViolations})</h4>
        <div class="violations-list" style="max-height: ${showAllViolations ? '500px' : '300px'}; overflow-y: auto;">
            ${totalViolations === 0 ? '<p style="color: var(--text-muted);">No violations found</p>' : 
            violationsToShow.map(v => `
                <div class="violation-item ${v.is_new && !v.acknowledged ? 'is-new' : ''}">
                    <div class="violation-header">
                        <div class="violation-number">${v.violation_number || 'Unknown'}</div>
                        <span class="violation-type ${(v.violation_type || '').toLowerCase()}">${v.violation_type || 'Unknown'}</span>
                    </div>
                    <div class="violation-description">${v.description || 'No description'}</div>
                    <div class="violation-meta">
                        <span>${v.device_number} • ${formatDate(v.issue_date)}</span>
                    </div>
                </div>
            `).join('')}
        </div>
        ${hasMore ? `
            <div style="text-align: center; margin-top: 12px;">
                ${showAllViolations 
                    ? `<button class="btn btn-small btn-secondary" onclick="toggleBuildingViolations()">Show Less</button>`
                    : `<button class="btn btn-small btn-secondary" onclick="toggleBuildingViolations()">Show All ${totalViolations} Violations</button>`
                }
            </div>
        ` : ''}
    `;
}

/**
 * Toggle showing all violations in building details
 */
function toggleBuildingViolations() {
    showAllViolations = !showAllViolations;
    if (currentBuildingDetails) {
        renderBuildingDetailsContent(currentBuildingDetails);
    }
}

/**
 * Close building details modal
 */
function closeBuildingDetails() {
    document.getElementById('buildingDetailsModal').style.display = 'none';
}

/**
 * Remove building
 */
async function removeBuilding(bin) {
    if (!confirm('Remove this building from monitoring? This will delete all stored violations for this building.')) {
        return;
    }
    
    try {
        await fetch(`${API_BASE}/buildings/${bin}`, { method: 'DELETE' });
        closeBuildingDetails();
        await loadDashboard();
    } catch (error) {
        console.error('Failed to remove building:', error);
        alert('Failed to remove building');
    }
}

/**
 * Add multiple buildings at once
 */
async function addMultipleBuildings() {
    const textarea = document.getElementById('multiBinInput');
    const resultsDiv = document.getElementById('multiBinResults');
    const resultsContent = document.getElementById('multiBinResultsContent');
    const errorDiv = document.getElementById('addBuildingError');
    const addBtn = document.getElementById('addMultiBtn');
    
    // Parse BINs from textarea (comma or newline separated)
    const input = textarea.value.trim();
    if (!input) {
        errorDiv.textContent = 'Please enter at least one BIN number';
        errorDiv.style.display = 'block';
        return;
    }
    
    // Split by comma or newline and clean up
    const bins = input
        .split(/[,\n]+/)
        .map(b => b.trim())
        .filter(b => b.length > 0);
    
    // Validate BINs
    const validBins = [];
    const invalidBins = [];
    
    bins.forEach(bin => {
        if (/^\d{7}$/.test(bin)) {
            validBins.push(bin);
        } else {
            invalidBins.push(bin);
        }
    });
    
    if (validBins.length === 0) {
        errorDiv.textContent = 'No valid BIN numbers found. BINs must be exactly 7 digits.';
        errorDiv.style.display = 'block';
        return;
    }
    
    errorDiv.style.display = 'none';
    addBtn.disabled = true;
    addBtn.textContent = 'Adding...';
    
    // Show results area
    resultsDiv.style.display = 'block';
    resultsContent.innerHTML = '<div class="loading">Processing buildings...</div>';
    
    const results = {
        success: [],
        failed: [],
        skipped: []
    };
    
    // Process each BIN
    for (let i = 0; i < validBins.length; i++) {
        const bin = validBins[i];
        
        // Update progress
        resultsContent.innerHTML = `<div class="loading">Processing ${i + 1} of ${validBins.length}: BIN ${bin}...</div>`;
        
        try {
            const response = await fetch(`${API_BASE}/buildings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bin, nickname: null })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                results.success.push({
                    bin,
                    address: data.building?.address || 'Unknown',
                    devices: data.devices_found || 0,
                    violations: data.existing_violations || 0
                });
            } else if (data.error && data.error.includes('already')) {
                results.skipped.push({ bin, reason: 'Already monitored' });
            } else {
                results.failed.push({ bin, reason: data.error || 'Unknown error' });
            }
        } catch (error) {
            results.failed.push({ bin, reason: error.message });
        }
        
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Show final results
    let html = '';
    
    if (results.success.length > 0) {
        html += `<div style="margin-bottom: 12px;">
            <strong style="color: var(--accent-success);">Successfully Added (${results.success.length}):</strong>
            <ul style="margin: 8px 0; padding-left: 20px;">
                ${results.success.map(r => `<li>${r.bin} - ${r.address} (${r.devices} devices, ${r.violations} violations)</li>`).join('')}
            </ul>
        </div>`;
    }
    
    if (results.skipped.length > 0) {
        html += `<div style="margin-bottom: 12px;">
            <strong style="color: var(--accent-warning);">Skipped (${results.skipped.length}):</strong>
            <ul style="margin: 8px 0; padding-left: 20px;">
                ${results.skipped.map(r => `<li>${r.bin} - ${r.reason}</li>`).join('')}
            </ul>
        </div>`;
    }
    
    if (results.failed.length > 0) {
        html += `<div style="margin-bottom: 12px;">
            <strong style="color: var(--accent-danger);">Failed (${results.failed.length}):</strong>
            <ul style="margin: 8px 0; padding-left: 20px;">
                ${results.failed.map(r => `<li>${r.bin} - ${r.reason}</li>`).join('')}
            </ul>
        </div>`;
    }
    
    if (invalidBins.length > 0) {
        html += `<div style="margin-bottom: 12px;">
            <strong style="color: var(--text-muted);">Invalid BINs (${invalidBins.length}):</strong>
            <ul style="margin: 8px 0; padding-left: 20px;">
                ${invalidBins.map(b => `<li>${b} - Not a valid 7-digit BIN</li>`).join('')}
            </ul>
        </div>`;
    }
    
    resultsContent.innerHTML = html;
    
    addBtn.disabled = false;
    addBtn.textContent = 'Add All Buildings';
    
    // Refresh dashboard
    await loadDashboard();
    
    // If all successful, show close prompt
    if (results.success.length > 0 && results.failed.length === 0) {
        setTimeout(() => {
            if (confirm(`Successfully added ${results.success.length} building(s). Close this dialog?`)) {
                closeModal();
            }
        }, 500);
    }
}

// ============================================
// ELV3 Inspection Functions
// ============================================

/**
 * Load ELV3 inspections
 */
async function loadELV3Inspections() {
    try {
        const response = await fetch(`${API_BASE}/elv3/inspections`);
        elv3Inspections = await response.json();
        renderELV3Inspections();
    } catch (error) {
        console.error('Failed to load ELV3 inspections:', error);
        document.getElementById('elv3List').innerHTML = 
            '<div class="error-message">Failed to load inspections</div>';
    }
}

/**
 * Render ELV3 inspections list
 */
function renderELV3Inspections() {
    const container = document.getElementById('elv3List');
    
    if (elv3Inspections.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📄</div>
                <h3>No ELV3 Inspections</h3>
                <p>Upload an ELV3 form to track field inspection violations</p>
                <button class="btn btn-primary" onclick="showUploadELV3Modal()">📄 Upload ELV3</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = elv3Inspections.map(inspection => `
        <div class="elv3-item" onclick="showELV3Details(${inspection.id})">
            <div class="elv3-item-header">
                <div class="elv3-item-title">${inspection.building_nickname || inspection.address || `BIN: ${inspection.bin}`}</div>
                <div class="elv3-item-date">${formatDate(inspection.uploaded_at)}</div>
            </div>
            ${inspection.address ? `<div class="elv3-item-address">${inspection.address}</div>` : ''}
            <div class="elv3-item-stats">
                <div class="elv3-item-stat">
                    <span>📄</span> ${inspection.filename || 'ELV3 Form'}
                </div>
                <div class="elv3-item-stat ${inspection.violation_count > 0 ? 'has-violations' : ''}">
                    <span>⚠️</span> ${inspection.violation_count || 0} violation${inspection.violation_count !== 1 ? 's' : ''}
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Show upload ELV3 modal
 */
function showUploadELV3Modal() {
    document.getElementById('uploadELV3Modal').style.display = 'flex';
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadResult').style.display = 'none';
    document.getElementById('uploadError').style.display = 'none';
    
    // Setup drag and drop
    const uploadArea = document.getElementById('uploadArea');
    uploadArea.style.display = 'block';
    
    uploadArea.onclick = () => document.getElementById('elv3FileInput').click();
    
    uploadArea.ondragover = (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    };
    
    uploadArea.ondragleave = () => {
        uploadArea.classList.remove('drag-over');
    };
    
    uploadArea.ondrop = (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            showPdfPreview(files[0]);
            uploadELV3File(files[0]);
        } else {
            document.getElementById('uploadError').textContent = 'Please upload a PDF file';
            document.getElementById('uploadError').style.display = 'block';
        }
    };
}

/**
 * Close upload ELV3 modal
 */
function closeUploadELV3Modal() {
    document.getElementById('uploadELV3Modal').style.display = 'none';
    
    // Reset the PDF preview
    const previewPanel = document.getElementById('pdfPreviewPanel');
    const previewFrame = document.getElementById('pdfPreviewFrame');
    
    // Revoke the object URL to free memory
    if (previewFrame.src && previewFrame.src.startsWith('blob:')) {
        URL.revokeObjectURL(previewFrame.src);
    }
    
    previewFrame.src = '';
    previewPanel.style.display = 'none';
    previewPanel.classList.remove('pdf-fullscreen');
    
    // Reset upload area visibility
    document.getElementById('uploadArea').style.display = 'block';
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadResult').style.display = 'none';
    document.getElementById('uploadError').style.display = 'none';
}

/**
 * Handle file selection
 */
function handleELV3FileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        showPdfPreview(file);
        uploadELV3File(file);
    }
}

/**
 * Show PDF preview in the right panel
 */
function showPdfPreview(file) {
    const previewPanel = document.getElementById('pdfPreviewPanel');
    const previewFrame = document.getElementById('pdfPreviewFrame');
    
    // Create a URL for the PDF file
    const fileUrl = URL.createObjectURL(file);
    
    // Set the iframe source to display the PDF
    previewFrame.src = fileUrl;
    
    // Show the preview panel
    previewPanel.style.display = 'flex';
}

/**
 * Toggle PDF fullscreen mode
 */
function togglePdfFullscreen() {
    const previewPanel = document.getElementById('pdfPreviewPanel');
    previewPanel.classList.toggle('pdf-fullscreen');
    
    const btn = previewPanel.querySelector('button');
    if (previewPanel.classList.contains('pdf-fullscreen')) {
        btn.textContent = '✕ Exit Fullscreen';
    } else {
        btn.textContent = '⛶ Fullscreen';
    }
}

/**
 * Upload ELV3 PDF file
 */
async function uploadELV3File(file) {
    const uploadArea = document.getElementById('uploadArea');
    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('uploadProgressFill');
    const statusText = document.getElementById('uploadStatusText');
    const resultDiv = document.getElementById('uploadResult');
    const errorDiv = document.getElementById('uploadError');
    
    // Hide upload area, show progress
    uploadArea.style.display = 'none';
    progressDiv.style.display = 'block';
    resultDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    
    // Show indeterminate progress
    progressFill.classList.add('indeterminate');
    statusText.textContent = 'Parsing ELV3 form...';
    
    try {
        const formData = new FormData();
        formData.append('pdf', file);
        
        const response = await fetch(`${API_BASE}/elv3/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        progressFill.classList.remove('indeterminate');
        progressDiv.style.display = 'none';
        
        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }
        
        // Show success result
        resultDiv.style.display = 'block';
        resultDiv.classList.remove('error');
        
        // Group violations by device for display
        const violationsByDevice = data.violationsByDevice || {};
        const devicesWithViolationsCount = Object.keys(violationsByDevice).length;
        const satisfactoryDevices = data.satisfactoryDevices || [];
        const totalDevices = data.devices_found || 0;
        
        let resultHtml = `
            <h4>✓ Upload Successful</h4>
            <div class="upload-result-details">
                <p><strong>Building:</strong> ${data.address || `BIN: ${data.bin}`}</p>
                <p><strong>BIN:</strong> ${data.bin}</p>
                ${data.building_added ? '<p><em>Building was automatically added to monitoring</em></p>' : ''}
                <p><strong>Devices Scanned:</strong> ${totalDevices}</p>
                <p><strong>Devices with Violations:</strong> ${devicesWithViolationsCount}</p>
                <p><strong>Satisfactory Devices:</strong> ${satisfactoryDevices.length}</p>
                <p><strong>Total Violations:</strong> ${data.violations_added}</p>
            </div>
        `;
        
        resultHtml += `<div style="margin-top: 12px; max-height: 350px; overflow-y: auto;">`;
        
        // First show devices with violations
        if (data.violations && data.violations.length > 0) {
            resultHtml += `
                <h5 style="margin: 0 0 8px 0; color: var(--accent-danger);">⚠ Devices with Violations</h5>
                ${Object.entries(violationsByDevice).map(([deviceNumber, violations]) => `
                    <div class="elv3-device-group" style="margin-bottom: 12px;">
                        <div class="elv3-device-header" style="border-left: 3px solid var(--accent-danger);">
                            <span class="elv3-device-number">${deviceNumber}</span>
                            <span class="elv3-device-count">${violations.length} violation${violations.length > 1 ? 's' : ''}</span>
                        </div>
                        <div class="elv3-device-violations">
                            ${violations.map(v => `
                                <div class="elv3-violation-item" style="margin-bottom: 8px;">
                                    <div class="elv3-violation-codes" style="margin-bottom: 4px;">
                                        <span class="elv3-code-badge"><span class="code">${v.partCode}</span> Part</span>
                                        <span class="elv3-code-badge"><span class="code">${v.conditionCode}</span> Cond</span>
                                        <span class="elv3-code-badge"><span class="code">${v.remedyCode}</span> Remedy</span>
                                    </div>
                                    <div class="elv3-violation-part">${v.partDescription}</div>
                                    <div class="elv3-violation-details">${v.conditionDescription} → ${v.remedyDescription}</div>
                                    ${v.comments ? `<div class="elv3-violation-comment">"${v.comments}"</div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            `;
        }
        
        // Then show satisfactory devices
        if (satisfactoryDevices.length > 0) {
            resultHtml += `
                <h5 style="margin: 16px 0 8px 0; color: var(--accent-success);">✓ Satisfactory Devices</h5>
                <div class="satisfactory-devices-list">
                    ${satisfactoryDevices.map(device => `
                        <div class="satisfactory-device-item">
                            <span class="elv3-device-number">${device.deviceNumber}</span>
                            <span class="satisfactory-badge">✓ Satisfactory</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        resultHtml += `</div>`;
        
        document.getElementById('uploadResultContent').innerHTML = resultHtml;
        
        // Refresh the dashboard
        await loadDashboard();
        
    } catch (error) {
        progressFill.classList.remove('indeterminate');
        progressDiv.style.display = 'none';
        
        // Show error
        resultDiv.style.display = 'block';
        resultDiv.classList.add('error');
        document.getElementById('uploadResultContent').innerHTML = `
            <h4>✗ Upload Failed</h4>
            <div class="upload-result-details">
                <p>${error.message}</p>
            </div>
        `;
        
        // Show upload area again for retry
        setTimeout(() => {
            uploadArea.style.display = 'block';
        }, 2000);
    }
}

/**
 * Show ELV3 inspection details
 */
async function showELV3Details(inspectionId) {
    const modal = document.getElementById('elv3DetailsModal');
    const title = document.getElementById('elv3DetailsTitle');
    const content = document.getElementById('elv3DetailsContent');
    const deleteBtn = document.getElementById('deleteInspectionBtn');
    
    modal.style.display = 'flex';
    content.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/elv3/inspections/${inspectionId}`);
        const inspection = await response.json();
        
        title.textContent = inspection.building_nickname || inspection.address || `Inspection ${inspectionId}`;
        
        let violationsHtml = '';
        if (inspection.violations && inspection.violations.length > 0) {
            // Group violations by device
            const violationsByDevice = {};
            for (const v of inspection.violations) {
                const deviceNum = v.device_number;
                if (!violationsByDevice[deviceNum]) {
                    violationsByDevice[deviceNum] = [];
                }
                violationsByDevice[deviceNum].push(v);
            }
            
            // Build HTML grouped by device
            violationsHtml = Object.entries(violationsByDevice).map(([deviceNumber, violations]) => `
                <div class="elv3-device-group">
                    <div class="elv3-device-header">
                        <span class="elv3-device-number">${deviceNumber}</span>
                        <span class="elv3-device-count">${violations.length} violation${violations.length > 1 ? 's' : ''}</span>
                    </div>
                    <div class="elv3-device-violations">
                        ${violations.map(v => `
                            <div class="elv3-violation-item">
                                <div class="elv3-violation-codes">
                                    <span class="elv3-code-badge"><span class="code">${v.part_code}</span> Part</span>
                                    <span class="elv3-code-badge"><span class="code">${v.condition_code}</span> Cond</span>
                                    <span class="elv3-code-badge"><span class="code">${v.remedy_code}</span> Remedy</span>
                                </div>
                                <div class="elv3-violation-part">${v.part_description}</div>
                                <div class="elv3-violation-details">
                                    <strong>Condition:</strong> ${v.condition_description}<br>
                                    <strong>Remedy:</strong> ${v.remedy_description}
                                </div>
                                ${v.comments ? `<div class="elv3-violation-comment">"${v.comments}"</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        } else {
            violationsHtml = '<p style="color: var(--text-muted);">No violations recorded</p>';
        }
        
        const deviceCount = inspection.violations ? 
            new Set(inspection.violations.map(v => v.device_number)).size : 0;
        
        content.innerHTML = `
            <div style="margin-bottom: 20px;">
                <p><strong>BIN:</strong> ${inspection.bin || 'N/A'}</p>
                <p><strong>Address:</strong> ${inspection.address || 'N/A'}</p>
                <p><strong>Inspection Date:</strong> ${formatDate(inspection.inspection_date) || 'N/A'}</p>
                <p><strong>Uploaded:</strong> ${formatDateTime(inspection.uploaded_at)}</p>
                <p><strong>File:</strong> ${inspection.filename || 'N/A'}</p>
            </div>
            
            <h4>${deviceCount} Device${deviceCount !== 1 ? 's' : ''} with ${inspection.violations?.length || 0} Total Violation${inspection.violations?.length !== 1 ? 's' : ''}</h4>
            <div class="elv3-violations-list" style="max-height: 400px; overflow-y: auto;">
                ${violationsHtml}
            </div>
        `;
        
        deleteBtn.onclick = () => deleteELV3Inspection(inspectionId);
        
    } catch (error) {
        content.innerHTML = `<div class="error-message">Failed to load inspection: ${error.message}</div>`;
    }
}

/**
 * Close ELV3 details modal
 */
function closeELV3DetailsModal() {
    document.getElementById('elv3DetailsModal').style.display = 'none';
}

/**
 * Delete ELV3 inspection
 */
async function deleteELV3Inspection(inspectionId) {
    if (!confirm('Delete this inspection and all its violations? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/elv3/inspections/${inspectionId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Delete failed');
        }
        
        closeELV3DetailsModal();
        await loadELV3Inspections();
        
    } catch (error) {
        alert('Failed to delete inspection: ' + error.message);
    }
}

// ============================================
// Category Management Functions
// ============================================

/**
 * Show manage categories modal
 */
function showManageCategoriesModal() {
    document.getElementById('manageCategoriesModal').style.display = 'flex';
    document.getElementById('newCategoryName').value = '';
    document.getElementById('newCategoryColor').value = '#3b82f6';
    renderCategoriesList();
}

/**
 * Close manage categories modal
 */
function closeManageCategoriesModal() {
    document.getElementById('manageCategoriesModal').style.display = 'none';
}

/**
 * Render categories list in manage modal
 */
function renderCategoriesList() {
    const container = document.getElementById('categoriesList');
    
    if (categories.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <p>No categories yet. Create one above!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = categories.map(category => `
        <div class="category-item" onclick="showEditCategoryModal(${category.id})">
            <span class="category-color-dot" style="background: ${category.color}"></span>
            <div class="category-info">
                <div class="category-name">${category.name}</div>
                <div class="category-count">${category.building_count} building${category.building_count !== 1 ? 's' : ''}</div>
            </div>
        </div>
    `).join('');
}

/**
 * Create a new category
 */
async function createCategory() {
    const nameInput = document.getElementById('newCategoryName');
    const colorInput = document.getElementById('newCategoryColor');
    const name = nameInput.value.trim();
    const color = colorInput.value;
    
    if (!name) {
        alert('Please enter a category name');
        nameInput.focus();
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to create category');
        }
        
        // Clear input and refresh
        nameInput.value = '';
        await loadCategories();
        renderCategoriesList();
    } catch (error) {
        alert(error.message);
    }
}

/**
 * Show quick add category (from add building modal)
 */
function showQuickAddCategory() {
    const name = prompt('Enter category name:');
    if (!name || !name.trim()) return;
    
    fetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color: '#3b82f6' })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            loadCategories().then(() => {
                // Select the newly created category
                const categorySelect = document.getElementById('categorySelect');
                if (categorySelect && data.category) {
                    categorySelect.value = data.category.id;
                }
            });
        }
    })
    .catch(error => alert(error.message));
}

/**
 * Show edit category modal
 */
function showEditCategoryModal(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    
    document.getElementById('editCategoryId').value = categoryId;
    document.getElementById('editCategoryName').value = category.name;
    document.getElementById('editCategoryColor').value = category.color;
    document.getElementById('editCategoryError').style.display = 'none';
    document.getElementById('editCategoryModal').style.display = 'flex';
}

/**
 * Close edit category modal
 */
function closeEditCategoryModal() {
    document.getElementById('editCategoryModal').style.display = 'none';
}

/**
 * Save category changes
 */
async function saveCategory() {
    const id = document.getElementById('editCategoryId').value;
    const name = document.getElementById('editCategoryName').value.trim();
    const color = document.getElementById('editCategoryColor').value;
    const errorDiv = document.getElementById('editCategoryError');
    
    if (!name) {
        errorDiv.textContent = 'Category name is required';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/categories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to update category');
        }
        
        closeEditCategoryModal();
        await loadCategories();
        await loadBuildings(); // Refresh to show updated category names
        renderCategoriesList();
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    }
}

/**
 * Delete category
 */
async function deleteCategory() {
    const id = document.getElementById('editCategoryId').value;
    const category = categories.find(c => c.id == id);
    
    if (!category) return;
    
    const buildingCount = category.building_count || 0;
    const message = buildingCount > 0
        ? `Delete "${category.name}"? ${buildingCount} building(s) will become uncategorized.`
        : `Delete "${category.name}"?`;
    
    if (!confirm(message)) return;
    
    try {
        const response = await fetch(`${API_BASE}/categories/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete category');
        }
        
        closeEditCategoryModal();
        await loadCategories();
        await loadBuildings(); // Refresh to update building categories
        renderCategoriesList();
    } catch (error) {
        alert(error.message);
    }
}

/**
 * Update building category
 */
async function updateBuildingCategory(bin, categoryId) {
    try {
        const response = await fetch(`${API_BASE}/buildings/${bin}/category`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category_id: categoryId || null })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update category');
        }
        
        await loadBuildings();
        await loadCategories();
    } catch (error) {
        alert(error.message);
    }
}

// ============================================
// Utility functions
// ============================================

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    // Ensure dateStr is a string
    const str = String(dateStr);
    // For date-only strings (YYYY-MM-DD), parse directly - no timezone conversion needed
    // For datetime strings, treat as UTC
    let normalizedStr = str;
    if (str.includes(' ') && !str.endsWith('Z') && !str.includes('+')) {
        // SQLite datetime format: "YYYY-MM-DD HH:MM:SS" - convert to ISO format with UTC indicator
        normalizedStr = str.replace(' ', 'T') + 'Z';
    }
    const date = new Date(normalizedStr);
    if (isNaN(date.getTime())) return str; // Return original if parsing fails
    return date.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    // Ensure dateStr is a string
    const str = String(dateStr);
    // SQLite stores timestamps in UTC without timezone info - treat as UTC by appending 'Z' if needed
    let normalizedStr = str;
    if (str.includes(' ') && !str.endsWith('Z') && !str.includes('+')) {
        // SQLite datetime format: "YYYY-MM-DD HH:MM:SS" - convert to ISO format with UTC indicator
        normalizedStr = str.replace(' ', 'T') + 'Z';
    }
    const date = new Date(normalizedStr);
    if (isNaN(date.getTime())) return str; // Return original if parsing fails
    return date.toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

function formatTimeEstimate(seconds) {
    if (seconds === null || seconds === undefined) return null;
    if (seconds < 1) return 'less than a second';
    if (seconds === 1) return '1 second';
    if (seconds < 60) return `${seconds} seconds`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes === 1) {
        return remainingSeconds > 0 ? `1 min ${remainingSeconds} sec` : '1 minute';
    }
    if (minutes < 60) {
        return remainingSeconds > 0 ? `${minutes} min ${remainingSeconds} sec` : `${minutes} minutes`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours === 1) {
        return remainingMinutes > 0 ? `1 hr ${remainingMinutes} min` : '1 hour';
    }
    return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hours`;
}

// Close modals on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closeBuildingDetails();
        closeManageCategoriesModal();
        closeEditCategoryModal();
        closeUploadELV3Modal();
        closeELV3DetailsModal();
    }
});

// Add Enter key support for inputs
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const target = e.target;
        
        // BIN input - add building directly
        if (target.id === 'binInput') {
            e.preventDefault();
            addBuilding();
        }
        
        // Device input - preview first, then add
        if (target.id === 'deviceInput') {
            e.preventDefault();
            previewBuilding();
        }
        
        // Nickname input - add building
        if (target.id === 'nicknameInput') {
            e.preventDefault();
            addBuilding();
        }
    }
});

// Close modals on outside click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        const modalId = e.target.id;
        if (modalId === 'addBuildingModal') {
            closeModal();
        } else if (modalId === 'buildingDetailsModal') {
            closeBuildingDetails();
        } else if (modalId === 'manageCategoriesModal') {
            closeManageCategoriesModal();
        } else if (modalId === 'editCategoryModal') {
            closeEditCategoryModal();
        } else if (modalId === 'uploadELV3Modal') {
            closeUploadELV3Modal();
        } else if (modalId === 'elv3DetailsModal') {
            closeELV3DetailsModal();
        }
    }
});
