/* js/main.js
   Shared bootstrap: button wiring (DOMContentLoaded), generic modal
   helpers, and the course-list popup. Everything else has been split
   into map-icons.js, course-wizard.js, admin-panel.js, and round.js. */

let pendingConfirmCallback = null;
let selectedCourseListId = null; // currently-selected course row in the course-list-modal
let courseListMode = 'select';   // 'select' | 'delete' | 'putt-practice' — what the course-list-modal does when you pick a course

document.addEventListener('DOMContentLoaded', function () {
  seedStockCourses().then(loadCourseOptions);

  document.getElementById('start-round-btn')?.addEventListener('click', () => openCourseListModal('select'));
  document.getElementById('add-course-btn')?.addEventListener('click', openNewCourseModal);
  document.getElementById('field-work-btn')?.addEventListener('click', () => {
    showGenericModal('Field Work is coming soon.');
  });
  document.getElementById('putt-practice-btn')?.addEventListener('click', () => openCourseListModal('putt-practice'));
  document.getElementById('add-disc-btn')?.addEventListener('click', () => {
    showGenericModal('Add Disc is coming soon.');
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
  document.getElementById('admin-save-course-btn')?.addEventListener('click', saveAdminCourse);
  document.getElementById('admin-course-logo-input')?.addEventListener('change', handleAdminLogoFileSelected);
  document.getElementById('admin-remove-logo-btn')?.addEventListener('click', () => {
    adminEditingLogoDataUrl = null;
    document.getElementById('admin-course-logo-preview').classList.add('hide');
    document.getElementById('admin-course-logo-input').value = '';
    document.getElementById('admin-remove-logo-btn').classList.add('hide');
  });

  document.getElementById('admin-find-location-btn')?.addEventListener('click', handleAdminFindLocation);
  document.getElementById('admin-location-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdminFindLocation(); }
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

  document.getElementById('admin-set-tee-btn')?.addEventListener('click', () => {
    if (adminSelectedHole == null) { showGenericModal('Check a hole first.'); return; }
    adminArmedAction = { holeNumber: adminSelectedHole, kind: 'tee' };
    showGenericModal('Click the map to place/move the tee for Hole ' + adminSelectedHole + '.');
  });
  document.getElementById('admin-set-basket-btn')?.addEventListener('click', () => {
    if (adminSelectedHole == null) { showGenericModal('Check a hole first.'); return; }
    adminArmedAction = { holeNumber: adminSelectedHole, kind: 'basket' };
    showGenericModal('Click the map to place/move the basket for Hole ' + adminSelectedHole + '.');
  });
  document.getElementById('admin-add-waypoint-btn')?.addEventListener('click', () => {
    if (adminSelectedHole == null) { showGenericModal('Check a hole first.'); return; }
    adminArmedAction = { holeNumber: adminSelectedHole, kind: 'waypoint' };
    showGenericModal('Click the map to add a waypoint for Hole ' + adminSelectedHole + '. Click an existing waypoint dot to remove it.');
  });
  document.getElementById('admin-clear-waypoints-btn')?.addEventListener('click', () => {
    if (adminSelectedHole == null) { showGenericModal('Check a hole first.'); return; }
    const holeData = adminHoleMarkers[adminSelectedHole];
    if (holeData && holeData.waypointMarkers) {
      holeData.waypointMarkers.forEach(m => adminMap.removeLayer(m));
      holeData.waypointMarkers = [];
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
    if (!holeData || !holeData.teeMarker) {
      console.warn('Tee facing slider: Hole ' + adminSelectedHole + ' has no tee marker placed yet.');
      return;
    }
    const deg = Number(e.target.value);
    holeData.teeMarker._rotationDeg = deg;
    const el = holeData.teeMarker.getElement();
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

  document.getElementById('course-list-close-btn')?.addEventListener('click', () => {
    document.getElementById('course-list-modal').classList.remove('active');
  });

  document.getElementById('course-list-select-btn')?.addEventListener('click', async () => {
    const items = document.querySelectorAll('#course-list-items .course-list-item');
    if (items.length === 0) { showSelectCourseEmptyModal(); return; }
    if (selectedCourseListId == null) { document.getElementById('no-course-modal').classList.add('active'); return; }
    const db = await openDiscTallyDB();
    const course = await getCourseById(db, selectedCourseListId);
    if (!course) { showGenericModal('Course not found.'); return; }
    document.getElementById('course-list-modal').classList.remove('active');
    if (courseListMode === 'putt-practice') {
      openPuttPracticeHolePicker(course);
    } else {
      startRound(course);
    }
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
    finishCourseCreation();
  });
  document.getElementById('save-visibility-public-btn')?.addEventListener('click', () => {
    pendingCourseVisibility = 'public';
    document.getElementById('save-visibility-modal').classList.remove('active');
    finishCourseCreation();
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
    showGenericModal('Discs is coming soon.');
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
    if (cb) cb();
  });
  document.getElementById('confirm-no-btn')?.addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('active');
    pendingConfirmCallback = null;
  });

  document.getElementById('clear-all-stats-btn')?.addEventListener('click', () => {
    showConfirmModal('This will permanently delete ALL saved rounds for every course. This cannot be undone. Continue?', clearAllStats);
  });

  document.getElementById('delete-selected-rounds-btn')?.addEventListener('click', () => {
    const ids = getSelectedRoundIds();
    if (ids.length === 0) { showGenericModal('No rounds selected.'); return; }
    showConfirmModal('Delete ' + ids.length + ' selected round' + (ids.length > 1 ? 's' : '') + '? This cannot be undone.', () => deleteSelectedRounds(ids));
  });
});

function showConfirmModal(message, onConfirm) {
  document.getElementById('confirm-modal-message').textContent = message;
  pendingConfirmCallback = onConfirm;
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

async function loadCourseOptions() {
  const db = await openDiscTallyDB();
  const courses = await getAllCourses(db);
  const listEl = document.getElementById('course-list-items');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (courses.length === 0) {
    listEl.innerHTML = '<p style="padding:0.5rem;grid-column:1/-1;">No courses saved yet.</p>';
    return;
  }

  courses.forEach(c => {
    const tile = document.createElement('div');
    tile.className = 'course-grid-tile';

    const raised = document.createElement('div');
    raised.className = 'course-grid-tile-raised';
    tile.appendChild(raised);

    if (c.logo) {
      const img = document.createElement('img');
      img.className = 'course-grid-tile-logo';
      img.src = c.logo;
      img.alt = '';
      raised.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'course-grid-tile-logo-placeholder';
      placeholder.textContent = (c.name || '?').charAt(0).toUpperCase();
      raised.appendChild(placeholder);
    }

    const infoRow = document.createElement('div');
    infoRow.className = 'course-grid-tile-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'course-grid-tile-name';
    nameEl.textContent = c.name || `Course ${c.id}`;
    infoRow.appendChild(nameEl);

    const metaEl = document.createElement('span');
    metaEl.className = 'course-grid-tile-meta';
    const holeCount = c.holes ? c.holes.length : 0;
    const totalPar = (c.holes || []).reduce((sum, h) => sum + (Number(h.par) || 0), 0);
    metaEl.textContent = holeCount + ' holes' + (totalPar ? (' \u00b7 Par ' + totalPar) : '');
    infoRow.appendChild(metaEl);

    raised.appendChild(infoRow);

    tile.addEventListener('click', () => handleCourseTileClick(c));
    listEl.appendChild(tile);
  });

  // Fill out an incomplete last row (2 columns) with a placeholder tile.
  if (courses.length % 2 === 1) {
    const empty = document.createElement('div');
    empty.className = 'course-grid-tile-empty';
    empty.textContent = 'Course coming soon';
    listEl.appendChild(empty);
  }
}

async function handleCourseTileClick(course) {
  document.getElementById('course-list-modal').classList.remove('active');

  if (courseListMode === 'putt-practice') {
    openPuttPracticeHolePicker(course);
    return;
  }
  if (courseListMode === 'delete') {
    const db = await openDiscTallyDB();
    const isStock = !!course.stockKey;
    if (isStock && !isAdminSession()) {
      showGenericModal('"' + (course.name || 'This course') + '" is a built-in stock course and can\'t be deleted. Only the admin account can remove it.');
      return;
    }
    const message = isStock
      ? 'WARNING: "' + course.name + '" is a built-in STOCK course, not one you created. Deleting it removes it from THIS device, but it will reappear on a fresh install elsewhere since it ships with the app itself. This does not undo that — it only affects your local copy. Continue?'
      : 'Deleting "' + (course.name || 'this course') + '" will remove its tee/basket map data, and it will no longer be selectable for stats or new rounds. This cannot be undone. Continue?';
    showConfirmModal(message, async () => {
      await deleteCourse(db, course.id);
      await loadCourseOptions();
      document.getElementById('course-list-modal').classList.add('active');
    });
    return;
  }
  // Default: 'select' mode
  startRound(course);
}

async function openCourseListModal(mode) {
  courseListMode = mode;
  await loadCourseOptions();
  document.getElementById('course-list-modal').classList.add('active');
}
