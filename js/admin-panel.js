/* js/admin-panel.js
   The Admin Map Entry panel — a desktop-only, full-screen tool for
   creating and editing courses (including all existing ones, regardless
   of who created them), separate from the mobile-first flow regular
   users go through.

   Access is gated behind the admin account (name "Dom Dimaggio") —
   there is NO separate admin login screen and NO visible button or
   hint that an admin system exists at all for a regular user. The
   *only* way in is typing the admin's name+password into the app's
   normal Sign In screen (the exact same fields every regular user
   already sees for their own account) — matching those credentials
   there quietly starts an admin session instead of a regular one,
   which is what reveals the Admin Map Entry button. A regular user
   who has never heard of this has nothing to look at, click, or try
   to break into. The admin session is intentionally NOT persisted via
   "keep me signed in" — sessionStorage only, so it always needs to be
   re-entered on a fresh browser session, unlike a regular login. */

const ADMIN_ACCOUNT_NAME = 'Dom Dimaggio';
const ADMIN_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918'; // sha256("admin")

function isAdminSession() {
  return sessionStorage.getItem('isAdminSession') === 'true';
}

// Checked from the Sign In form (namePrompt.js) before falling back to
// the regular user-account check. Returns true and starts an admin
// session if it's a match; otherwise returns false and does nothing.
async function tryAdminSignIn(name, password) {
  if (name !== ADMIN_ACCOUNT_NAME) return false;
  const enteredHash = await hashPassword(password);
  if (enteredHash !== ADMIN_PASSWORD_HASH) return false;
  sessionStorage.setItem('isAdminSession', 'true');
  updateAdminButtonVisibility();
  return true;
}

function endAdminSession() {
  sessionStorage.removeItem('isAdminSession');
  updateAdminButtonVisibility();
}

// Shows the Admin Map Entry button only when BOTH an admin session is
// active AND the viewport is desktop-sized — driven entirely from JS
// (inline style always wins over the CSS class's own media query) so
// there's one single place this logic lives.
function updateAdminButtonVisibility() {
  const btn = document.getElementById('admin-map-entry-btn');
  if (!btn) return;
  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  btn.style.display = (isAdminSession() && isDesktop) ? 'inline-block' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  updateAdminButtonVisibility();
  window.addEventListener('resize', updateAdminButtonVisibility);
});

// Admin Map Entry state
let adminMap = null;
let adminMapLocationTracker = null;
let adminEditingCourseId = null;   // null = creating a new course
let adminHoleMarkers = {};         // { [holeNumber]: { teeMarker, basketMarker } }
let adminArmedAction = null;       // { holeNumber, kind: 'tee'|'basket' } — next map click places/moves this pin
let adminSelectedHole = null;      // which hole's checkbox is currently checked — the shared toolbar acts on this hole
let adminCourseLat = null;
let adminCourseLng = null;
let adminNumbersLocked = false; // when true, hole-number labels move/scale as one with their marker instead of being independently draggable
let adminRefImageScale = 1; // reference-overlay scale, controlled by mouse wheel while map is locked
let adminRefImageOffsetX = 0; // reference-overlay position offset (px), controlled by dragging while locked
let adminRefImageOffsetY = 0;
let adminEditingLogoDataUrl = null; // pending logo (base64 data URL) for the admin editor
let adminHoleHazards = {}; // { [holeNumber]: { dogleg, water, trees, ob } } — set via the shared toolbar checkboxes for whichever hole is selected

function loadAdminRefImageFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const overlay = document.getElementById('admin-ref-image-overlay');
    overlay.src = reader.result;
    overlay.style.opacity = document.getElementById('admin-ref-image-opacity').value / 100;
    adminRefImageScale = 1;
    adminRefImageOffsetX = 0;
    adminRefImageOffsetY = 0;
    applyRefImageTransform();
    overlay.classList.remove('hide');
    document.getElementById('admin-remove-ref-image-btn').classList.remove('hide');
  };
  reader.readAsDataURL(file);
}

// Recomputes the reference overlay's CSS transform from the current
// scale + drag offset — called any time either one changes.
function applyRefImageTransform() {
  const overlay = document.getElementById('admin-ref-image-overlay');
  overlay.style.transform =
    'translate(calc(-50% + ' + adminRefImageOffsetX + 'px), calc(-50% + ' + adminRefImageOffsetY + 'px)) scale(' + adminRefImageScale + ')';
}

// Freezes/unfreezes the real map's zoom and pan so it stays a fixed,
// known scale — the reference image is what gets resized to match it,
// rather than fighting to zoom the real map to some arbitrary screenshot
// scale that Leaflet's zoom levels were never going to line up with.
function setAdminMapLocked(locked) {
  if (!adminMap) return;
  const toggle = locked ? 'disable' : 'enable';
  adminMap.dragging[toggle]();
  adminMap.scrollWheelZoom[toggle]();
  adminMap.doubleClickZoom[toggle]();
  adminMap.touchZoom[toggle]();
  adminMap.boxZoom[toggle]();
  if (adminMap.keyboard) adminMap.keyboard[toggle]();
  const zoomControl = document.querySelector('#admin-map .leaflet-control-zoom');
  if (zoomControl) zoomControl.style.display = locked ? 'none' : '';

  // Note: the reference overlay's pointer-events stays 'none' at all
  // times (see CSS) — dragging is handled via the wrapper element with
  // a movement threshold instead, so clicks always reach the real map
  // for Set Tee/Basket/Waypoint regardless of lock state.
  const overlay = document.getElementById('admin-ref-image-overlay');
  overlay.style.cursor = locked ? 'grab' : 'default';
}

async function handleAdminFindLocation() {
  const address = document.getElementById('admin-course-address').value.trim();
  const location = document.getElementById('admin-course-location').value.trim();
  const query = [address, location].filter(Boolean).join(', ');
  const statusEl = document.getElementById('admin-location-status');
  if (!query) { statusEl.textContent = 'Enter an address and/or location above to search.'; return; }

  statusEl.textContent = 'Searching...';
  const result = await geocodeQuery(query);
  if (!result) {
    statusEl.textContent = 'Nothing found for that. Try a fuller address or a nearby town/park name.';
    return;
  }

  adminCourseLat = result.lat;
  adminCourseLng = result.lng;
  statusEl.textContent = 'Found: ' + (result.displayName || query);

  if (adminMap) {
    adminMap.setView([adminCourseLat, adminCourseLng], 17);
  }
}

function handleAdminLogoFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Downscale to a reasonable max dimension before storing, so the
      // course record doesn't balloon in size from a full-resolution photo.
      const maxDim = 200;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      adminEditingLogoDataUrl = canvas.toDataURL('image/png');

      const preview = document.getElementById('admin-course-logo-preview');
      preview.src = adminEditingLogoDataUrl;
      preview.classList.remove('hide');
      document.getElementById('admin-remove-logo-btn').classList.remove('hide');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function openAdminPanel() {
  document.getElementById('admin-panel').classList.add('active');
  document.getElementById('admin-list-screen').classList.remove('hide');
  document.getElementById('admin-editor-screen').classList.add('hide');
  renderAdminCourseList();
}

function closeAdminPanel() {
  document.getElementById('admin-panel').classList.remove('active');
  stopLiveLocationTracking(adminMapLocationTracker);
  adminMapLocationTracker = null;
  if (adminMap) { adminMap.remove(); adminMap = null; }
  adminHoleMarkers = {};
}

async function renderAdminCourseList() {
  const db = await openDiscTallyDB();
  const courses = await getAllCourses(db);
  const listEl = document.getElementById('admin-course-list');
  listEl.innerHTML = '';

  if (courses.length === 0) {
    listEl.innerHTML = '<p>No courses in the system yet.</p>';
    return;
  }

  courses.forEach(course => {
    const row = document.createElement('div');
    row.className = 'admin-course-row';

    const leftWrap = document.createElement('div');
    leftWrap.style.display = 'flex';
    leftWrap.style.alignItems = 'center';
    leftWrap.style.gap = '0.6rem';

    if (course.logo) {
      const img = document.createElement('img');
      img.src = course.logo;
      img.alt = '';
      img.style.width = '32px';
      img.style.height = '32px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '0.3rem';
      leftWrap.appendChild(img);
    }

    const label = document.createElement('span');
    const totalPar = (course.holes || []).reduce((sum, h) => sum + (Number(h.par) || 0), 0);
    const courseRating = computeCourseRating(course);
    label.textContent = (course.name || 'Course ' + course.id) + ' (' + (course.holes || []).length + ' holes' +
      (totalPar ? (', Par ' + totalPar) : '') +
      (courseRating != null ? (', Rating ' + courseRating.toFixed(1)) : '') + ')';
    const tag = document.createElement('span');
    tag.className = 'admin-course-tag';
    tag.textContent = course.source === 'admin' ? '[stock]' : '[user]';
    label.appendChild(tag);
    leftWrap.appendChild(label);

    const editBtn = document.createElement('button');
    editBtn.className = 'paper-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openAdminEditor(course));

    row.appendChild(leftWrap);
    row.appendChild(editBtn);
    listEl.appendChild(row);
  });
}

function openAdminEditor(course) {
  adminEditingCourseId = course ? course.id : null;
  adminHoleMarkers = {};
  adminArmedAction = null;
  adminEditingLogoDataUrl = course ? (course.logo || null) : null;
  const secondaryToggleEl = document.getElementById('admin-secondary-holes-toggle');
  if (secondaryToggleEl) delete secondaryToggleEl.dataset.userSet;
  adminCourseLat = course && course.lat != null ? course.lat : null;
  adminCourseLng = course && course.lng != null ? course.lng : null;
  document.getElementById('admin-location-status').textContent = '';

  // Reset any leftover reference-image overlay from a previous editing session.
  const refOverlay = document.getElementById('admin-ref-image-overlay');
  refOverlay.src = '';
  refOverlay.classList.add('hide');
  adminRefImageScale = 1;
  adminRefImageOffsetX = 0;
  adminRefImageOffsetY = 0;
  applyRefImageTransform();
  document.getElementById('admin-ref-image-opacity').value = 50;
  document.getElementById('admin-remove-ref-image-btn').classList.add('hide');
  document.getElementById('admin-lock-map-checkbox').checked = false;
  document.getElementById('admin-lock-numbers-checkbox').checked = false;
  adminNumbersLocked = false;
  document.getElementById('admin-lock-ref-checkbox').checked = false;
  refOverlay.style.pointerEvents = 'none';
  refOverlay.style.cursor = 'default';

  const logoPreview = document.getElementById('admin-course-logo-preview');
  const removeLogoBtn = document.getElementById('admin-remove-logo-btn');
  document.getElementById('admin-course-logo-input').value = '';
  if (adminEditingLogoDataUrl) {
    logoPreview.src = adminEditingLogoDataUrl;
    logoPreview.classList.remove('hide');
    removeLogoBtn.classList.remove('hide');
  } else {
    logoPreview.src = '';
    logoPreview.classList.add('hide');
    removeLogoBtn.classList.add('hide');
  }

  document.getElementById('admin-editor-title').textContent = course ? ('Editing: ' + course.name) : 'New Course';
  document.getElementById('admin-course-name').value = course ? (course.name || '') : '';
  document.getElementById('admin-course-location').value = course ? (course.location || '') : '';
  document.getElementById('admin-course-address').value = course ? (course.address || '') : '';

  const holeCountSelect = document.getElementById('admin-hole-count');
  holeCountSelect.innerHTML = '';
  const holeCount = course && course.holes ? course.holes.length : 18;
  for (let i = 1; i <= 36; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    if (i === holeCount) opt.selected = true;
    holeCountSelect.appendChild(opt);
  }

  generateAdminHoleFields(course);

  document.getElementById('admin-list-screen').classList.add('hide');
  document.getElementById('admin-editor-screen').classList.remove('hide');

  stopLiveLocationTracking(adminMapLocationTracker);
  adminMapLocationTracker = null;
  if (adminMap) { adminMap.remove(); adminMap = null; }
  const center = (course && course.lat != null && course.lng != null) ? [course.lat, course.lng] : [39.8283, -98.5795];
  const zoom = (course && course.lat != null) ? 17 : 6;

  adminMap = L.map('admin-map', { zoomSnap: 1, zoomDelta: 1, maxZoom: 21 });
  L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri'
  }).addTo(adminMap);
  adminMapLocationTracker = startLiveLocationTracking(adminMap);
  adminMap.on('click', handleAdminMapClick);
  adminMap.on('zoomend', rescaleAdminMarkers);
  setTimeout(() => {
    adminMap.invalidateSize();
    adminMap.setView(center, zoom);

    // Plot existing tee/basket pins as draggable markers — done AFTER
    // setView (not immediately on map creation) since positioning a
    // label marker via containerPointToLatLng requires the map to
    // already have a real zoom/center, or it computes garbage
    // coordinates that land off-screen.
    if (course && course.holes) {
      const scale = scaleForZoom(adminMap);
      course.holes.forEach(h => {
        adminHoleMarkers[h.number] = {};
        if (h.tee) {
          const m = L.marker([h.tee.lat, h.tee.lng], { icon: makeTeeDivIcon(h.tee.rotation || 0, scale), draggable: true }).addTo(adminMap);
          m._rotationDeg = h.tee.rotation || 0;
          m.on('drag', () => updateAdminLivePath(h.number));
          updateMarkerHoleLabel(m, [h.number], { baseOffset: h.tee.labelOffset });
          adminHoleMarkers[h.number].teeMarker = m;
        }
        if (h.basket) {
          const m = L.marker([h.basket.lat, h.basket.lng], { icon: makeBasketIcon(scale), draggable: true }).addTo(adminMap);
          m.on('drag', () => updateAdminLivePath(h.number));
          updateMarkerHoleLabel(m, [h.number], { baseOffset: h.basket.labelOffset });
          adminHoleMarkers[h.number].basketMarker = m;
        }
        if (h.secondTee) {
          const m = L.marker([h.secondTee.lat, h.secondTee.lng], { icon: makeSecondTeeDivIcon(h.secondTee.rotation || 0, scale), draggable: true }).addTo(adminMap);
          m._rotationDeg = h.secondTee.rotation || 0;
          m.on('drag', () => updateAdminLivePath(h.number));
          updateMarkerHoleLabel(m, [h.number + 'A'], { baseOffset: h.secondTee.labelOffset, isAlt: true });
          adminHoleMarkers[h.number].secondTeeMarker = m;
        }
        if (h.secondBasket) {
          const m = L.marker([h.secondBasket.lat, h.secondBasket.lng], { icon: makeSecondBasketIcon(scale), draggable: true }).addTo(adminMap);
          m.on('drag', () => updateAdminLivePath(h.number));
          updateMarkerHoleLabel(m, [h.number + 'A'], { baseOffset: h.secondBasket.labelOffset, isAlt: true });
          adminHoleMarkers[h.number].secondBasketMarker = m;
        }
        if (h.waypoints && h.waypoints.length) {
          adminHoleMarkers[h.number].waypointMarkers = h.waypoints.map(w =>
            createAdminWaypointMarker([w.lat, w.lng], h.number, false)
          );
        }
        if (h.secondWaypoints && h.secondWaypoints.length) {
          adminHoleMarkers[h.number].secondWaypointMarkers = h.secondWaypoints.map(w =>
            createAdminWaypointMarker([w.lat, w.lng], h.number, true)
          );
        }
        adminHoleMarkers[h.number].secondPathTarget = h.secondPathTarget === 'primary' ? 'primary' : 'second';
        updateAdminLivePath(h.number);
      });
    }
  }, 50);
}

// Updates the shared map toolbar (label + rotation slider) for whichever
// hole's checkbox was just checked/unchecked.
function selectAdminHole(holeNumber) {
  adminSelectedHole = holeNumber;
  const label = document.getElementById('admin-selected-hole-label');
  const slider = document.getElementById('admin-rotation-slider');
  if (holeNumber == null) {
    label.textContent = 'No hole selected';
    slider.value = 0;
    HAZARD_TYPES.forEach(type => {
      document.getElementById('admin-hazard-' + type).checked = false;
    });
    updateAdminSecondPathTargetButton();
    return;
  }
  label.textContent = 'Hole ' + holeNumber + ' selected';
  const holeData = adminHoleMarkers[holeNumber];
  slider.value = String((holeData && holeData.teeMarker && holeData.teeMarker._rotationDeg) || 0);
  const hazards = adminHoleHazards[holeNumber] || {};
  HAZARD_TYPES.forEach(type => {
    document.getElementById('admin-hazard-' + type).checked = !!hazards[type];
  });
  updateAdminSecondPathTargetButton();
}

// The "Path to: ..." option only makes sense once the selected hole has
// both a main basket and a 2nd basket — otherwise disable it rather
// than removing it outright, and keep its label in sync with whichever
// hole is currently selected.
function updateAdminSecondPathTargetButton() {
  const opt = document.getElementById('admin-action-toggle-path-option');
  if (!opt) return;
  const holeData = adminSelectedHole != null ? adminHoleMarkers[adminSelectedHole] : null;
  const eligible = !!(holeData && holeData.basketMarker && holeData.secondBasketMarker);
  opt.disabled = !eligible;
  const target = (holeData && holeData.secondPathTarget === 'primary') ? 'primary' : 'second';
  opt.textContent = 'Path to: ' + (target === 'primary' ? 'Main Basket' : '2nd Basket');
}

function toggleAdminSecondPathTarget() {
  if (adminSelectedHole == null) { showGenericModal('Check a hole first.'); return; }
  const holeData = adminHoleMarkers[adminSelectedHole];
  if (!holeData || !holeData.basketMarker || !holeData.secondBasketMarker) {
    showGenericModal('This hole needs both a main basket and a 2nd basket first.');
    return;
  }
  holeData.secondPathTarget = (holeData.secondPathTarget === 'primary') ? 'second' : 'primary';
  updateAdminLivePath(adminSelectedHole);
  updateAdminSecondPathTargetButton();
}

// Removing the 2nd tee cascades to its 2nd basket and waypoints, since
// those only exist to support the 2nd tee's own path.
function deleteAdminSecondTee() {
  if (adminSelectedHole == null) { showGenericModal('Check a hole first.'); return; }
  const holeData = adminHoleMarkers[adminSelectedHole];
  if (!holeData || !holeData.secondTeeMarker) return;
  showConfirmModal('Delete the 2nd tee for Hole ' + adminSelectedHole + '? This also removes its 2nd basket and waypoints, if any.', () => {
    removeMarkerAndLabel(adminMap, holeData.secondTeeMarker);
    holeData.secondTeeMarker = null;
    if (holeData.secondBasketMarker) {
      removeMarkerAndLabel(adminMap, holeData.secondBasketMarker);
      holeData.secondBasketMarker = null;
    }
    if (holeData.secondWaypointMarkers) {
      holeData.secondWaypointMarkers.forEach(m => adminMap.removeLayer(m));
      holeData.secondWaypointMarkers = [];
    }
    holeData.secondPathTarget = 'second';
    updateAdminLivePath(adminSelectedHole);
    updateAdminSecondPathTargetButton();
  });
}

// Removing just the 2nd basket keeps the 2nd tee and its waypoints —
// the live path falls back to the main basket (same fallback the final
// saved-course rendering already uses when no 2nd basket exists).
function deleteAdminSecondBasket() {
  if (adminSelectedHole == null) { showGenericModal('Check a hole first.'); return; }
  const holeData = adminHoleMarkers[adminSelectedHole];
  if (!holeData || !holeData.secondBasketMarker) return;
  showConfirmModal('Delete the 2nd basket for Hole ' + adminSelectedHole + '?', () => {
    removeMarkerAndLabel(adminMap, holeData.secondBasketMarker);
    holeData.secondBasketMarker = null;
    holeData.secondPathTarget = 'second';
    updateAdminLivePath(adminSelectedHole);
    updateAdminSecondPathTargetButton();
  });
}

function generateAdminHoleFields(course) {
  const count = Number(document.getElementById('admin-hole-count').value) || 18;
  const container = document.getElementById('admin-holes-container');
  container.innerHTML = '';
  adminHoleHazards = {};
  selectAdminHole(null);

  const secondaryToggle = document.getElementById('admin-secondary-holes-toggle');
  // Default the toggle on if this course already has secondary-hole
  // data, so opening an existing course for editing doesn't hide data
  // that's actually there — otherwise default off for a clean simple view.
  if (secondaryToggle && !secondaryToggle.dataset.userSet) {
    secondaryToggle.checked = !!(course && course.holes && course.holes.some(h => h.secondLength));
  }
  const showSecondaryHoles = !!(secondaryToggle && secondaryToggle.checked);

  for (let i = 1; i <= count; i++) {
    const existingHole = course && course.holes ? course.holes.find(h => h.number === i) : null;

    const row = document.createElement('div');
    row.className = 'admin-hole-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.hole = i;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        document.querySelectorAll('#admin-holes-container input[type="checkbox"]').forEach(cb => {
          if (cb !== checkbox) cb.checked = false;
        });
        selectAdminHole(i);
      } else {
        selectAdminHole(null);
      }
    });

    const label = document.createElement('span');
    label.className = 'admin-hole-label';
    label.dataset.holeNumber = i;
    label.dataset.role = 'main';
    label.textContent = showSecondaryHoles ? (i + 'A') : String(i);

    const secondLabel = document.createElement('span');
    secondLabel.className = 'admin-hole-label';
    secondLabel.dataset.holeNumber = i;
    secondLabel.dataset.role = 'second';
    secondLabel.textContent = i + 'B';

    const lengthInput = document.createElement('input');
    lengthInput.type = 'number';
    lengthInput.min = '1';
    lengthInput.placeholder = 'Length (ft)';
    lengthInput.dataset.hole = i;
    lengthInput.dataset.field = 'length';
    if (existingHole) lengthInput.value = existingHole.length || '';

    const secondLengthInput = document.createElement('input');
    secondLengthInput.type = 'number';
    secondLengthInput.min = '1';
    secondLengthInput.placeholder = '2nd Tee (ft)';
    secondLengthInput.dataset.hole = i;
    secondLengthInput.dataset.field = 'secondLength';
    if (existingHole) secondLengthInput.value = existingHole.secondLength || '';

    const parSelect = document.createElement('select');
    parSelect.dataset.hole = i;
    parSelect.dataset.field = 'par';
    for (let p = 2; p <= 7; p++) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = 'Par ' + p;
      if (existingHole ? existingHole.par === p : p === 3) opt.selected = true;
      parSelect.appendChild(opt);
    }

    const secondParSelect = document.createElement('select');
    secondParSelect.dataset.hole = i;
    secondParSelect.dataset.field = 'secondPar';
    for (let p = 2; p <= 7; p++) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = 'Par ' + p;
      if (existingHole && existingHole.secondPar === p) opt.selected = true;
      else if (!existingHole && p === 3) opt.selected = true;
      secondParSelect.appendChild(opt);
    }

    // Fixed width + centered text so "1A"/"1B" (and any future 2-digit
    // hole like "10A"/"10B") line up consistently regardless of how
    // many characters the label actually has.
    label.style.cssText = 'min-width:2.5rem;text-align:center;flex:0 0 auto;';
    secondLabel.style.cssText = 'min-width:2.5rem;text-align:center;flex:0 0 auto;';

    const fieldsRowA = document.createElement('div');
    fieldsRowA.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:0.5rem;';
    fieldsRowA.appendChild(label);
    fieldsRowA.appendChild(lengthInput);
    fieldsRowA.appendChild(parSelect);

    const fieldsRowB = document.createElement('div');
    fieldsRowB.className = 'admin-hole-row-b';
    fieldsRowB.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:0.5rem;margin-top:0.35rem;';
    fieldsRowB.appendChild(secondLabel);
    fieldsRowB.appendChild(secondLengthInput);
    fieldsRowB.appendChild(secondParSelect);

    // The two stacked A/B rows live in their own column so the checkbox
    // can sit beside that whole column as a single flex item — with
    // align-items:center on the outer row, that vertically centers the
    // checkbox against the combined height of both rows, instead of
    // pinning it to row A's height only.
    const stackedCol = document.createElement('div');
    stackedCol.style.cssText = 'display:flex;flex-direction:column;flex:1;';
    stackedCol.appendChild(fieldsRowA);
    stackedCol.appendChild(fieldsRowB);

    // align-self:center (on top of the row's own align-items:center)
    // makes sure the checkbox is vertically centered against the full
    // stacked-column height specifically, not just whatever the browser
    // defaults a bare <input> to.
    checkbox.style.cssText = 'flex:0 0 auto;align-self:center;margin:0;';

    // flex-direction:row is set explicitly here (not just relying on
    // the .admin-hole-row class) because a phone-width media query
    // overrides that class to flex-direction:column, and an inline
    // style only wins over a stylesheet rule property-by-property —
    // omitting flex-direction from this inline style let that column
    // override slip through, which is what stacked the checkbox above
    // the fields instead of beside them.
    row.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:0.5rem;width:100%;';
    row.appendChild(checkbox);
    row.appendChild(stackedCol);

    if (!showSecondaryHoles) fieldsRowB.classList.add('hide');

    // Track this hole's hazard state (read/updated by the shared toolbar
    // checkboxes, not per-row inputs) so it survives regardless of
    // whether this row is currently visible/selected.
    adminHoleHazards[i] = (existingHole && existingHole.hazards) ? Object.assign({}, existingHole.hazards) : {};

    container.appendChild(row);
  }
}

function createAdminWaypointMarker(latlng, holeNumber, isSecond) {
  const wpIcon = L.divIcon({
    html: '<div style="width:12px;height:12px;border-radius:50%;background:var(--mustard);border:2px solid var(--dark-teal);"></div>',
    className: 'placement-div-icon',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });
  const m = L.marker(latlng, { icon: wpIcon, draggable: true }).addTo(adminMap);
  m.on('drag', () => updateAdminLivePath(holeNumber));
  m.on('click', () => {
    const holeData = adminHoleMarkers[holeNumber];
    const key = isSecond ? 'secondWaypointMarkers' : 'waypointMarkers';
    if (!holeData || !holeData[key]) return;
    adminMap.removeLayer(m);
    holeData[key] = holeData[key].filter(wp => wp !== m);
    updateAdminLivePath(holeNumber);
  });
  return m;
}

// Live-updating path preview for a hole's tee->waypoints->basket line
// (and, if a 2nd tee exists, its own dashed path) — redrawn from
// scratch on every placement, drag, or removal so it always matches
// exactly what's currently on the map. Uses the same curve math as the
// final saved-course rendering (catmullRomSplinePoints, in round.js).
function adminLLArr(marker) {
  const ll = marker.getLatLng();
  return [ll.lat, ll.lng];
}

function updateAdminLivePath(holeNumber) {
  const holeData = adminHoleMarkers[holeNumber];
  if (!holeData || !adminMap) return;

  if (holeData.livePath) { adminMap.removeLayer(holeData.livePath); holeData.livePath = null; }
  if (holeData.teeMarker && holeData.basketMarker) {
    const pts = [adminLLArr(holeData.teeMarker)];
    (holeData.waypointMarkers || []).forEach(m => pts.push(adminLLArr(m)));
    pts.push(adminLLArr(holeData.basketMarker));
    holeData.livePath = L.polyline(catmullRomSplinePoints(pts), { color: '#FFD400', weight: 2, opacity: 0.85 }).addTo(adminMap);
  }

  if (holeData.secondLivePath) { adminMap.removeLayer(holeData.secondLivePath); holeData.secondLivePath = null; }
  if (holeData.secondTeeMarker) {
    const endBasket = (holeData.secondPathTarget === 'primary') ? holeData.basketMarker : (holeData.secondBasketMarker || holeData.basketMarker);
    if (endBasket) {
      const pts2 = [adminLLArr(holeData.secondTeeMarker)];
      (holeData.secondWaypointMarkers || []).forEach(m => pts2.push(adminLLArr(m)));
      pts2.push(adminLLArr(endBasket));
      holeData.secondLivePath = L.polyline(catmullRomSplinePoints(pts2), { color: '#FFD400', weight: 2, opacity: 0.85, dashArray: '4,6' }).addTo(adminMap);
    }
  }
}

function handleAdminMapClick(e) {
  if (!adminArmedAction) return;
  const { holeNumber, kind } = adminArmedAction;
  adminHoleMarkers[holeNumber] = adminHoleMarkers[holeNumber] || {};
  const holeData = adminHoleMarkers[holeNumber];

  if (kind === 'tee') {
    if (holeData.teeMarker) {
      holeData.teeMarker.setLatLng(e.latlng);
    } else {
      const m = L.marker(e.latlng, { icon: makeTeeDivIcon(0, scaleForZoom(adminMap)), draggable: true }).addTo(adminMap);
      m._rotationDeg = 0;
      m.on('drag', () => updateAdminLivePath(holeNumber));
      updateMarkerHoleLabel(m, [holeNumber]);
      holeData.teeMarker = m;
    }
  } else if (kind === 'basket') {
    if (holeData.basketMarker) {
      holeData.basketMarker.setLatLng(e.latlng);
    } else {
      const m = L.marker(e.latlng, { icon: makeBasketIcon(scaleForZoom(adminMap)), draggable: true }).addTo(adminMap);
      m.on('drag', () => updateAdminLivePath(holeNumber));
      updateMarkerHoleLabel(m, [holeNumber]);
      holeData.basketMarker = m;
    }
  } else if (kind === 'secondTee') {
    if (holeData.secondTeeMarker) {
      holeData.secondTeeMarker.setLatLng(e.latlng);
    } else {
      const m = L.marker(e.latlng, { icon: makeSecondTeeDivIcon(0, scaleForZoom(adminMap)), draggable: true }).addTo(adminMap);
      m._rotationDeg = 0;
      m.on('drag', () => updateAdminLivePath(holeNumber));
      updateMarkerHoleLabel(m, [holeNumber + 'A'], { isAlt: true });
      holeData.secondTeeMarker = m;
    }
  } else if (kind === 'secondBasket') {
    if (holeData.secondBasketMarker) {
      holeData.secondBasketMarker.setLatLng(e.latlng);
    } else {
      const m = L.marker(e.latlng, { icon: makeSecondBasketIcon(scaleForZoom(adminMap)), draggable: true }).addTo(adminMap);
      m.on('drag', () => updateAdminLivePath(holeNumber));
      updateMarkerHoleLabel(m, [holeNumber + 'A'], { isAlt: true });
      holeData.secondBasketMarker = m;
    }
  } else if (kind === 'waypoint') {
    holeData.waypointMarkers = holeData.waypointMarkers || [];
    holeData.waypointMarkers.push(createAdminWaypointMarker(e.latlng, holeNumber, false));
  } else if (kind === 'secondWaypoint') {
    holeData.secondWaypointMarkers = holeData.secondWaypointMarkers || [];
    holeData.secondWaypointMarkers.push(createAdminWaypointMarker(e.latlng, holeNumber, true));
  }
  adminArmedAction = null;
  updateAdminLivePath(holeNumber);
  if (adminSelectedHole === holeNumber) updateAdminSecondPathTargetButton();
}

// Called on 'zoomend' — updates every placed tee/basket marker's size to
// match the new zoom, same as the round-view maps. Without this, markers
// stay a fixed pixel size while the ground detail around them grows/shrinks
// as you zoom, making them look like they're shrinking as you zoom in.
function rescaleAdminMarkers() {
  const scale = scaleForZoom(adminMap);
  Object.values(adminHoleMarkers).forEach(holeData => {
    if (holeData.teeMarker) {
      holeData.teeMarker.setIcon(makeTeeDivIcon(holeData.teeMarker._rotationDeg || 0, scale));
      forceReenableDragging(holeData.teeMarker);
      rescaleHoleLabel(holeData.teeMarker, adminMap, !adminNumbersLocked);
    }
    if (holeData.basketMarker) {
      holeData.basketMarker.setIcon(makeBasketIcon(scale));
      forceReenableDragging(holeData.basketMarker);
      rescaleHoleLabel(holeData.basketMarker, adminMap, !adminNumbersLocked);
    }
    if (holeData.secondTeeMarker) {
      holeData.secondTeeMarker.setIcon(makeSecondTeeDivIcon(holeData.secondTeeMarker._rotationDeg || 0, scale));
      forceReenableDragging(holeData.secondTeeMarker);
      rescaleHoleLabel(holeData.secondTeeMarker, adminMap, !adminNumbersLocked);
    }
    if (holeData.secondBasketMarker) {
      holeData.secondBasketMarker.setIcon(makeSecondBasketIcon(scale));
      forceReenableDragging(holeData.secondBasketMarker);
      rescaleHoleLabel(holeData.secondBasketMarker, adminMap, !adminNumbersLocked);
    }
  });
}

// Locks/unlocks every placed hole-number label. Recreates each label
// fresh with the new draggable state (rather than toggling .enable() on
// the existing one) for the same reliability reason as rescaleHoleLabel.
function setAdminNumbersLocked(locked) {
  adminNumbersLocked = locked;
  Object.values(adminHoleMarkers).forEach(holeData => {
    [holeData.teeMarker, holeData.basketMarker, holeData.secondTeeMarker, holeData.secondBasketMarker].forEach(marker => {
      if (!marker || !marker._holeLabelMarker) return;
      rescaleHoleLabel(marker, adminMap, !locked);
    });
  });
}

// Captures a marker's attached label position — now just reads the
// value already stored on the label marker itself.
function getLabelBaseOffset(marker) {
  return (marker && marker._holeLabelMarker && marker._holeLabelMarker._baseOffsetPx) || null;
}

async function saveAdminCourse() {
  const name = document.getElementById('admin-course-name').value.trim();
  if (!name) { showGenericModal('Please enter a course name.'); return; }
  const location = document.getElementById('admin-course-location').value.trim();
  const address = document.getElementById('admin-course-address').value.trim();

  const rows = document.querySelectorAll('#admin-holes-container .admin-hole-row');
  const holes = [];
  rows.forEach((row, i) => {
    const holeNumber = i + 1;
    const lengthInput = row.querySelector('[data-field="length"]');
    const parSelect = row.querySelector('[data-field="par"]');
    const secondLengthInput = row.querySelector('[data-field="secondLength"]');
    const secondParSelect = row.querySelector('[data-field="secondPar"]');
    const hole = {
      number: holeNumber,
      length: Number(lengthInput.value) || 0,
      par: Number(parSelect.value) || 3
    };
    if (secondLengthInput && Number(secondLengthInput.value) > 0) {
      hole.secondLength = Number(secondLengthInput.value);
      hole.secondPar = Number(secondParSelect && secondParSelect.value) || hole.par;
    }
    const hazards = {};
    const storedHazards = adminHoleHazards[holeNumber] || {};
    HAZARD_TYPES.forEach(type => {
      if (storedHazards[type]) hazards[type] = true;
    });
    if (Object.keys(hazards).length) hole.hazards = hazards;
    const holeData = adminHoleMarkers[holeNumber];
    if (holeData && holeData.teeMarker) {
      const ll = holeData.teeMarker.getLatLng();
      hole.tee = { lat: ll.lat, lng: ll.lng, rotation: holeData.teeMarker._rotationDeg || 0 };
      const labelOffset = getLabelBaseOffset(holeData.teeMarker);
      if (labelOffset) hole.tee.labelOffset = labelOffset;
    }

    if (holeData && holeData.basketMarker) {
      const ll = holeData.basketMarker.getLatLng();
      hole.basket = { lat: ll.lat, lng: ll.lng };
      const labelOffset = getLabelBaseOffset(holeData.basketMarker);
      if (labelOffset) hole.basket.labelOffset = labelOffset;
    }
    if (holeData && holeData.secondTeeMarker) {
      const ll = holeData.secondTeeMarker.getLatLng();
      hole.secondTee = { lat: ll.lat, lng: ll.lng, rotation: holeData.secondTeeMarker._rotationDeg || 0 };
      const labelOffset = getLabelBaseOffset(holeData.secondTeeMarker);
      if (labelOffset) hole.secondTee.labelOffset = labelOffset;
    }
    if (holeData && holeData.secondBasketMarker) {
      const ll = holeData.secondBasketMarker.getLatLng();
      hole.secondBasket = { lat: ll.lat, lng: ll.lng };
      const labelOffset = getLabelBaseOffset(holeData.secondBasketMarker);
      if (labelOffset) hole.secondBasket.labelOffset = labelOffset;
    }
    if (holeData && holeData.waypointMarkers && holeData.waypointMarkers.length) {
      hole.waypoints = holeData.waypointMarkers.map(m => {
        const ll = m.getLatLng();
        return { lat: ll.lat, lng: ll.lng };
      });
    }
    if (holeData && holeData.secondWaypointMarkers && holeData.secondWaypointMarkers.length) {
      hole.secondWaypoints = holeData.secondWaypointMarkers.map(m => {
        const ll = m.getLatLng();
        return { lat: ll.lat, lng: ll.lng };
      });
    }
    if (holeData && holeData.secondTeeMarker && holeData.secondBasketMarker) {
      hole.secondPathTarget = holeData.secondPathTarget === 'primary' ? 'primary' : 'second';
    }
    holes.push(hole);
  });

  const db = await openDiscTallyDB();

  if (adminEditingCourseId != null) {
    const existing = await getCourseById(db, adminEditingCourseId);
    const courseRecord = Object.assign({}, existing, { name, location, address, holes, logo: adminEditingLogoDataUrl || undefined });
    if (!adminEditingLogoDataUrl) delete courseRecord.logo;
    if (adminCourseLat != null && adminCourseLng != null) {
      courseRecord.lat = adminCourseLat;
      courseRecord.lng = adminCourseLng;
    }
    await updateCourse(db, courseRecord);
  } else {
    const courseRecord = { name, location, address, holes, source: 'admin' };
    if (adminEditingLogoDataUrl) courseRecord.logo = adminEditingLogoDataUrl;
    if (adminCourseLat != null && adminCourseLng != null) {
      courseRecord.lat = adminCourseLat;
      courseRecord.lng = adminCourseLng;
    }
    await addCourse(db, courseRecord);
  }

  document.getElementById('admin-editor-screen').classList.add('hide');
  document.getElementById('admin-list-screen').classList.remove('hide');
  stopLiveLocationTracking(adminMapLocationTracker);
  adminMapLocationTracker = null;
  if (adminMap) { adminMap.remove(); adminMap = null; }
  adminHoleMarkers = {};
  renderAdminCourseList();
  await loadCourseOptions();
}
