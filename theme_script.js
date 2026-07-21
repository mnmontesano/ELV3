// Theme switching functionality
function setTheme(theme) {
    const normalized = (theme === 'light' || theme === 'dark' || theme === 'system') ? theme : 'system';

    // Remove existing theme classes
    document.documentElement.classList.remove('light-theme', 'dark-theme', 'system-theme');

    if (normalized === 'light') {
        document.documentElement.classList.add('light-theme');
    } else if (normalized === 'dark') {
        document.documentElement.classList.add('dark-theme');
    } else {
        document.documentElement.classList.add('system-theme');
    }

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
        if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch (e) {}
    return 'system';
}

// Initialize the theme as early as possible from the user's saved preference
setTheme(getSavedTheme());

// Also check when DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    setTheme(getSavedTheme());
});

// Listen for system theme changes when Automatic is selected
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getSavedTheme() === 'system') {
            // Force CSS to re-evaluate system preference
            document.documentElement.classList.remove('system-theme');
            setTimeout(() => {
                document.documentElement.classList.add('system-theme');
            }, 10);
        }
    });
}
