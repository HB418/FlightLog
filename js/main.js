/* js/main.js
   Shared bootstrap: button wiring (DOMContentLoaded), generic modal
   helpers, and the course-list popup. Everything else has been split
   into map-icons.js, course-wizard.js, admin-panel.js, and round.js. */

let pendingConfirmCallback = null;
let pendingCancelCallback = null;
let selectedCourseListId = null; // currently-selected course row in the course-list-modal
let courseListMode = 'select';   // 'select' | 'delete' | 'putt-practice' — what the course-list-modal does when you pick a course
let courseSelectionMode = false; // true while picking courses to remove (Remove button was pressed)
let selectedCourseIds = new Set();
let courseListSearchQuery = ''; // live text typed into the course list's search bar

document.addEventListener('DOMContentLoaded', function () {
  seedStockCourses().then(loadCourseOptions);

  // Show "Continue Round" if a round was saved (accidental close, or
  // getting bumped out via Log Out/Admin/Delete Course) and hasn't been
  // finished or explicitly canceled yet.
  if (loadInProgressRound()) {
    document.getElementById('continue-round-row')?.classList.remove('hide');
  }
  document.getElementById('continue-round-btn')?.addEventListener('click', () => {
    document.getElementById('continue-round-row')?.classList.add('hide');
    resumeInProgressRound();
  });

  document.getElementById('start-round-btn')?.addEventListener('click', () => openCourseListModal('select'));
  document.getElementById('add-course-btn')?.addEventListener('click', openNewCourseModeChoice);
  document.getElementById('nc-mode-all-at-once-btn')?.addEventListener('click', handleNcModeAllAtOnce);
  document.getElementById('nc-mode-as-you-play-btn')?.addEventListener('click', handleNcModeAsYouPlay);
  document.getElementById('nc-mode-choice-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('new-course-mode-choice-modal').classList.remove('active');
  });
  document.getElementById('ayp-info-next-btn')?.addEventListener('click', handleAypInfoNext);
  document.getElementById('ayp-info-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('ayp-info-modal').classList.remove('active');
  });
  document.getElementById('ayp-close-btn')?.addEventListener('click', handleAypClose);
  document.getElementById('ayp-mark-tee-btn')?.addEventListener('click', handleAypMarkTee);
  document.getElementById('ayp-mark-basket-btn')?.addEventListener('click', handleAypMarkBasket);
  document.getElementById('ayp-tee-rotation')?.addEventListener('input', handleAypTeeRotationInput);
  document.getElementById('ayp-confirm-tee-btn')?.addEventListener('click', handleAypConfirmTee);
  document.getElementById('ayp-submit-score-btn')?.addEventListener('click', handleAypSubmitScore);
  document.getElementById('ayp-hole-complete-next-btn')?.addEventListener('click', handleAypHoleCompleteNext);
  document.getElementById('ayp-finish-btn')?.addEventListener('click', () => {
    if (aypHoles.length === 0) {
      showGenericModal('Mark and score at least one hole before finishing.');
      return;
    }
    savingFlowIsAyp = true;
    document.getElementById('save-visibility-modal').classList.add('active');
  });
  document.getElementById('ayp-course-address')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAypInfoNext();
  });
  document.getElementById('ayp-course-location')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAypInfoNext();
  });
  document.getElementById('field-work-btn')?.addEventListener('click', openFieldWorkChoiceModal);
  document.getElementById('putt-practice-btn')?.addEventListener('click', openPuttingAreaChoiceModal);
  document.getElementById('add-disc-btn')?.addEventListener('click', openAddDiscSearchModal);

  ['header-map-main-tees-toggle', 'map-zoom-main-tees-toggle'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      mainTeesVisible = e.target.checked;
      applyTeeVisibilityToAllMaps();
    });
  });
  ['header-map-second-tees-toggle', 'map-zoom-second-tees-toggle'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      secondTeesVisible = e.target.checked;
      applyTeeVisibilityToAllMaps();
    });
  });
  document.getElementById('admin-map-entry-btn')?.addEventListener('click', openAdminPanel);
  document.getElementById('admin-panel-close-btn')?.addEventListener('click', closeAdminPanel);
  document.getElementById('admin-new-course-btn')?.addEventListener('click', () => openAdminEditor(null));
  document.getElementById('admin-editor-back-btn')?.addEventListener('click', () => {
    document.getElementById('admin-editor-screen').classList.add('hide');
    document.getElementById('admin-list-screen').classList.remove('hide');
    if (adminMap) { adminMap.remove(); adminMap = null; }
    adminHoleMarkers = {};
    renderAdminCourseList();
  });
  document.getElementById('admin-hole-count')?.addEventListener('change', () => generateAdminHoleFields());
  document.getElementById('admin-secondary-holes-toggle')?.addEventListener('change', (e) => {
    e.target.dataset.userSet = 'true';
    // Just toggles visibility rather than regenerating the whole hole
    // list, so it doesn't discard any length/par values already typed
    // in but not yet saved.
    document.querySelectorAll('#admin-holes-container .admin-hole-row-b').forEach(el => {
      el.classList.toggle('hide', !e.target.checked);
    });
    document.querySelectorAll('#admin-holes-container .admin-hole-label[data-role="main"]').forEach(el => {
      el.textContent = e.target.checked ? (el.dataset.holeNumber + 'A') : el.dataset.holeNumber;
    });
  });
  document.getElementById('admin-save-course-btn')?.addEventListener('click', saveAdminCourse);
  document.getElementById('admin-save-progress-btn')?.addEventListener('click', saveAdminCourseProgress);
  document.getElementById('admin-undo-btn')?.addEventListener('click', handleAdminUndo);
  document.getElementById('admin-save-to-stock-btn')?.addEventListener('click', exportAdminCourseToStock);
  document.getElementById('admin-course-logo-input')?.addEventListener('change', handleAdminLogoFileSelected);
  document.getElementById('admin-remove-logo-btn')?.addEventListener('click', () => {
    adminEditingLogoDataUrl = null;
    document.getElementById('admin-course-logo-preview').classList.add('hide');
    document.getElementById('admin-course-logo-input').value = '';
    document.getElementById('admin-remove-logo-btn').classList.add('hide');
  });

  document.getElementById('admin-find-location-btn')?.addEventListener('click', handleAdminFindLocation);
  ['admin-course-address', 'admin-course-location'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleAdminFindLocation(); }
    });
  });

  document.getElementById('admin-ref-image-opacity')?.addEventListener('input', (e) => {
    document.getElementById('admin-ref-image-overlay').style.opacity = e.target.value / 100;
  });
  document.getElementById('admin-lock-map-checkbox')?.addEventListener('change', (e) => {
    setAdminMapLocked(e.target.checked);
  });
  document.getElementById('admin-lock-numbers-checkbox')?.addEventListener('change', (e) => {
    setAdminNumbersLocked(e.target.checked);
  });
  document.getElementById('admin-remove-ref-image-btn')?.addEventListener('click', () => {
    const overlay = document.getElementById('admin-ref-image-overlay');
    overlay.src = '';
    overlay.classList.add('hide');
    document.getElementById('admin-remove-ref-image-btn').classList.add('hide');
  });

  // Scale the reference image with the mouse wheel instead of a slider —
  // while the real map is locked (so scrolling doesn't also zoom it) AND
  // the reference itself isn't locked (frozen in place).
  document.getElementById('admin-map-wrapper')?.addEventListener('wheel', (e) => {
    const lockCheckbox = document.getElementById('admin-lock-map-checkbox');
    const refLockCheckbox = document.getElementById('admin-lock-ref-checkbox');
    const overlay = document.getElementById('admin-ref-image-overlay');
    if (!lockCheckbox || !lockCheckbox.checked || (refLockCheckbox && refLockCheckbox.checked) || overlay.classList.contains('hide')) return;
    e.preventDefault();
    adminRefImageScale += (e.deltaY < 0 ? 0.05 : -0.05);
    adminRefImageScale = Math.max(0.1, Math.min(5, adminRefImageScale));
    applyRefImageTransform();
  }, { passive: false });

  // Drag the reference image to reposition it — only while the real map
  // is locked AND the reference itself isn't locked. "Lock reference" lets
  // you freeze the image in place so markers can be dragged freely with
  // zero chance of also nudging the reference. Attached to the wrapper
  // (not the overlay itself) so the overlay's pointer-events can stay
  // 'none' permanently, guaranteeing clicks always reach the real map
  // for Set Tee/Basket/Waypoint. A small movement threshold distinguishes
  // an actual drag from a plain click.
  (function setupAdminRefImageDrag() {
    const wrapper = document.getElementById('admin-map-wrapper');
    if (!wrapper) return;
    let tracking = false;
    let dragging = false;
    let startX = 0, startY = 0, startOffsetX = 0, startOffsetY = 0;
    const DRAG_THRESHOLD = 4;

    wrapper.addEventListener('mousedown', (e) => {
      const lockCheckbox = document.getElementById('admin-lock-map-checkbox');
      const refLockCheckbox = document.getElementById('admin-lock-ref-checkbox');
      const overlay = document.getElementById('admin-ref-image-overlay');
      if (!lockCheckbox || !lockCheckbox.checked || (refLockCheckbox && refLockCheckbox.checked) || overlay.classList.contains('hide')) return;
      // Don't hijack drags that started on a real Leaflet marker (tee/
      // basket/waypoint pin) — those need to keep using Leaflet's own
      // dragging so you can still reposition markers while locked.
      if (e.target.closest('.leaflet-marker-icon, .leaflet-marker-shadow')) return;
      tracking = true;
      dragging = false;
      startX = e.clientX;
      startY = e.clientY;
      startOffsetX = adminRefImageOffsetX;
      startOffsetY = adminRefImageOffsetY;
    });
    document.addEventListener('mousemove', (e) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        dragging = true;
        document.getElementById('admin-ref-image-overlay').style.cursor = 'grabbing';
      }
      if (dragging) {
        adminRefImageOffsetX = startOffsetX + dx;
        adminRefImageOffsetY = startOffsetY + dy;
        applyRefImageTransform();
      }
    });
    document.addEventListener('mouseup', () => {
      tracking = false;
      dragging = false;
      const lockCheckbox = document.getElementById('admin-lock-map-checkbox');
      const overlay = document.getElementById('admin-ref-image-overlay');
      overlay.style.cursor = (lockCheckbox && lockCheckbox.checked) ? 'grab' : 'default';
    });
  })();

  // Paste an image (e.g. a UDisc screenshot copied to the clipboard)
  // straight into the reference overlay — only while the admin editor is
  // actually open, so pasting elsewhere in the app isn't hijacked.
  document.addEventListener('paste', (e) => {
    const editorScreen = document.getElementById('admin-editor-screen');
    if (!editorScreen || editorScreen.classList.contains('hide')) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          loadAdminRefImageFile(file);
        }
        break;
      }
    }
  });

  document.getElementById('admin-action-select')?.addEventListener('change', (e) => {
    const action = e.target.value;
    e.target.value = ''; // reset to the placeholder so the same or another action can be picked again

    if (adminSelectedHole == null) { showGenericModal('Check a hole first.'); return; }
    const holeData = adminHoleMarkers[adminSelectedHole];

    if (action === 'setTee') {
      adminArmedAction = { holeNumber: adminSelectedHole, kind: 'tee' };
      showGenericModal('Click the map to place/move the tee for Hole ' + adminSelectedHole + '.');

    } else if (action === 'setBasket') {
      adminArmedAction = { holeNumber: adminSelectedHole, kind: 'basket' };
      showGenericModal('Click the map to place/move the basket for Hole ' + adminSelectedHole + '.');

    } else if (action === 'setSecondTee') {
      if (!holeData || !holeData.teeMarker || !holeData.basketMarker) {
        showGenericModal('Set the main tee and basket for this hole first.');
        return;
      }
      adminArmedAction = { holeNumber: adminSelectedHole, kind: 'secondTee' };
      showGenericModal('Click the map to place/move the 2nd tee for Hole ' + adminSelectedHole + '. This is optional, for courses with an alternate layout.');

    } else if (action === 'setSecondBasket') {
      if (!holeData || !holeData.teeMarker || !holeData.basketMarker) {
        showGenericModal('Set the main tee and basket for this hole first.');
        return;
      }
      adminArmedAction = { holeNumber: adminSelectedHole, kind: 'secondBasket' };
      showGenericModal('Click the map to place/move the 2nd basket for Hole ' + adminSelectedHole + '. This is optional, for courses with an alternate layout.');

    } else if (action === 'addWaypoint') {
      adminArmedAction = { holeNumber: adminSelectedHole, kind: 'waypoint' };
      showGenericModal('Click the map to add a waypoint for Hole ' + adminSelectedHole + '. Click an existing waypoint dot to remove it.');

    } else if (action === 'clearWaypoints') {
      if (holeData && holeData.waypointMarkers && holeData.waypointMarkers.length) {
        adminUndoSnapshot = {
          type: 'clearWaypoints',
          holeNumber: adminSelectedHole,
          data: holeData.waypointMarkers.map(m => { const ll = m.getLatLng(); return { lat: ll.lat, lng: ll.lng }; })
        };
        holeData.waypointMarkers.forEach(m => adminMap.removeLayer(m));
        holeData.waypointMarkers = [];
      }
      updateAdminLivePath(adminSelectedHole);

    } else if (action === 'addSecondWaypoint') {
      if (!holeData || !holeData.secondTeeMarker) {
        showGenericModal('Set the 2nd tee for this hole first.');
        return;
      }
      adminArmedAction = { holeNumber: adminSelectedHole, kind: 'secondWaypoint' };
      showGenericModal('Click the map to add a waypoint for the 2nd tee\'s path on Hole ' + adminSelectedHole + '. Click an existing waypoint dot to remove it.');

    } else if (action === 'clearSecondWaypoints') {
      if (holeData && holeData.secondWaypointMarkers && holeData.secondWaypointMarkers.length) {
        adminUndoSnapshot = {
          type: 'clearSecondWaypoints',
          holeNumber: adminSelectedHole,
          data: holeData.secondWaypointMarkers.map(m => { const ll = m.getLatLng(); return { lat: ll.lat, lng: ll.lng }; })
        };
        holeData.secondWaypointMarkers.forEach(m => adminMap.removeLayer(m));
        holeData.secondWaypointMarkers = [];
      }
      updateAdminLivePath(adminSelectedHole);

    } else if (action === 'togglePathTarget') {
      toggleAdminSecondPathTarget();

    } else if (action === 'deleteSecondTee') {
      deleteAdminSecondTee();

    } else if (action === 'deleteSecondBasket') {
      deleteAdminSecondBasket();
    }
  });
  HAZARD_TYPES.forEach(type => {
    document.getElementById('admin-hazard-' + type)?.addEventListener('change', (e) => {
      if (adminSelectedHole == null) {
        e.target.checked = false;
        showGenericModal('Check a hole first.');
        return;
      }
      adminHoleHazards[adminSelectedHole] = adminHoleHazards[adminSelectedHole] || {};
      adminHoleHazards[adminSelectedHole][type] = e.target.checked;
    });
  });
  document.getElementById('admin-rotation-slider')?.addEventListener('input', (e) => {
    if (adminSelectedHole == null) {
      console.warn('Tee facing slider: no hole is checked.');
      return;
    }
    const holeData = adminHoleMarkers[adminSelectedHole];
    const targetKey = adminActiveRotationTarget || 'teeMarker';
    const marker = holeData && holeData[targetKey];
    if (!marker) {
      console.warn('Tee facing slider: Hole ' + adminSelectedHole + ' has no ' + targetKey + ' marker placed yet.');
      return;
    }
    const deg = Number(e.target.value);
    marker._rotationDeg = deg;
    const el = marker.getElement();
    if (!el) {
      console.warn('Tee facing slider: marker.getElement() returned null.');
      return;
    }
    const img = el.querySelector('img');
    if (!img) {
      console.warn('Tee facing slider: no <img> found inside marker element.', el.outerHTML);
      return;
    }
    img.style.transform = 'rotate(' + deg + 'deg)';
  });

  document.getElementById('course-list-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('course-list-modal').classList.remove('active');
  });
  document.getElementById('course-list-remove-btn')?.addEventListener('click', handleCourseRemoveOrDeleteClick);

  // Magnifying-glass search toggle: click reveals+focuses the input;
  // click again collapses it and clears the search back to the full list.
  document.getElementById('course-list-search-toggle-btn')?.addEventListener('click', () => {
    const input = document.getElementById('course-list-search-input');
    const content = document.querySelector('#course-list-modal .custom-modal-content');
    const nowHidden = input.classList.toggle('hide');
    if (nowHidden) {
      input.value = '';
      courseListSearchQuery = '';
      loadCourseOptions();
      content?.classList.remove('search-active');
    } else {
      input.focus();
      content?.classList.add('search-active');
    }
  });
  document.getElementById('course-list-search-input')?.addEventListener('input', (e) => {
    courseListSearchQuery = e.target.value;
    loadCourseOptions();
  });

  document.getElementById('course-list-select-btn')?.addEventListener('click', async () => {
    const items = document.querySelectorAll('#course-list-items .course-list-item');
    if (items.length === 0) { showSelectCourseEmptyModal(); return; }
    if (selectedCourseListId == null) { document.getElementById('no-course-modal').classList.add('active'); return; }
    const db = await openDiscTallyDB();
    const course = await getCourseById(db, selectedCourseListId);
    if (!course) { showGenericModal('Course not found.'); return; }
    document.getElementById('course-list-modal').classList.remove('active');
    startRound(course);
  });

  document.getElementById('course-list-delete-btn')?.addEventListener('click', async () => {
    const items = document.querySelectorAll('#course-list-items .course-list-item');
    if (items.length === 0) { showDeleteCourseEmptyModal(); return; }
    if (selectedCourseListId == null) { document.getElementById('no-course-modal').classList.add('active'); return; }
    const courseId = selectedCourseListId;
    const selectedItem = document.querySelector('.course-list-item.selected .course-list-item-name');
    const courseName = selectedItem ? selectedItem.textContent : 'this course';

    const db = await openDiscTallyDB();
    const course = await getCourseById(db, courseId);
    const isStock = !!(course && course.stockKey);

    if (isStock && !isAdminSession()) {
      showGenericModal('"' + courseName + '" is a built-in stock course and can\'t be deleted. Only the admin account can remove it.');
      return;
    }

    const message = isStock
      ? 'WARNING: "' + courseName + '" is a built-in STOCK course, not one you created. Deleting it removes it from THIS device, but it will reappear on a fresh install elsewhere since it ships with the app itself. This does not undo that — it only affects your local copy. Continue?'
      : 'Deleting "' + courseName + '" will remove its tee/basket map data, and it will no longer be selectable for stats or new rounds. This cannot be undone. Continue?';

    showConfirmModal(
      message,
      async () => {
        await deleteCourse(db, courseId);
        await loadCourseOptions();
      }
    );
  });

  document.getElementById('nc-info-cancel-btn')?.addEventListener('click', closeNewCourseModal);
  document.getElementById('nc-info-next-btn')?.addEventListener('click', handleNcInfoNext);

  // Screen 2: Hole Setup
  document.getElementById('nc-holes-back-btn')?.addEventListener('click', () => showNCScreen('nc-screen-info'));
  document.getElementById('nc-holes-next-btn')?.addEventListener('click', () => showNCScreen('nc-screen-map-prompt'));

  // Screen 3: Map setup prompt
  document.getElementById('nc-map-back-btn')?.addEventListener('click', () => showNCScreen('nc-screen-holes'));
  document.getElementById('nc-map-yes-btn')?.addEventListener('click', handleNcMapYes);
  document.getElementById('nc-map-skip-btn')?.addEventListener('click', () => {
    showConfirmModal(
      "Skipping means you won't be able to set up the course map later. Save this course without a map?",
      finishCourseCreation
    );
  });

  // Address entry (used only when auto-detect-by-name fails)
  document.getElementById('cancel-course-address-btn')?.addEventListener('click', () => {
    document.getElementById('enter-location-modal').classList.remove('active');
    document.getElementById('new-course-modal').classList.add('active');
    showNCScreen('nc-screen-map-prompt');
  });
  document.getElementById('search-course-address-btn')?.addEventListener('click', handleCourseAddressSearch);

  // Hole placement wizard
  document.getElementById('hole-placement-confirm-btn')?.addEventListener('click', handleHolePlacementConfirm);
  document.getElementById('hole-placement-remove-point-btn')?.addEventListener('click', handleRemoveCurrentWaypoint);
  document.getElementById('hole-placement-done-waypoints-btn')?.addEventListener('click', handleDoneWithWaypoints);
  document.getElementById('hole-placement-previous-hole-btn')?.addEventListener('click', goToPreviousHole);
  document.getElementById('hole-placement-reuse-basket-btn')?.addEventListener('click', openReuseBasketModal);
  document.getElementById('hole-placement-finish-btn')?.addEventListener('click', () => {
    document.getElementById('finish-review-modal').classList.add('active');
  });
  document.getElementById('hole-placement-cancel-btn')?.addEventListener('click', cancelHolePlacementWizard);
  document.getElementById('hole-placement-rotation')?.addEventListener('input', handleTeeRotationInput);
  document.getElementById('hole-placement-second-path-target-btn')?.addEventListener('click', toggleSecondPathTarget);
  document.getElementById('hole-placement-delete-second-tee-btn')?.addEventListener('click', deleteSecondTee);
  document.getElementById('hole-placement-delete-second-basket-btn')?.addEventListener('click', deleteSecondBasket);

  document.getElementById('reuse-basket-use-btn')?.addEventListener('click', useReuseBasketSelection);
  document.getElementById('reuse-basket-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('reuse-basket-modal').classList.remove('active');
  });

  document.getElementById('finish-match-lengths-btn')?.addEventListener('click', () => {
    applyLengthsFromMap();
    document.getElementById('finish-review-modal').classList.remove('active');
    promptSaveOrBack();
  });
  document.getElementById('finish-match-map-btn')?.addEventListener('click', () => {
    applyMapFromLengths();
    document.getElementById('finish-review-modal').classList.remove('active');
    promptSaveOrBack();
  });
  document.getElementById('finish-keep-as-is-btn')?.addEventListener('click', () => {
    document.getElementById('finish-review-modal').classList.remove('active');
    promptSaveOrBack();
  });
  document.getElementById('finish-review-back-btn')?.addEventListener('click', () => {
    document.getElementById('finish-review-modal').classList.remove('active');
  });

  document.getElementById('save-visibility-private-btn')?.addEventListener('click', () => {
    pendingCourseVisibility = 'private';
    document.getElementById('save-visibility-modal').classList.remove('active');
    if (savingFlowIsAyp) { finishAsYouPlayCourse(); } else { finishCourseCreation(); }
  });
  document.getElementById('save-visibility-public-btn')?.addEventListener('click', () => {
    pendingCourseVisibility = 'public';
    document.getElementById('save-visibility-modal').classList.remove('active');
    if (savingFlowIsAyp) { finishAsYouPlayCourse(); } else { finishCourseCreation(); }
  });
  document.getElementById('save-visibility-back-btn')?.addEventListener('click', () => {
    document.getElementById('save-visibility-modal').classList.remove('active');
  });

  document.getElementById('back-to-menu-btn')?.addEventListener('click', exitRound);
  document.getElementById('finish-round-btn')?.addEventListener('click', () => {
    if (!currentRound) return;
    showConfirmModal(
      'End this round? Once submitted, you will not be able to change any scores.',
      finishRound
    );
  });

  document.getElementById('cancel-round-btn')?.addEventListener('click', cancelRound);
  document.getElementById('cancel-add-player-btn')?.addEventListener('click', closeAddPlayerModal);
  document.getElementById('save-add-player-btn')?.addEventListener('click', saveAddPlayer);

  document.getElementById('generic-modal-ok')?.addEventListener('click', () => {
    document.getElementById('generic-modal').classList.remove('active');
  });

  document.getElementById('close-round-summary-btn')?.addEventListener('click', () => {
    document.getElementById('round-summary-modal').classList.remove('active');
    exitRound();
  });

  document.getElementById('nav-home-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentRound) { exitRound(); }
  });

  document.getElementById('hamburger-menu-btn')?.addEventListener('click', () => {
    document.getElementById('hamburger-menu-modal').classList.add('active');
  });
  document.getElementById('menu-close-btn')?.addEventListener('click', () => {
    document.getElementById('hamburger-menu-modal').classList.remove('active');
  });
  document.getElementById('menu-account-btn')?.addEventListener('click', () => {
    document.getElementById('hamburger-menu-modal').classList.remove('active');
    openAccountModal();
  });
  document.getElementById('menu-courses-btn')?.addEventListener('click', () => {
    document.getElementById('hamburger-menu-modal').classList.remove('active');
    if (currentRound) exitRound();
    openCourseListModal('delete');
  });
  document.getElementById('menu-stats-btn')?.addEventListener('click', async () => {
    document.getElementById('hamburger-menu-modal').classList.remove('active');
    await openStatsModal();
  });
  document.getElementById('menu-discs-btn')?.addEventListener('click', () => {
    document.getElementById('hamburger-menu-modal').classList.remove('active');
    openDiscsListModal();
  });
  document.getElementById('menu-ratings-info-btn')?.addEventListener('click', () => {
    document.getElementById('hamburger-menu-modal').classList.remove('active');
    document.getElementById('ratings-info-modal').classList.add('active');
  });
  document.getElementById('ratings-info-close-btn')?.addEventListener('click', () => {
    document.getElementById('ratings-info-modal').classList.remove('active');
  });

  document.getElementById('menu-logout-btn')?.addEventListener('click', () => {
    document.getElementById('hamburger-menu-modal').classList.remove('active');
    if (currentRound) exitRound();
    endAdminSession();
    clearAccountFields();
    localStorage.setItem('userAutoLogin', 'false');
    document.getElementById('signin-email-input').value = '';
    document.getElementById('signin-password-input').value = '';
    document.getElementById('signin-remember-checkbox').checked = false;
    document.getElementById('signin-status').textContent = '';
    document.getElementById('signin-modal').classList.add('active');
  });

  document.getElementById('close-stats-modal-btn')?.addEventListener('click', () => {
    document.getElementById('stats-modal').classList.remove('active');
  });

  document.getElementById('close-last-round-modal-btn')?.addEventListener('click', () => {
    document.getElementById('last-round-modal').classList.remove('active');
  });

  document.getElementById('header-map')?.addEventListener('dblclick', openMapZoomModal);
  wireDoubleTap(document.getElementById('header-map'), openMapZoomModal);
  document.getElementById('close-map-zoom-btn')?.addEventListener('click', () => {
    document.getElementById('map-zoom-modal').classList.remove('active');
  });

  document.getElementById('view-last-round-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentRound) openLastRoundModal(currentRound.courseId);
  });

  document.getElementById('no-course-close-btn')?.addEventListener('click', () => {
    document.getElementById('no-course-modal').classList.remove('active');
  });

  document.getElementById('confirm-yes-btn')?.addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('active');
    const cb = pendingConfirmCallback;
    pendingConfirmCallback = null;
    pendingCancelCallback = null;
    if (cb) cb();
  });
  document.getElementById('confirm-no-btn')?.addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('active');
    pendingConfirmCallback = null;
    const cancelCb = pendingCancelCallback;
    pendingCancelCallback = null;
    if (cancelCb) cancelCb();
  });

  document.getElementById('clear-all-stats-btn')?.addEventListener('click', () => {
    if (statsActiveTab === 'fieldwork') {
      showConfirmModal('This will permanently delete ALL saved Field Work sessions. This cannot be undone. Continue?', clearAllFieldWorkStats);
    } else if (statsActiveTab === 'putting') {
      showConfirmModal('This will permanently delete ALL saved Putt Practice sessions. This cannot be undone. Continue?', clearAllPuttingStats);
    } else {
      showConfirmModal('This will permanently delete ALL saved rounds for every course. This cannot be undone. Continue?', clearAllStats);
    }
  });

  document.getElementById('delete-selected-rounds-btn')?.addEventListener('click', () => {
    const ids = getSelectedRoundIds();
    if (ids.length === 0) { showGenericModal('No rounds selected.'); return; }
    showConfirmModal('Delete ' + ids.length + ' selected round' + (ids.length > 1 ? 's' : '') + '? This cannot be undone.', () => deleteSelectedRounds(ids));
  });

  document.querySelectorAll('.stats-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      statsActiveTab = btn.dataset.tab;
      renderStatsTabs();
    });
  });
});

function showConfirmModal(message, onConfirm, onCancel) {
  document.getElementById('confirm-modal-message').textContent = message;
  pendingConfirmCallback = onConfirm;
  pendingCancelCallback = onCancel || null;
  document.getElementById('confirm-modal').classList.add('active');
}

function getSelectedRoundIds() {
  const boxes = document.querySelectorAll('.round-select-checkbox:checked');
  return Array.from(boxes).map(b => Number(b.dataset.roundId));
}

async function clearAllStats() {
  const db = await openDiscTallyDB();
  await clearAllRounds(db);
  await recomputeFlightRating();
  await openStatsModal();
}

async function deleteSelectedRounds(ids) {
  const db = await openDiscTallyDB();
  await deleteRounds(db, ids);
  await recomputeFlightRating();
  await openStatsModal();
}

function showGenericModal(message) {
  document.getElementById('generic-modal-message').textContent = message;
  document.getElementById('generic-modal').classList.add('active');
}

/* ---------- Course list ---------- */

// Simple relevance scorer for live list search: fields listed first
// (e.g. a course's name) outweigh a match found only in a lower-priority
// field (e.g. its address), and within a field an exact match beats
// "starts with" beats "contains" (earlier position wins ties). Returns
// -1 when nothing matched, so callers can filter those out.
function searchRelevanceScore(fieldsInPriorityOrder, query) {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  let best = -1;
  fieldsInPriorityOrder.forEach((field, i) => {
    const text = (field || '').toLowerCase();
    if (!text) return;
    const weight = (fieldsInPriorityOrder.length - i) * 1000;
    let score = -1;
    if (text === q) score = weight + 300;
    else if (text.startsWith(q)) score = weight + 200;
    else {
      const idx = text.indexOf(q);
      if (idx >= 0) score = weight + 100 - idx;
    }
    if (score > best) best = score;
  });
  return best;
}

async function loadCourseOptions() {
  const db = await openDiscTallyDB();
  const courses = await getAllCourses(db);
  const listEl = document.getElementById('course-list-items');
  if (!listEl) return;

  listEl.innerHTML = '';

  const query = courseListSearchQuery.trim();
  let displayCourses = courses;
  if (query) {
    displayCourses = courses
      .map(c => ({ c, score: searchRelevanceScore([c.name, c.address, c.location], query) }))
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.c);
  }

  if (displayCourses.length === 0) {
    listEl.innerHTML = '<p style="padding:0.5rem;grid-column:1/-1;">' +
      (query ? 'No courses match your search.' : 'No courses saved yet.') + '</p>';
    return;
  }

  displayCourses.forEach((c, index) => {
    const tile = document.createElement('div');
    tile.className = 'course-grid-tile';

    const content = document.createElement('div');
    content.className = 'course-grid-tile-content';
    tile.appendChild(content);

    if (courseListMode === 'delete') {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'course-grid-tile-select-checkbox' + (courseSelectionMode ? '' : ' hide');
      checkbox.checked = selectedCourseIds.has(c.id);
      tile.appendChild(checkbox);
    }

    if (c.logo) {
      const img = document.createElement('img');
      img.className = 'course-grid-tile-logo';
      img.src = c.logo;
      img.alt = '';
      content.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'course-grid-tile-logo-placeholder';
      placeholder.textContent = (c.name || '?').charAt(0).toUpperCase();
      content.appendChild(placeholder);
    }

    const infoRow = document.createElement('div');
    infoRow.className = 'course-grid-tile-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'course-grid-tile-name';
    nameEl.textContent = c.name || `Course ${c.id}`;
    infoRow.appendChild(nameEl);

    if (c.address) {
      const addressEl = document.createElement('span');
      addressEl.className = 'course-grid-tile-address';
      addressEl.textContent = c.address;
      infoRow.appendChild(addressEl);
    }

    if (c.location) {
      const locationEl = document.createElement('span');
      locationEl.className = 'course-grid-tile-location';
      locationEl.textContent = c.location;
      infoRow.appendChild(locationEl);
    }

    const metaEl = document.createElement('span');
    metaEl.className = 'course-grid-tile-meta';
    const holeCount = c.holes ? c.holes.length : 0;
    const totalPar = (c.holes || []).reduce((sum, h) => sum + (Number(h.par) || 0), 0);
    metaEl.textContent = holeCount + ' holes' + (totalPar ? (' \u00b7 Par ' + totalPar) : '');
    infoRow.appendChild(metaEl);

    content.appendChild(infoRow);

    tile.addEventListener('click', () => {
      if (courseSelectionMode) {
        if (selectedCourseIds.has(c.id)) selectedCourseIds.delete(c.id);
        else selectedCourseIds.add(c.id);
        const checkbox = tile.querySelector('.course-grid-tile-select-checkbox');
        if (checkbox) checkbox.checked = selectedCourseIds.has(c.id);
        return;
      }
      if (courseListMode === 'delete') return; // browsing only until Remove is pressed
      handleCourseTileClick(c);
    });
    listEl.appendChild(tile);
  });

  // Always show a full list of 10 slots — fill any remaining empty
  // slots with "Course coming soon" placeholders. If there are more
  // than 10 real courses, no placeholders are added and the list just
  // grows past 10 as needed. Skipped entirely while a search is active,
  // since padding a filtered/reordered list out to 10 doesn't make sense.
  if (!query) {
    const minSlots = 10;
    for (let i = courses.length; i < minSlots; i++) {
      const empty = document.createElement('div');
      empty.className = 'course-grid-tile-empty';
      empty.textContent = 'Course coming soon';
      listEl.appendChild(empty);
    }
  }
}

async function handleCourseTileClick(course) {
  document.getElementById('course-list-modal').classList.remove('active');
  startRound(course);
}

async function openCourseListModal(mode) {
  courseListMode = mode;
  courseSelectionMode = false;
  selectedCourseIds.clear();
  courseListSearchQuery = '';
  const searchInput = document.getElementById('course-list-search-input');
  if (searchInput) { searchInput.value = ''; searchInput.classList.add('hide'); }
  document.querySelector('#course-list-modal .custom-modal-content')?.classList.remove('search-active');
  await loadCourseOptions();
  // "Cancel" reads more naturally when the person is mid-way through
  // starting a round (they haven't committed to anything yet); "Close"
  // fits every other use of this same shared modal (browsing/deleting
  // from the Courses list, etc.), where nothing is "in progress" to cancel.
  document.getElementById('course-list-cancel-btn').textContent = (mode === 'select') ? 'Cancel' : 'Close';
  const removeBtn = document.getElementById('course-list-remove-btn');
  removeBtn.classList.toggle('hide', mode !== 'delete');
  removeBtn.textContent = 'Remove';
  document.getElementById('course-list-modal').classList.add('active');
}

function handleCourseRemoveOrDeleteClick() {
  const btn = document.getElementById('course-list-remove-btn');
  if (!courseSelectionMode) {
    courseSelectionMode = true;
    btn.textContent = 'Delete';
    showGenericModal('Tap the courses you want to remove, then press Delete.');
    loadCourseOptions();
    return;
  }
  if (selectedCourseIds.size === 0) {
    showGenericModal('No courses selected. Tap a course first, or press Close to cancel.');
    return;
  }
  confirmAndDeleteSelectedCourses();
}

function resetCourseSelectionMode() {
  courseSelectionMode = false;
  selectedCourseIds.clear();
  const btn = document.getElementById('course-list-remove-btn');
  if (btn) btn.textContent = 'Remove';
}

async function confirmAndDeleteSelectedCourses() {
  const db = await openDiscTallyDB();
  const allCourses = await getAllCourses(db);
  const selected = allCourses.filter(c => selectedCourseIds.has(c.id));

  const admin = isAdminSession();
  const blocked = selected.filter(c => c.stockKey && !admin);
  const deletable = selected.filter(c => !(c.stockKey && !admin));

  let message = '';
  if (deletable.length > 0) {
    message += 'You are about to permanently delete:\n';
    deletable.forEach(c => {
      message += '\u2022 ' + (c.name || 'Unnamed course') +
        (c.stockKey ? ' (built-in stock course \u2014 will reappear on a fresh install elsewhere, but not on this device)' : '') + '\n';
    });
    message += '\nThis removes their tee/basket map data, and they will no longer be selectable for stats or new rounds. This cannot be undone.';
  }
  if (blocked.length > 0) {
    message += (deletable.length > 0 ? '\n\n' : '') + 'These are built-in stock courses and can\'t be deleted by a non-admin account, so they will be skipped:\n';
    blocked.forEach(c => { message += '\u2022 ' + (c.name || 'Unnamed course') + '\n'; });
  }

  if (deletable.length === 0) {
    showGenericModal(message || 'Nothing selected can be deleted.');
    resetCourseSelectionMode();
    loadCourseOptions();
    return;
  }

  showConfirmModal(
    message + '\n\nContinue?',
    async () => {
      for (const c of deletable) {
        await deleteCourse(db, c.id);
      }
      resetCourseSelectionMode();
      await loadCourseOptions();
    },
    () => {
      resetCourseSelectionMode();
      loadCourseOptions();
    }
  );
}
