/* js/modals.js */

/**
 * Utility to create and display a modal dialog specific to FlightLog.
 * @param {string} title - Modal header text
 * @param {string} message - Modal body HTML content
 * @returns {HTMLElement} The modal content element
 */
function createFlightLogModal(title, message) {
  // Remove existing overlay if present
  const existing = document.querySelector('.flightlog-modal-overlay');
  if (existing) document.body.removeChild(existing);

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'flightlog-modal-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.background = 'rgba(0,0,0,0.5)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '1000';

  // Create content wrapper
  const content = document.createElement('div');
  content.className = 'flightlog-modal-content';
  // Inline styles to ensure visibility
  content.style.backgroundColor = document.body.classList.contains('dark-mode') ? '#222' : '#fff';
  content.style.color = document.body.classList.contains('dark-mode') ? '#fff' : '#000';
  content.style.border = '2px solid #F2B705';
  content.style.borderRadius = '8px';
  content.style.padding = '16px';
  content.style.maxWidth = '400px';
  content.style.width = '90%';
  content.style.boxSizing = 'border-box';

  // Header
  const header = document.createElement('h2');
  header.textContent = title;
  header.style.margin = '0 0 8px';

  // Body
  const body = document.createElement('div');
  body.innerHTML = message;
  body.style.marginBottom = '16px';

  // Footer with OK button
  const footer = document.createElement('div');
  footer.style.textAlign = 'right';

  const okBtn = document.createElement('button');
  okBtn.textContent = 'OK';
  okBtn.style.padding = '8px 16px';
  okBtn.style.border = 'none';
  okBtn.style.cursor = 'pointer';
  okBtn.addEventListener('click', () => document.body.removeChild(overlay));

  footer.appendChild(okBtn);
  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(footer);
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  return content;
}

/**
 * Show a modal when no courses are available for selection.
 */
function showSelectCourseEmptyModal() {
  createFlightLogModal(
    'No Courses Available',
    "You have no courses saved. Press 'New Course' to add one to the system."
  );
}

/**
 * Show a modal when no courses are available for deletion.
 */
function showDeleteCourseEmptyModal() {
  createFlightLogModal(
    'No Courses to Delete',
    'You have no courses to delete.'
  );
}

// Attach event listeners after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('select-course-btn')?.addEventListener('click', e => {
    const select = document.getElementById('course-select');
    if (!select || select.options.length === 0) {
      e.preventDefault();
      showSelectCourseEmptyModal();
    }
  });

  document.getElementById('delete-course-btn')?.addEventListener('click', e => {
    const select = document.getElementById('course-select');
    if (!select || select.options.length === 0) {
      e.preventDefault();
      showDeleteCourseEmptyModal();
    }
  });
});
