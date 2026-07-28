/* js/main.js */

let currentRound = null;      // { courseId, courseName, holes, players: [{name, scores:{hole:strokes}}] }
let pendingConfirmCallback = null;
let headerMap = null;
let headerMapMarker = null;
let headerMapWatchId = null;
let mapZoomMap = null;
let mapZoomMarker = null;
let pendingCourseLat = null;
let pendingCourseLng = null;

// Tee pad marker icon — a real illustrated asset (img/tee-pad.png), not a
// pin, so it's anchored at its own center rather than a bottom point.
// Native art is 242x481px; displayed small on the map.
const TEE_PAD_ICON_URL = 'img/tee-pad.png';

// Basket marker icon — anchored at the bottom-center of the pole, since
// this marker should point at one exact ground spot (unlike the tee pad,
// which represents an area and is anchored at its own center).
// Uses a divIcon (not L.icon) with object-fit:contain so the real image's
// aspect ratio is preserved instead of being stretched to fill iconSize.
const BASKET_ICON_URL = 'img/basket.png';
function makeBasketIcon() {
  return L.divIcon({
    html: '<img src="' + BASKET_ICON_URL + '" style="width:100%;height:100%;object-fit:contain;object-position:center bottom;display:block;"/>',
    className: 'placement-div-icon',
    iconSize: [66, 88],
    iconAnchor: [33, 88]
  });
}

// Hole placement wizard state
let holePlacementHoles = [];          // [{number, par}] read from the New Course hole-setup screen
let holePlacementIndex = 0;           // which hole (0-based) we're currently placing
let holePlacementSubStep = 'tee-tap'; // 'tee-tap' | 'tee-confirm' | 'basket-tap' | 'basket-confirm' | 'waypoint-tap' | 'waypoint-confirm' | 'done'
let holePlacementMap = null;
let holePlacementTeeMarker = null;
let holePlacementBasketMarker = null;
let holePlacementCurrentWaypointMarker = null;
let holePlacementWaypointMarkers = [];  // confirmed waypoints for the CURRENT hole
let holePlacementRotation = 0;
let pendingHoleGeo = [];               // [{tee:{lat,lng,rotation}, basket:{lat,lng}, waypoints:[{lat,lng}]}] — one entry per hole
let allBasketMarkers = [];             // [{holeNumbers:[n,...], marker, lat, lng}] — every confirmed basket this session, for reuse + labeling
let holeMarkersHistory = [];           // [{teeMarker, basketEntry, waypointMarkers}] — one entry per hole, so "Previous Hole" can clean up
let pendingCourseVisibility = 'private';

document.addEventListener('DOMContentLoaded', function () {
  loadCourseOptions();

  document.getElementById('select-course-btn')?.addEventListener('click', async () => {
    const select = document.getElementById('course-select');
    if (!select || select.options.length <= 1) { showSelectCourseEmptyModal(); return; }
    if (!select.value) { document.getElementById('no-course-modal').classList.add('active'); return; }
    const db = await openDiscTallyDB();
    const course = await getCourseById(db, Number(select.value));
    if (!course) { showGenericModal('Course not found.'); return; }
    startRound(course);
  });

  document.getElementById('delete-course-btn')?.addEventListener('click', async () => {
    const select = document.getElementById('course-select');
    if (!select || select.options.length <= 1) { showDeleteCourseEmptyModal(); return; }
    if (!select.value) { document.getElementById('no-course-modal').classList.add('active'); return; }
    const courseId = Number(select.value);
    const courseName = select.options[select.selectedIndex].textContent;
    showConfirmModal(
      'Deleting "' + courseName + '" will remove its tee/basket map data, and it will no longer be selectable for stats or new rounds. This cannot be undone. Continue?',
      async () => {
        const db = await openDiscTallyDB();
        await deleteCourse(db, courseId);
        await loadCourseOptions();
      }
    );
  });

  document.getElementById('new-course-btn')?.addEventListener('click', openNewCourseModal);

  // Screen 1: Course Info
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
  document.getElementById('nav-courses-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentRound) exitRound();
    document.getElementById('course-select')?.focus();
  });
  document.getElementById('nav-stats-link')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await openStatsModal();
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
  await openStatsModal();
}

async function deleteSelectedRounds(ids) {
  const db = await openDiscTallyDB();
  await deleteRounds(db, ids);
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
  const sel = document.getElementById('course-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select a course</option>';
  courses.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.name || `Course ${c.id}`;
    sel.appendChild(o);
  });
  enableSelectCourse();
}

function enableSelectCourse() {
  const selectBtn = document.getElementById('select-course-btn');
  const deleteBtn = document.getElementById('delete-course-btn');
  if (selectBtn) selectBtn.disabled = false;
  if (deleteBtn) deleteBtn.disabled = false;
}

/* ---------- New Course modal (3-screen wizard) ---------- */

function showNCScreen(id) {
  ['nc-screen-info', 'nc-screen-holes', 'nc-screen-map-prompt'].forEach(sid => {
    document.getElementById(sid).classList.toggle('hide', sid !== id);
  });
}

function openNewCourseModal() {
  document.getElementById('nc-course-name').value = '';

  const holeCountSelect = document.getElementById('nc-hole-count');
  holeCountSelect.innerHTML = '';
  for (let i = 1; i <= 36; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    if (i === 18) opt.selected = true;
    holeCountSelect.appendChild(opt);
  }

  document.getElementById('nc-holes-container').innerHTML = '';
  document.getElementById('nc-map-prompt-status').textContent = '';
  document.getElementById('course-address-input').value = '';

  resetCourseCreationState();
  showNCScreen('nc-screen-info');
  document.getElementById('new-course-modal').classList.add('active');
}

function closeNewCourseModal() {
  document.getElementById('new-course-modal').classList.remove('active');
}

function resetCourseCreationState() {
  pendingCourseLat = null;
  pendingCourseLng = null;
  pendingHoleGeo = [];
  holePlacementHoles = [];
  holePlacementIndex = 0;
  holePlacementWaypointMarkers = [];
  holePlacementCurrentWaypointMarker = null;
  holePlacementTeeMarker = null;
  holePlacementBasketMarker = null;
  allBasketMarkers = [];
  holeMarkersHistory = [];
  pendingCourseVisibility = 'private';

  // Fully tear down the Leaflet map so no markers from a previous attempt
  // (before a Cancel) linger into the next one.
  if (holePlacementMap) {
    holePlacementMap.remove();
    holePlacementMap = null;
  }
}

function handleNcInfoNext() {
  const name = document.getElementById('nc-course-name').value.trim();
  if (!name) { showGenericModal('Please enter a course name.'); return; }
  showNCScreen('nc-screen-holes');
  generateHoleFieldsV2();
}

function generateHoleFieldsV2() {
  const count = Number(document.getElementById('nc-hole-count').value) || 18;
  const container = document.getElementById('nc-holes-container');
  container.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const row = document.createElement('div');
    row.className = 'new-course-hole-row';

    const label = document.createElement('span');
    label.textContent = 'Hole ' + i;

    const lengthInput = document.createElement('input');
    lengthInput.type = 'number';
    lengthInput.min = '1';
    lengthInput.placeholder = 'Length (ft)';
    lengthInput.dataset.hole = i;
    lengthInput.dataset.field = 'length';
    lengthInput.style.width = '5.5rem';
    lengthInput.style.flex = '0 0 auto';

    const parSelect = document.createElement('select');
    parSelect.dataset.hole = i;
    parSelect.dataset.field = 'par';
    parSelect.style.width = '4.5rem';
    parSelect.style.flex = '0 0 auto';
    for (let p = 2; p <= 7; p++) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = 'Par ' + p;
      if (p === 3) opt.selected = true;
      parSelect.appendChild(opt);
    }

    row.appendChild(label);
    row.appendChild(lengthInput);
    row.appendChild(parSelect);
    container.appendChild(row);
  }
}

async function geocodeQuery(query) {
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const results = await res.json();
    if (!results || results.length === 0) return null;
    return { lat: Number(results[0].lat), lng: Number(results[0].lon), displayName: results[0].display_name };
  } catch (err) {
    return null;
  }
}

async function handleNcMapYes() {
  const name = document.getElementById('nc-course-name').value.trim();
  const statusEl = document.getElementById('nc-map-prompt-status');
  statusEl.textContent = 'Looking up ' + name + '...';

  const result = await geocodeQuery(name + ' disc golf course');
  if (result) {
    pendingCourseLat = result.lat;
    pendingCourseLng = result.lng;
    statusEl.textContent = '';
    document.getElementById('new-course-modal').classList.remove('active');
    launchHolePlacementWizard();
    return;
  }

  statusEl.textContent = "Couldn't find it by name — enter its address.";
  document.getElementById('new-course-modal').classList.remove('active');
  document.getElementById('enter-location-modal').classList.add('active');
  document.getElementById('enter-location-status').textContent = '';
  document.getElementById('course-address-input').focus();
}

async function handleCourseAddressSearch() {
  const addressInput = document.getElementById('course-address-input');
  const statusEl = document.getElementById('enter-location-status');
  const address = addressInput.value.trim();

  if (!address) {
    statusEl.textContent = 'Enter an address or place name to search.';
    return;
  }

  statusEl.textContent = 'Searching...';
  const result = await geocodeQuery(address);
  if (!result) {
    statusEl.textContent = 'Nothing found for that. Try a fuller address or a nearby town/park name.';
    return;
  }

  pendingCourseLat = result.lat;
  pendingCourseLng = result.lng;
  statusEl.textContent = '';
  document.getElementById('enter-location-modal').classList.remove('active');
  launchHolePlacementWizard();
}

/* ---------- Hole placement wizard ---------- */

function launchHolePlacementWizard() {
  const rows = document.querySelectorAll('#nc-holes-container .new-course-hole-row');
  holePlacementHoles = [];
  rows.forEach((row, i) => {
    const parSelect = row.querySelector('[data-field="par"]');
    holePlacementHoles.push({ number: i + 1, par: Number(parSelect.value) || 3 });
  });

  pendingHoleGeo = holePlacementHoles.map(() => ({ tee: null, basket: null, waypoints: [] }));
  holeMarkersHistory = holePlacementHoles.map(() => ({}));
  allBasketMarkers = [];
  holePlacementIndex = 0;

  document.getElementById('hole-placement-modal').classList.add('active');

  const center = (pendingCourseLat != null && pendingCourseLng != null) ? [pendingCourseLat, pendingCourseLng] : [0, 0];

  if (!holePlacementMap && typeof L !== 'undefined') {
    holePlacementMap = L.map('hole-placement-map', { zoomAnimation: false, fadeAnimation: false, zoomSnap: 0.25, zoomDelta: 0.5 });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
      detectRetina: true
    }).addTo(holePlacementMap);
    holePlacementMap.on('click', handleHolePlacementMapClick);
  }
  holePlacementMap.setView(center, 18);
  setTimeout(() => holePlacementMap.invalidateSize(), 50);

  beginHoleTee(0);
}

function beginHoleTee(index) {
  holePlacementIndex = index;
  holePlacementSubStep = 'tee-tap';
  holePlacementRotation = 0;
  holePlacementWaypointMarkers = [];
  holePlacementCurrentWaypointMarker = null;
  holePlacementTeeMarker = null;
  holePlacementBasketMarker = null;
  updateHolePlacementUI();
}

function updateMarkerHoleLabel(marker, holeNumbers) {
  const text = holeNumbers.join(', ');
  if (marker.getTooltip()) {
    marker.setTooltipContent(text);
  } else {
    marker.bindTooltip(text, {
      permanent: true,
      direction: 'right',
      offset: [12, 0],
      className: 'hole-number-label'
    });
  }
}

function handleHolePlacementMapClick(e) {
  const currentHoleNumber = holePlacementHoles[holePlacementIndex].number;

  if (holePlacementSubStep === 'tee-tap') {
    const teeDivIcon = L.divIcon({
      html: '<img src="' + TEE_PAD_ICON_URL + '" style="width:22px;height:44px;display:block;transform:rotate(0deg);"/>',
      className: 'placement-div-icon',
      iconSize: [22, 44],
      iconAnchor: [11, 22]
    });
    holePlacementTeeMarker = L.marker(e.latlng, { icon: teeDivIcon, draggable: true }).addTo(holePlacementMap);
    updateMarkerHoleLabel(holePlacementTeeMarker, [currentHoleNumber]);
    holePlacementRotation = 0;
    holePlacementSubStep = 'tee-confirm';
    updateHolePlacementUI();
    applyTeeRotationToMarker();

  } else if (holePlacementSubStep === 'basket-tap') {
    holePlacementBasketMarker = L.marker(e.latlng, { icon: makeBasketIcon(), draggable: true }).addTo(holePlacementMap);
    updateMarkerHoleLabel(holePlacementBasketMarker, [currentHoleNumber]);
    holePlacementSubStep = 'basket-confirm';
    updateHolePlacementUI();

  } else if (holePlacementSubStep === 'waypoint-tap') {
    const wpIcon = L.divIcon({
      html: '<div style="width:12px;height:12px;border-radius:50%;background:var(--mustard);border:2px solid var(--dark-teal);"></div>',
      className: 'placement-div-icon',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
    holePlacementCurrentWaypointMarker = L.marker(e.latlng, { icon: wpIcon, draggable: true }).addTo(holePlacementMap);
    holePlacementSubStep = 'waypoint-confirm';
    updateHolePlacementUI();
  }
  // Any other sub-step: ignore taps.
}

function handleTeeRotationInput(e) {
  holePlacementRotation = Number(e.target.value);
  applyTeeRotationToMarker();
}

function applyTeeRotationToMarker() {
  if (!holePlacementTeeMarker) return;
  const el = holePlacementTeeMarker.getElement();
  if (!el) return;
  const img = el.querySelector('img');
  if (img) img.style.transform = 'rotate(' + holePlacementRotation + 'deg)';
}

function handleHolePlacementConfirm() {
  const currentHoleNumber = holePlacementHoles[holePlacementIndex].number;

  if (holePlacementSubStep === 'tee-confirm') {
    const ll = holePlacementTeeMarker.getLatLng();
    pendingHoleGeo[holePlacementIndex].tee = { lat: ll.lat, lng: ll.lng, rotation: holePlacementRotation };
    holeMarkersHistory[holePlacementIndex].teeMarker = holePlacementTeeMarker;
    holePlacementSubStep = 'basket-tap';
    updateHolePlacementUI();

  } else if (holePlacementSubStep === 'basket-confirm') {
    const ll = holePlacementBasketMarker.getLatLng();
    pendingHoleGeo[holePlacementIndex].basket = { lat: ll.lat, lng: ll.lng };
    const entry = { holeNumbers: [currentHoleNumber], marker: holePlacementBasketMarker, lat: ll.lat, lng: ll.lng };
    allBasketMarkers.push(entry);
    holeMarkersHistory[holePlacementIndex].basketEntry = entry;
    holePlacementSubStep = 'waypoint-tap';
    updateHolePlacementUI();

  } else if (holePlacementSubStep === 'waypoint-confirm') {
    holePlacementWaypointMarkers.push(holePlacementCurrentWaypointMarker);
    holePlacementCurrentWaypointMarker = null;
    holePlacementSubStep = 'waypoint-tap';
    updateHolePlacementUI();
  }
}

function handleRemoveCurrentWaypoint() {
  if (holePlacementCurrentWaypointMarker && holePlacementMap) {
    holePlacementMap.removeLayer(holePlacementCurrentWaypointMarker);
  }
  holePlacementCurrentWaypointMarker = null;
  holePlacementSubStep = 'waypoint-tap';
  updateHolePlacementUI();
}

function openReuseBasketModal() {
  if (allBasketMarkers.length === 0) return;
  const select = document.getElementById('reuse-basket-select');
  select.innerHTML = '';
  allBasketMarkers.forEach((entry, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = 'Hole ' + entry.holeNumbers.join(', ');
    select.appendChild(opt);
  });
  document.getElementById('reuse-basket-modal').classList.add('active');
}

function useReuseBasketSelection() {
  const select = document.getElementById('reuse-basket-select');
  const entry = allBasketMarkers[Number(select.value)];
  if (!entry) return;

  const currentHoleNumber = holePlacementHoles[holePlacementIndex].number;
  entry.holeNumbers.push(currentHoleNumber);
  updateMarkerHoleLabel(entry.marker, entry.holeNumbers);

  pendingHoleGeo[holePlacementIndex].basket = { lat: entry.lat, lng: entry.lng };
  holeMarkersHistory[holePlacementIndex].basketEntry = entry;

  document.getElementById('reuse-basket-modal').classList.remove('active');
  holePlacementSubStep = 'waypoint-tap';
  updateHolePlacementUI();
}

function handleDoneWithWaypoints() {
  pendingHoleGeo[holePlacementIndex].waypoints = holePlacementWaypointMarkers.map(m => {
    const ll = m.getLatLng();
    return { lat: ll.lat, lng: ll.lng };
  });
  holeMarkersHistory[holePlacementIndex].waypointMarkers = holePlacementWaypointMarkers.slice();

  const nextIndex = holePlacementIndex + 1;
  if (nextIndex < holePlacementHoles.length) {
    beginHoleTee(nextIndex);
  } else {
    holePlacementSubStep = 'done';
    updateHolePlacementUI();
  }
}

function clearCurrentHoleInProgressMarkers() {
  if (holePlacementTeeMarker) { holePlacementMap.removeLayer(holePlacementTeeMarker); holePlacementTeeMarker = null; }
  if (holePlacementBasketMarker) { holePlacementMap.removeLayer(holePlacementBasketMarker); holePlacementBasketMarker = null; }
  if (holePlacementCurrentWaypointMarker) { holePlacementMap.removeLayer(holePlacementCurrentWaypointMarker); holePlacementCurrentWaypointMarker = null; }
  holePlacementWaypointMarkers.forEach(m => holePlacementMap.removeLayer(m));
  holePlacementWaypointMarkers = [];
}

function goToPreviousHole() {
  const targetIndex = (holePlacementSubStep === 'done') ? holePlacementHoles.length - 1 : holePlacementIndex - 1;
  if (targetIndex < 0) return;

  if (holePlacementSubStep !== 'done') {
    clearCurrentHoleInProgressMarkers();
  }

  const hist = holeMarkersHistory[targetIndex] || {};
  if (hist.teeMarker) holePlacementMap.removeLayer(hist.teeMarker);
  if (hist.waypointMarkers) hist.waypointMarkers.forEach(m => holePlacementMap.removeLayer(m));
  if (hist.basketEntry) {
    const entry = hist.basketEntry;
    const holeNum = holePlacementHoles[targetIndex].number;
    entry.holeNumbers = entry.holeNumbers.filter(n => n !== holeNum);
    if (entry.holeNumbers.length === 0) {
      holePlacementMap.removeLayer(entry.marker);
      allBasketMarkers = allBasketMarkers.filter(e => e !== entry);
    } else {
      updateMarkerHoleLabel(entry.marker, entry.holeNumbers);
    }
  }

  holeMarkersHistory[targetIndex] = {};
  pendingHoleGeo[targetIndex] = { tee: null, basket: null, waypoints: [] };
  beginHoleTee(targetIndex);
}

function updateHolePlacementUI() {
  const instructionsEl = document.getElementById('hole-placement-instructions');
  const rotationRow = document.getElementById('hole-placement-rotation-row');
  const confirmBtn = document.getElementById('hole-placement-confirm-btn');
  const removeBtn = document.getElementById('hole-placement-remove-point-btn');
  const doneWaypointsBtn = document.getElementById('hole-placement-done-waypoints-btn');
  const finishBtn = document.getElementById('hole-placement-finish-btn');
  const reuseBasketBtn = document.getElementById('hole-placement-reuse-basket-btn');
  const previousHoleBtn = document.getElementById('hole-placement-previous-hole-btn');

  rotationRow.classList.add('hide');
  confirmBtn.classList.add('hide');
  removeBtn.classList.add('hide');
  doneWaypointsBtn.classList.add('hide');
  finishBtn.classList.add('hide');
  reuseBasketBtn.classList.add('hide');

  const canGoBack = (holePlacementSubStep === 'done') ? holePlacementHoles.length > 0 : holePlacementIndex > 0;
  previousHoleBtn.classList.toggle('hide', !canGoBack);

  const hole = holePlacementHoles[holePlacementIndex];
  const holeLabel = hole ? ('Hole ' + hole.number + ' (Par ' + hole.par + ')') : '';

  switch (holePlacementSubStep) {
    case 'tee-tap':
      instructionsEl.textContent = holeLabel + ': Tap the map to place the tee pad.';
      break;
    case 'tee-confirm':
      instructionsEl.textContent = holeLabel + ': Drag to adjust, use the slider to set facing direction, then Confirm.';
      rotationRow.classList.remove('hide');
      confirmBtn.classList.remove('hide');
      document.getElementById('hole-placement-rotation').value = 0;
      break;
    case 'basket-tap':
      instructionsEl.textContent = holeLabel + ': Tap the map to place the basket.';
      if (allBasketMarkers.length > 0) reuseBasketBtn.classList.remove('hide');
      break;
    case 'basket-confirm':
      instructionsEl.textContent = holeLabel + ': Drag to adjust, then Confirm.';
      confirmBtn.classList.remove('hide');
      break;
    case 'waypoint-tap':
      instructionsEl.textContent = holeLabel + ": Optional — tap the map to add a point along the path, or click 'No More Waypoints' to continue.";
      doneWaypointsBtn.classList.remove('hide');
      break;
    case 'waypoint-confirm':
      instructionsEl.textContent = holeLabel + ': Drag to adjust, then Confirm (or Remove).';
      confirmBtn.classList.remove('hide');
      removeBtn.classList.remove('hide');
      break;
    case 'done':
      instructionsEl.textContent = 'All holes placed. Click Finish to save the course.';
      finishBtn.classList.remove('hide');
      break;
  }
}

function cancelHolePlacementWizard() {
  showConfirmModal('All course data will be lost. Continue?', () => {
    document.getElementById('hole-placement-modal').classList.remove('active');
    document.getElementById('new-course-modal').classList.remove('active');
    resetCourseCreationState();
  });
}

/* ---------- Finish review: reconcile hole lengths vs map distances ---------- */

function haversineFeet(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 3.28084; // meters -> feet
}

function bearingDegrees(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function destinationPoint(lat1, lng1, bearingDeg, distanceFeet) {
  const R = 6371000;
  const d = distanceFeet / 3.28084; // feet -> meters
  const toRad = deg => deg * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const brng = toRad(bearingDeg);
  const lat1r = toRad(lat1), lng1r = toRad(lng1);
  const lat2r = Math.asin(Math.sin(lat1r) * Math.cos(d / R) + Math.cos(lat1r) * Math.sin(d / R) * Math.cos(brng));
  const lng2r = lng1r + Math.atan2(Math.sin(brng) * Math.sin(d / R) * Math.cos(lat1r), Math.cos(d / R) - Math.sin(lat1r) * Math.sin(lat2r));
  return { lat: toDeg(lat2r), lng: toDeg(lng2r) };
}

function applyLengthsFromMap() {
  const rows = document.querySelectorAll('#nc-holes-container .new-course-hole-row');
  rows.forEach((row, i) => {
    const geo = pendingHoleGeo[i];
    if (!geo || !geo.tee || !geo.basket) return;
    const feet = haversineFeet(geo.tee.lat, geo.tee.lng, geo.basket.lat, geo.basket.lng);
    const lengthInput = row.querySelector('[data-field="length"]');
    lengthInput.value = Math.round(feet);
  });
}

function applyMapFromLengths() {
  const rows = document.querySelectorAll('#nc-holes-container .new-course-hole-row');
  rows.forEach((row, i) => {
    const geo = pendingHoleGeo[i];
    if (!geo || !geo.tee || !geo.basket) return;
    const lengthInput = row.querySelector('[data-field="length"]');
    const targetFeet = Number(lengthInput.value);
    if (!targetFeet) return;
    const bearing = bearingDegrees(geo.tee.lat, geo.tee.lng, geo.basket.lat, geo.basket.lng);
    const newBasket = destinationPoint(geo.tee.lat, geo.tee.lng, bearing, targetFeet);
    geo.basket = { lat: newBasket.lat, lng: newBasket.lng };
  });
}

function promptSaveOrBack() {
  document.getElementById('save-visibility-modal').classList.add('active');
}

async function finishCourseCreation() {
  const name = document.getElementById('nc-course-name').value.trim();
  const rows = document.querySelectorAll('#nc-holes-container .new-course-hole-row');

  if (!name || rows.length === 0) {
    showGenericModal('Missing course name or hole details.');
    return;
  }

  const holes = [];
  rows.forEach((row, i) => {
    const lengthInput = row.querySelector('[data-field="length"]');
    const parSelect = row.querySelector('[data-field="par"]');
    const hole = {
      number: i + 1,
      length: Number(lengthInput.value) || 0,
      par: Number(parSelect.value) || 3
    };
    const geo = pendingHoleGeo[i];
    if (geo) {
      if (geo.tee) hole.tee = geo.tee;
      if (geo.basket) hole.basket = geo.basket;
      if (geo.waypoints && geo.waypoints.length) hole.waypoints = geo.waypoints;
    }
    holes.push(hole);
  });

  const db = await openDiscTallyDB();
  const courseRecord = { name, holes, visibility: pendingCourseVisibility };
  if (pendingCourseLat != null && pendingCourseLng != null) {
    courseRecord.lat = pendingCourseLat;
    courseRecord.lng = pendingCourseLng;
  }
  await addCourse(db, courseRecord);

  document.getElementById('hole-placement-modal').classList.remove('active');
  closeNewCourseModal();
  resetCourseCreationState();
  await loadCourseOptions();
}

/* ---------- Round / scorecard ---------- */

function startRound(course) {
  const playerName = localStorage.getItem('userName') || 'Player 1';
  const holes = course.holes || [];
  const hasCourseMap = holes.some(h => h.tee || h.basket);

  currentRound = {
    courseId: course.id,
    courseName: course.name,
    holes: holes,
    courseLat: course.lat != null ? course.lat : null,
    courseLng: course.lng != null ? course.lng : null,
    hasCourseMap: hasCourseMap,
    players: [
      { name: playerName, scores: {} }
    ]
  };

  document.getElementById('controls-section').classList.add('hide');
  document.getElementById('course-actions-section').classList.add('hide');
  document.getElementById('stats-section').classList.add('hide');
  document.getElementById('scorecard-card').classList.remove('hide');

  // Only bring up the map if this course actually has tee/basket data saved.
  // Otherwise leave the plain header image showing — an empty satellite
  // view with nothing plotted on it isn't useful.
  if (hasCourseMap) {
    showHeaderMap();
  }
  buildScorecard(currentRound);
}

function exitRound() {
  currentRound = null;
  document.getElementById('scorecard-card').classList.add('hide');
  document.getElementById('controls-section').classList.remove('hide');
  document.getElementById('course-actions-section').classList.remove('hide');
  hideHeaderMap();

  // Tear down the map so the next round (possibly a different course)
  // starts from a clean slate instead of showing this course's overlay.
  if (headerMap) {
    headerMap.remove();
    headerMap = null;
    headerMapMarker = null;
  }
  if (mapZoomMap) {
    mapZoomMap.remove();
    mapZoomMap = null;
    mapZoomMarker = null;
  }
}

// Finds which hole the player is currently on (first hole missing a score
// for the first player), so the round map can center tightly on THAT hole
// instead of fitBounds-ing the entire course (which, spread across 18
// holes, forces a much wider/zoomed-out view than course setup ever used).
function getCurrentHole(round) {
  if (!round || !round.holes || round.holes.length === 0) return null;
  const player = round.players && round.players[0];
  if (player) {
    for (const h of round.holes) {
      if (player.scores[h.number] == null) return h;
    }
  }
  return round.holes[round.holes.length - 1];
}

// Centers on the midpoint between tee and basket when both exist, so
// neither ends up off to one side of the view — falls back to whichever
// single point is available.
function getHoleCenter(hole) {
  if (!hole) return null;
  if (hole.tee && hole.basket) {
    return { lat: (hole.tee.lat + hole.basket.lat) / 2, lng: (hole.tee.lng + hole.basket.lng) / 2 };
  }
  return hole.tee || hole.basket || null;
}

// Called whenever a score is entered — pans the round map to whatever
// hole is now "current" (first hole still missing a score), so the map
// follows along as the round progresses instead of staying on hole 1.
function followMapToCurrentHole() {
  if (!headerMap || !currentRound || !currentRound.hasCourseMap) return;
  const hole = getCurrentHole(currentRound);
  const point = getHoleCenter(hole);
  if (!point) return;
  headerMap.setView([point.lat, point.lng], 18);
}

function renderCourseOverlay(map, holes) {
  const bounds = [];
  holes.forEach(h => {
    if (h.tee) {
      const teeDivIcon = L.divIcon({
        html: '<img src="' + TEE_PAD_ICON_URL + '" style="width:22px;height:44px;display:block;transform:rotate(' + (h.tee.rotation || 0) + 'deg);"/>',
        className: 'placement-div-icon',
        iconSize: [22, 44],
        iconAnchor: [11, 22]
      });
      const m = L.marker([h.tee.lat, h.tee.lng], { icon: teeDivIcon }).addTo(map);
      m.bindTooltip(String(h.number), { permanent: true, direction: 'right', offset: [10, 0], className: 'hole-number-label' });
      bounds.push([h.tee.lat, h.tee.lng]);
    }
    if (h.basket) {
      const m = L.marker([h.basket.lat, h.basket.lng], { icon: makeBasketIcon() }).addTo(map);
      m.bindTooltip(String(h.number), { permanent: true, direction: 'right', offset: [10, 0], className: 'hole-number-label' });
      bounds.push([h.basket.lat, h.basket.lng]);
    }
    if (h.tee && h.basket) {
      const pts = [[h.tee.lat, h.tee.lng]];
      (h.waypoints || []).forEach(w => pts.push([w.lat, w.lng]));
      pts.push([h.basket.lat, h.basket.lng]);
      L.polyline(pts, { color: '#F2B705', weight: 2, opacity: 0.85 }).addTo(map);
    }
  });
  return bounds;
}

/* ---------- Header map ---------- */

function showHeaderMap() {
  const imgEl = document.getElementById('header-image');
  const mapEl = document.getElementById('header-map');
  if (!mapEl) return;

  imgEl.classList.add('hide');
  mapEl.classList.remove('hide');

  const initialCenter = (currentRound && currentRound.courseLat != null && currentRound.courseLng != null)
    ? [currentRound.courseLat, currentRound.courseLng]
    : [0, 0];

  if (!headerMap && typeof L !== 'undefined') {
    headerMap = L.map('header-map', {
      zoomControl: true,
      attributionControl: true,
      zoomAnimation: false,
      fadeAnimation: false,
      doubleClickZoom: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5
    });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
      detectRetina: true
    }).addTo(headerMap);

    if (currentRound && currentRound.hasCourseMap) {
      renderCourseOverlay(headerMap, currentRound.holes);
    }

    // Center tightly on the CURRENT hole (same fixed zoom the course-setup
    // map uses) rather than fitBounds-ing the whole course — fitting every
    // hole into one view is what was forcing the zoomed-way-out result.
    const currentHole = currentRound && currentRound.hasCourseMap ? getCurrentHole(currentRound) : null;
    const holeCenterPoint = getHoleCenter(currentHole);
    const holeCenter = holeCenterPoint ? [holeCenterPoint.lat, holeCenterPoint.lng] : null;

    // Fitting bounds / setting view must happen AFTER the container has
    // actually been laid out (it was just unhidden this same tick), or
    // Leaflet computes against a stale zero-size box and everything
    // ends up positioned wrong — same delayed callback as invalidateSize.
    setTimeout(() => {
      headerMap.invalidateSize();
      if (holeCenter) {
        headerMap.setView(holeCenter, 18);
      } else {
        headerMap.setView(initialCenter, 16);
      }
    }, 50);
  } else if (headerMap) {
    headerMap.setView(initialCenter, 16);
    setTimeout(() => headerMap.invalidateSize(), 50);
  }
}

function hideHeaderMap() {
  const imgEl = document.getElementById('header-image');
  const mapEl = document.getElementById('header-map');
  if (mapEl) mapEl.classList.add('hide');
  if (imgEl) imgEl.classList.remove('hide');

  if (headerMapWatchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(headerMapWatchId);
    headerMapWatchId = null;
  }
}

function wireDoubleTap(el, callback) {
  if (!el) return;
  let lastTapTime = 0;
  const maxDelay = 400; // ms between taps to count as a double-tap

  el.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTapTime < maxDelay) {
      e.preventDefault(); // stop the synthesized click/zoom that would otherwise follow
      callback();
      lastTapTime = 0;
    } else {
      lastTapTime = now;
    }
  });
}

function openMapZoomModal() {
  if (!headerMap || typeof L === 'undefined') return;

  document.getElementById('map-zoom-modal').classList.add('active');

  const center = headerMap.getCenter();
  const zoom = headerMap.getZoom();

  const isNewMap = !mapZoomMap;
  if (isNewMap) {
    mapZoomMap = L.map('map-zoom-map', { zoomAnimation: false, fadeAnimation: false, zoomControl: true, zoomSnap: 0.25, zoomDelta: 0.5 });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
      detectRetina: true
    }).addTo(mapZoomMap);

    // Mirror the same tee/basket/path overlay shown on the small map —
    // this was previously missing entirely from the enlarged view.
    if (currentRound && currentRound.hasCourseMap) {
      renderCourseOverlay(mapZoomMap, currentRound.holes);
    }
  }

  if (headerMapMarker) {
    const markerLatLng = headerMapMarker.getLatLng();
    if (!mapZoomMarker) {
      mapZoomMarker = L.marker(markerLatLng).addTo(mapZoomMap);
    } else {
      mapZoomMarker.setLatLng(markerLatLng);
    }
  }

  // Same layout-timing fix as the small map: don't set the view until
  // the container has actually been laid out (it was just unhidden).
  setTimeout(() => {
    mapZoomMap.invalidateSize();
    mapZoomMap.setView(center, zoom);
  }, 50);
}

function buildScorecard(round) {
  const cont = document.getElementById('scorecard-container');
  cont.innerHTML = '';
  const holes = round.holes || [];
  const front = holes.slice(0, 9);
  const back = holes.slice(9);

  const frontWrap = document.createElement('div');
  frontWrap.className = 'scorecard-half';
  const frontLabel = document.createElement('h5');
  frontLabel.className = 'scorecard-half-label';
  frontLabel.textContent = 'Front 9';
  const frontScroll = document.createElement('div');
  frontScroll.className = 'scorecard-scroll';
  frontScroll.appendChild(buildHoleTable(round, front, 0));
  frontWrap.appendChild(frontLabel);
  frontWrap.appendChild(frontScroll);
  cont.appendChild(frontWrap);

  if (back.length > 0) {
    const backWrap = document.createElement('div');
    backWrap.className = 'scorecard-half';
    const backLabel = document.createElement('h5');
    backLabel.className = 'scorecard-half-label';
    backLabel.textContent = 'Back 9';
    const backScroll = document.createElement('div');
    backScroll.className = 'scorecard-scroll';
    backScroll.appendChild(buildHoleTable(round, back, 9));
    backWrap.appendChild(backLabel);
    backWrap.appendChild(backScroll);
    cont.appendChild(backWrap);
  }

  const totalsBar = document.createElement('div');
  totalsBar.id = 'scorecard-totals-bar';
  totalsBar.className = 'scorecard-totals';
  cont.appendChild(totalsBar);
  renderScorecardTotals(round);
}

function buildHoleTable(round, holesSubset, offset) {
  const table = document.createElement('table');
  const thead = table.createTHead();
  const headRow = thead.insertRow();
  const nameHeaderCell = document.createElement('th');
  nameHeaderCell.textContent = 'Player';
  headRow.appendChild(nameHeaderCell);
  holesSubset.forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = offset + i + 1;
    headRow.appendChild(th);
  });

  const tbody = table.createTBody();
  round.players.forEach((player, playerIdx) => {
    const row = tbody.insertRow();
    const nameCell = row.insertCell();
    nameCell.className = 'player-name-cell';
    nameCell.textContent = player.name;
    nameCell.style.fontSize = computeNameFontSize(player.name);

    holesSubset.forEach((holeObj, i) => {
      const holeNumber = offset + i + 1;
      const cell = row.insertCell();
      const par = Number(holeObj.par) || 3;
      const max = par + 7;
      const existing = player.scores[holeNumber];

      const wrap = document.createElement('div');
      wrap.className = 'score-cell';

      const select = document.createElement('select');
      select.className = 'score-select';
      select.dataset.hole = holeNumber;
      select.dataset.player = playerIdx;

      for (let s = 0; s <= max; s++) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        if (existing != null ? existing === s : s === 0) opt.selected = true;
        select.appendChild(opt);
      }

      const display = document.createElement('span');
      display.className = 'score-display';
      display.textContent = existing != null ? existing : 0;
      if (existing != null) display.classList.add('has-score');

      select.addEventListener('change', () => {
        const value = Number(select.value);
        player.scores[holeNumber] = value;
        display.textContent = value;
        display.classList.add('has-score');
        renderScorecardTotals(round);
        followMapToCurrentHole();
      });

      wrap.appendChild(select);
      wrap.appendChild(display);
      cell.appendChild(wrap);
    });
  });

  const addRow = tbody.insertRow();
  addRow.className = 'add-player-row';
  addRow.addEventListener('click', openAddPlayerModal);

  const addNameCell = addRow.insertCell();
  addNameCell.className = 'player-name-cell add-player-label';
  addNameCell.textContent = 'Add Player';

  holesSubset.forEach(() => {
    const cell = addRow.insertCell();
    const box = document.createElement('div');
    box.className = 'score-cell add-player-box';
    cell.appendChild(box);
  });

  const tfoot = table.createTFoot();
  const footRow = tfoot.insertRow();
  const footLabelCell = footRow.insertCell();
  footLabelCell.textContent = 'Length / Par';
  holesSubset.forEach(h => {
    const td = footRow.insertCell();
    td.textContent = h.length + 'ft / ' + h.par;
  });

  return table;
}

function renderScorecardTotals(round) {
  const bar = document.getElementById('scorecard-totals-bar');
  if (!bar) return;
  bar.innerHTML = round.players.map((p, idx) =>
    '<div class="scorecard-total-row" data-player="' + idx + '"><span>' + p.name + '</span>' +
    '<span class="player-total-value">' + computePlayerTotal(p) + '</span></div>'
  ).join('');
}

async function openLastRoundModal(courseId) {
  const db = await openDiscTallyDB();
  const course = await getCourseById(db, courseId);
  const rounds = await getRoundsByCourse(db, courseId);
  const contentEl = document.getElementById('last-round-modal-content');

  if (!rounds || rounds.length === 0) {
    contentEl.innerHTML = '<p>You haven\'t played this course before.</p>';
  } else {
    const last = rounds.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const userName = localStorage.getItem('userName') || '';
    const entry = getUserEntry(last, userName);
    const coursesById = {};
    if (course) coursesById[course.id] = course;
    const holePars = getRoundHolePars(last, coursesById);
    contentEl.innerHTML = renderRoundRecord(last, entry, holePars);
  }

  document.getElementById('last-round-modal').classList.add('active');
}

function computeNameFontSize(name) {
  const len = (name || '').length;
  if (len <= 8) return '0.95rem';
  if (len <= 12) return '0.85rem';
  if (len <= 16) return '0.75rem';
  return '0.65rem';
}

function computePlayerTotal(player) {
  return Object.values(player.scores).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

/* ---------- Finish round ---------- */

async function finishRound() {
  if (!currentRound) return;

  const db = await openDiscTallyDB();
  const totalPar = currentRound.holes.reduce((sum, h) => sum + (Number(h.par) || 0), 0);
  const roundRecord = {
    courseId: currentRound.courseId,
    courseName: currentRound.courseName,
    date: new Date().toISOString(),
    totalPar: totalPar,
    holes: currentRound.holes.map(h => ({ number: h.number, par: h.par })),
    players: currentRound.players.map(p => ({
      name: p.name,
      total: computePlayerTotal(p),
      scores: Object.entries(p.scores).map(([hole, strokes]) => ({ hole: Number(hole), strokes }))
    }))
  };
  await addRound(db, roundRecord);

  const summaryEl = document.getElementById('round-summary-content');
  summaryEl.innerHTML = currentRound.players.map(p => {
    const total = computePlayerTotal(p);
    const diff = total - totalPar;
    const diffText = diff === 0 ? 'Even' : (diff > 0 ? ('+' + diff) : String(diff));
    return '<p><strong>' + p.name + '</strong>: ' + total + ' (' + diffText + ')</p>';
  }).join('');

  document.getElementById('round-summary-modal').classList.add('active');
}

/* ---------- Add Player ---------- */

function openAddPlayerModal() {
  if (!currentRound) return;
  document.getElementById('add-player-name').value = '';
  document.getElementById('add-player-modal').classList.add('active');
}

function closeAddPlayerModal() {
  document.getElementById('add-player-modal').classList.remove('active');
}

function saveAddPlayer() {
  const nameInput = document.getElementById('add-player-name');
  const name = nameInput.value.trim();
  if (!name) { showGenericModal('Please enter a player name.'); return; }
  if (!currentRound) { closeAddPlayerModal(); return; }

  currentRound.players.push({ name, scores: {} });
  buildScorecard(currentRound);
  closeAddPlayerModal();
}

/* ---------- Stats ---------- */

async function openStatsModal() {
  const db = await openDiscTallyDB();
  const rounds = await getAllRounds(db);
  const courses = await getAllCourses(db);
  const coursesById = {};
  courses.forEach(c => { coursesById[c.id] = c; });
  const userName = localStorage.getItem('userName') || '';

  const container = document.getElementById('stats-modal-content');
  const clearBtn = document.getElementById('clear-all-stats-btn');
  const deleteBtn = document.getElementById('delete-selected-rounds-btn');

  if (!rounds || rounds.length === 0) {
    container.innerHTML = '<p>No rounds recorded yet. Finish a round to see stats here.</p>';
    if (clearBtn) clearBtn.classList.add('hide');
    if (deleteBtn) deleteBtn.classList.add('hide');
    document.getElementById('stats-modal').classList.add('active');
    return;
  }
  if (clearBtn) clearBtn.classList.remove('hide');
  if (deleteBtn) deleteBtn.classList.remove('hide');

  // Overall stats across every course
  const overallDiffs = [];
  rounds.forEach(r => {
    const entry = getUserEntry(r, userName);
    if (entry) overallDiffs.push(entry.total - r.totalPar);
  });
  const overallAvg = overallDiffs.length ? (overallDiffs.reduce((s, v) => s + v, 0) / overallDiffs.length) : 0;

  let html = '<div class="stats-overall-block"><h5>Overall</h5>' +
    '<div class="stats-round-row"><span>Rounds Played</span><span>' + overallDiffs.length + '</span></div>' +
    '<div class="stats-round-row"><span>Average (to par)</span><span>' + formatDiff(overallAvg.toFixed(1)) + '</span></div>' +
    '</div>';

  // Course picker
  const courseNames = {};
  rounds.forEach(r => { courseNames[r.courseId] = r.courseName || ('Course ' + r.courseId); });
  html += '<select id="stats-course-select"><option value="">Select a course</option>';
  Object.keys(courseNames).forEach(id => {
    html += '<option value="' + id + '">' + courseNames[id] + '</option>';
  });
  html += '</select>';

  html += '<div id="stats-course-detail"></div>';

  // Top 5 rounds across all courses
  const ranked = rounds
    .map(r => {
      const entry = getUserEntry(r, userName);
      return entry ? { round: r, entry, diff: entry.total - r.totalPar } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 5);

  html += '<div class="stats-top5-block"><h5>Top 5 Rounds</h5>';
  ranked.forEach(item => {
    const dateStr = new Date(item.round.date).toLocaleDateString();
    html += '<div class="stats-round-row"><span>' + (item.round.courseName || 'Course') + ' &middot; ' + dateStr + '</span>' +
      '<span>' + item.entry.total + ' (' + formatDiff(item.diff) + ')</span></div>';
  });
  html += '</div>';

  container.innerHTML = html;
  document.getElementById('stats-modal').classList.add('active');

  document.getElementById('stats-course-select')?.addEventListener('change', (e) => {
    renderCourseDetail(e.target.value, rounds, coursesById, userName);
  });
}

function formatDiff(diff) {
  const n = Number(diff);
  if (n === 0) return 'Even';
  return n > 0 ? ('+' + n) : String(n);
}

function getUserEntry(round, userName) {
  return round.players.find(p => p.name === userName) || round.players[0] || null;
}

function getRoundHolePars(round, coursesById) {
  if (round.holes && round.holes.length) return round.holes;
  const course = coursesById[round.courseId];
  if (course && course.holes && course.holes.length) {
    return course.holes.map(h => ({ number: h.number, par: h.par }));
  }
  const holeSet = new Set();
  round.players.forEach(p => (p.scores || []).forEach(s => holeSet.add(s.hole)));
  return Array.from(holeSet).sort((a, b) => a - b).map(n => ({ number: n, par: '?' }));
}

function renderCourseDetail(courseIdStr, rounds, coursesById, userName) {
  const detailEl = document.getElementById('stats-course-detail');
  if (!detailEl) return;
  if (!courseIdStr) { detailEl.innerHTML = ''; return; }

  const courseId = Number(courseIdStr);
  const courseRounds = rounds
    .filter(r => r.courseId === courseId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (courseRounds.length === 0) { detailEl.innerHTML = '<p>No rounds for this course.</p>'; return; }

  const diffs = [];
  courseRounds.forEach(r => {
    const entry = getUserEntry(r, userName);
    if (entry) diffs.push(entry.total - r.totalPar);
  });
  const avg = diffs.length ? (diffs.reduce((s, v) => s + v, 0) / diffs.length) : 0;
  const best = diffs.length ? Math.min(...diffs) : 0;

  let html = '<div class="stats-course-averages">' +
    '<div class="stats-round-row"><span>Rounds Played</span><span>' + courseRounds.length + '</span></div>' +
    '<div class="stats-round-row"><span>Average (to par)</span><span>' + formatDiff(avg.toFixed(1)) + '</span></div>' +
    '<div class="stats-round-row"><span>Best (to par)</span><span>' + formatDiff(best) + '</span></div>' +
    '</div>';

  html += '<div class="round-record-list">';
  courseRounds.forEach(r => {
    const entry = getUserEntry(r, userName);
    const holePars = getRoundHolePars(r, coursesById);
    html += renderRoundRecord(r, entry, holePars);
  });
  html += '</div>';

  detailEl.innerHTML = html;
}

function renderRoundRecord(round, userEntry, holePars) {
  const dateStr = new Date(round.date).toLocaleDateString();
  const parYou = round.totalPar + ' / ' + (userEntry ? userEntry.total : '-');
  const scoreMap = {};
  if (userEntry) (userEntry.scores || []).forEach(s => { scoreMap[s.hole] = s.strokes; });

  let holesHtml = '';
  holePars.forEach(h => {
    const shot = scoreMap[h.number] != null ? scoreMap[h.number] : '-';
    holesHtml += '<div class="hole-record-box"><div class="hole-record-label">' + h.number + '/' + h.par + '</div>' +
      '<div class="hole-record-score">' + shot + '</div></div>';
  });

  return '<div class="round-record">' +
    '<div class="round-record-top">' +
      '<label class="round-record-check"><input type="checkbox" class="round-select-checkbox" data-round-id="' + round.id + '"/>' +
      '<span class="round-record-date">' + dateStr + '</span></label>' +
      '<div class="round-record-parme"><span class="round-record-parme-label">Par/You</span>' +
      '<span class="round-record-parme-value">' + parYou + '</span></div>' +
    '</div>' +
    '<div class="round-record-holes">' + holesHtml + '</div>' +
  '</div>';
}
