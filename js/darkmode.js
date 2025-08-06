
document.addEventListener('DOMContentLoaded', function() {
    const darkModeToggle = document.getElementById('lock-toggle');
    const body = document.body;

    // On page load, set mode based on localStorage
    const savedMode = localStorage.getItem('flightlog-color-mode');
    if (savedMode === 'dark') {
        body.classList.add('dark-mode');
        if (darkModeToggle) darkModeToggle.checked = true;
    } else {
        body.classList.remove('dark-mode');
        if (darkModeToggle) darkModeToggle.checked = false;
    }

    // Listen for toggle changes and save preference
    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', function() {
            if (this.checked) {
                body.classList.add('dark-mode');
                localStorage.setItem('flightlog-color-mode', 'dark');
            } else {
                body.classList.remove('dark-mode');
                localStorage.setItem('flightlog-color-mode', 'light');
            }
        });
    }
});
