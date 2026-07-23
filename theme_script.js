// Theme switching functionality
function getSystemThemeFallback() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function setTheme(theme) {
    const normalized = (theme === 'light' || theme === 'dark') ? theme : getSystemThemeFallback();

    // Remove existing theme classes
    document.documentElement.classList.remove('light-theme', 'dark-theme', 'system-theme');
    document.documentElement.classList.add(normalized + '-theme');
    delete document.documentElement.dataset.resolvedTheme;
    document.documentElement.style.colorScheme = normalized;

    try {
        localStorage.setItem('theme', normalized);
    } catch (e) {}

    // Update dropdown selectors to match the current theme
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.value = normalized;
    }
}

function getSavedTheme() {
    try {
        const saved = localStorage.getItem('theme');
        if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}
    return getSystemThemeFallback();
}

// Initialize the theme as early as possible from the user's saved preference
setTheme(getSavedTheme());

// Also check when DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    setTheme(getSavedTheme());
});
