// Theme switching functionality
function setTheme(theme) {
    // Remove existing theme classes
    document.documentElement.classList.remove('light-theme', 'dark-theme', 'system-theme');
    
    if (theme === 'light') {
        document.documentElement.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
    } else if (theme === 'dark') {
        document.documentElement.classList.add('dark-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        // System theme
        document.documentElement.classList.add('system-theme');
        localStorage.setItem('theme', 'system');
    }
    
    // Update dropdown selectors to match the current theme
    if (document.getElementById('themeSelect')) {
        document.getElementById('themeSelect').value = theme;
    }
}

// Initialize the theme as early as possible
const savedTheme = localStorage.getItem('theme') || 'system';
setTheme(savedTheme);

// Also check when DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Re-apply theme to ensure everything is properly styled
    const currentTheme = localStorage.getItem('theme') || 'system';
    setTheme(currentTheme);
    
    // Ensure themeSelect dropdown matches current theme
    if (document.getElementById('themeSelect')) {
        document.getElementById('themeSelect').value = currentTheme;
    }
});

// Listen for system theme changes
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        const currentTheme = localStorage.getItem('theme') || 'system';
        if (currentTheme === 'system') {
            // System theme changes are handled by CSS media query
            // This is just to force a re-render if needed
            document.documentElement.classList.remove('system-theme');
            setTimeout(() => {
                document.documentElement.classList.add('system-theme');
            }, 10);
        }
    });
}
