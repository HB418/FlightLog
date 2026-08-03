/* js/course-wizard.js
   The regular "Add Course" flow used by normal users: the 3-screen
   New Course modal, the tap-to-place hole-placement wizard, and the
   finish-review (reconcile hole lengths vs. map distances) step. */

let pendingCourseLat = null;
let pendingCourseLng = null;

// Hole placement wizard state
let holePlacementHoles = [];          // [{number, par}] read from the New Course hole-setup screen
let holePlacementIndex = 0;           // which hole (0-based) we're currently placing
let holePlacementSubStep = 'tee-tap'; // 'tee-tap' | 'tee-confirm' | 'basket-tap' | 'basket-confirm' | 'waypoint-tap' | 'waypoint-confirm' | 'done'
let holePlacementMap = null;
let holePlacementMapLocationTracker = null;
let holePlacementTeeMarker = null;
let holePlacementBasketMarker = null;
let holePlacementCurrentWaypointMarker = null;
let holePlacementWaypointMarkers = [];  // confirmed waypoints for the CURRENT hole
let holePlacementRotation = 0;
let pendingHoleGeo = [];               // [{tee:{lat,lng,rotation}, basket:{lat,lng}, waypoints:[{lat,lng}]}] — one entry per hole
let allBasketMarkers = [];             // [{holeNumbers:[n,...], marker, lat, lng}] — every confirmed basket this session, for reuse + labeling
let holeMarkersHistory = [];           // [{teeMarker, basketEntry, waypointMarkers}] — one entry per hole, so "Previous Hole" can clean up
let pendingCourseVisibility = 'private';

/* ---------- New Course modal (3-screen wizard) ---------- */

function showNCScreen(id) {
  ['nc-screen-info', 'nc-screen-holes', 'nc-screen-map-prompt'].forEach(sid => {
    document.getElementById(sid).classList.toggle('hide', sid !== id);
  });
}

function openNewCourseModal() {
  document.getElementById('nc-course-name').value = '';
  document.getElementById('nc-course-location').value = '';
  document.getElementById('nc-course-address').value = '';

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
  holePlacementIcons = [];
  holeMarkersHistory = [];
  pendingCourseVisibility = 'private';

  // Fully tear down the Leaflet map so no markers from a previous attempt
  // (before a Cancel) linger into the next one.
  if (holePlacementMap) {
    stopLiveLocationTracking(holePlacementMapLocationTracker);
    holePlacementMapLocationTracker = null;
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
  holePlacementIcons = [];
  holePlacementIndex = 0;

  document.getElementById('hole-placement-modal').classList.add('active');

  const center = (pendingCourseLat != null && pendingCourseLng != null) ? [pendingCourseLat, pendingCourseLng] : [0, 0];

  if (!holePlacementMap && typeof L !== 'undefined') {
    holePlacementMap = L.map('hole-placement-map', { zoomAnimation: false, fadeAnimation: false, zoomSnap: 0.25, zoomDelta: 0.5 });
    L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
      detectRetina: true
    }).addTo(holePlacementMap);
    holePlacementMapLocationTracker = startLiveLocationTracking(holePlacementMap);
    holePlacementMap.on('click', handleHolePlacementMapClick);
    holePlacementMap.on('zoomend', () => rescaleIconMarkers(holePlacementMap, holePlacementIcons));
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

function handleHolePlacementMapClick(e) {
  const currentHoleNumber = holePlacementHoles[holePlacementIndex].number;

  if (holePlacementSubStep === 'tee-tap') {
    const scale = scaleForZoom(holePlacementMap);
    holePlacementTeeMarker = L.marker(e.latlng, { icon: makeTeeDivIcon(0, scale), draggable: true }).addTo(holePlacementMap);
    holePlacementTeeMarker._rotationDeg = 0;
    holePlacementIcons.push({ marker: holePlacementTeeMarker, kind: 'tee' });
    updateMarkerHoleLabel(holePlacementTeeMarker, [currentHoleNumber]);
    holePlacementRotation = 0;
    holePlacementSubStep = 'tee-confirm';
    updateHolePlacementUI();
    applyTeeRotationToMarker();

  } else if (holePlacementSubStep === 'basket-tap') {
    const scale = scaleForZoom(holePlacementMap);
    holePlacementBasketMarker = L.marker(e.latlng, { icon: makeBasketIcon(scale), draggable: true }).addTo(holePlacementMap);
    holePlacementIcons.push({ marker: holePlacementBasketMarker, kind: 'basket' });
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

  } else if (holePlacementSubStep === 'second-tee-tap') {
    const scale = scaleForZoom(holePlacementMap);
    const m = L.marker(e.latlng, { icon: makeSecondTeeDivIcon(0, scale), draggable: true }).addTo(holePlacementMap);
    m._rotationDeg = 0;
    holePlacementIcons.push({ marker: m, kind: 'secondTee' });
    updateMarkerHoleLabel(m, [currentHoleNumber + 'A'], { isAlt: true });
    pendingHoleGeo[holePlacementIndex].secondTee = { lat: e.latlng.lat, lng: e.latlng.lng, rotation: 0 };
    holeMarkersHistory[holePlacementIndex].secondTeeMarker = m;
    holePlacementSubStep = 'waypoint-tap';
    updateHolePlacementUI();

  } else if (holePlacementSubStep === 'second-basket-tap') {
    const scale = scaleForZoom(holePlacementMap);
    const m = L.marker(e.latlng, { icon: makeSecondBasketIcon(scale), draggable: true }).addTo(holePlacementMap);
    holePlacementIcons.push({ marker: m, kind: 'secondBasket' });
    updateMarkerHoleLabel(m, [currentHoleNumber + 'A'], { isAlt: true });
    pendingHoleGeo[holePlacementIndex].secondBasket = { lat: e.latlng.lat, lng: e.latlng.lng };
    holeMarkersHistory[holePlacementIndex].secondBasketMarker = m;
    holePlacementSubStep = 'waypoint-tap';
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
  holePlacementTeeMarker._rotationDeg = holePlacementRotation;
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

function removeMarkerAndLabel(map, marker) {
  if (!marker) return;
  if (marker._holeLabelMarker) map.removeLayer(marker._holeLabelMarker);
  map.removeLayer(marker);
}

function clearCurrentHoleInProgressMarkers() {
  if (holePlacementTeeMarker) { removeMarkerAndLabel(holePlacementMap, holePlacementTeeMarker); holePlacementTeeMarker = null; }
  if (holePlacementBasketMarker) { removeMarkerAndLabel(holePlacementMap, holePlacementBasketMarker); holePlacementBasketMarker = null; }
  if (holePlacementCurrentWaypointMarker) { holePlacementMap.removeLayer(holePlacementCurrentWaypointMarker); holePlacementCurrentWaypointMarker = null; }
  holePlacementWaypointMarkers.forEach(m => holePlacementMap.removeLayer(m));
  holePlacementWaypointMarkers = [];
  const hist = holeMarkersHistory[holePlacementIndex];
  if (hist && hist.secondTeeMarker) { removeMarkerAndLabel(holePlacementMap, hist.secondTeeMarker); hist.secondTeeMarker = null; }
  if (hist && hist.secondBasketMarker) { removeMarkerAndLabel(holePlacementMap, hist.secondBasketMarker); hist.secondBasketMarker = null; }
}

function goToPreviousHole() {
  const targetIndex = (holePlacementSubStep === 'done') ? holePlacementHoles.length - 1 : holePlacementIndex - 1;
  if (targetIndex < 0) return;

  if (holePlacementSubStep !== 'done') {
    clearCurrentHoleInProgressMarkers();
  }

  const hist = holeMarkersHistory[targetIndex] || {};
  if (hist.teeMarker) removeMarkerAndLabel(holePlacementMap, hist.teeMarker);
  if (hist.waypointMarkers) hist.waypointMarkers.forEach(m => holePlacementMap.removeLayer(m));
  if (hist.basketEntry) {
    const entry = hist.basketEntry;
    const holeNum = holePlacementHoles[targetIndex].number;
    entry.holeNumbers = entry.holeNumbers.filter(n => n !== holeNum);
    if (entry.holeNumbers.length === 0) {
      removeMarkerAndLabel(holePlacementMap, entry.marker);
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
  const secondTeeBtn = document.getElementById('hole-placement-second-tee-btn');
  const secondBasketBtn = document.getElementById('hole-placement-second-basket-btn');

  rotationRow.classList.add('hide');
  confirmBtn.classList.add('hide');
  removeBtn.classList.add('hide');
  doneWaypointsBtn.classList.add('hide');
  finishBtn.classList.add('hide');
  reuseBasketBtn.classList.add('hide');
  secondTeeBtn.classList.add('hide');
  secondBasketBtn.classList.add('hide');

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
      secondTeeBtn.classList.remove('hide');
      secondBasketBtn.classList.remove('hide');
      break;
    case 'waypoint-confirm':
      instructionsEl.textContent = holeLabel + ': Drag to adjust, then Confirm (or Remove).';
      confirmBtn.classList.remove('hide');
      removeBtn.classList.remove('hide');
      break;
    case 'second-tee-tap':
      instructionsEl.textContent = holeLabel + ': Tap the map to place the 2nd tee (optional alternate layout).';
      break;
    case 'second-basket-tap':
      instructionsEl.textContent = holeLabel + ': Tap the map to place the 2nd basket (optional alternate layout).';
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
  const location = document.getElementById('nc-course-location').value.trim();
  const address = document.getElementById('nc-course-address').value.trim();
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
      if (geo.secondTee) hole.secondTee = geo.secondTee;
      if (geo.secondBasket) hole.secondBasket = geo.secondBasket;
    }
    holes.push(hole);
  });

  const db = await openDiscTallyDB();
  const courseRecord = { name, location, address, holes, visibility: pendingCourseVisibility };
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
