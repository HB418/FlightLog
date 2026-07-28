/* js/modals.js */

/**
 * Show a modal when no courses are available for selection.
 */
function showSelectCourseEmptyModal() {
  showGenericModal("You have no courses saved. Press 'New Course' to add one to the system.");
}

/**
 * Show a modal when no courses are available for deletion.
 */
function showDeleteCourseEmptyModal() {
  showGenericModal('You have no courses to delete.');
}
