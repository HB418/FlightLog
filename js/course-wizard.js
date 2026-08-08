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
let holePlacementSecondTeeMarker = null;   // 2nd tee marker mid-placement, while its rotation slider is showing
let holePlacementSecondTeeRotation = 0;
let holePlacementSecondBasketMarker = null;   // 2nd basket marker mid-placement, while drag-to-adjust is showing
let holePlacementSecondWaypointMarkers = [];  // confirmed waypoints for the 2nd tee's path, for the CURRENT hole
let holePlacementSecondPathTarget = 'second'; // 'second' | 'primary' — which basket the 2nd tee's path currently runs to
let holePlacementLivePath = null;       // live-updating polyline preview for the primary tee->waypoints->basket path
let holePlacementSecondLivePath = null; // live-updating polyline preview for the 2nd tee's path
let pendingHoleGeo = [];               // [{tee:{lat,lng,rotation}, basket:{lat,lng}, waypoints:[{lat,lng}]}] — one entry per hole
let allBasketMarkers = [];             // [{holeNumbers:[n,...], marker, lat, lng}] — every confirmed basket this session, for reuse + labeling
let holeMarkersHistory = [];           // [{teeMarker, basketEntry, waypointMarkers}] — one entry per hole, so "Previous Hole" can clean up
let pendingCourseVisibility = 'private';

// As You Play mode (Segment 1: entry + map scaffold only)
let pendingAypName = '';
let pendingAypAddress = '';
let pendingAypLocation = '';
let pendingAypLat = null;
let pendingAypLng = null;
let aypMap = null;
let aypMapLocationTracker = null;
let aypCurrentHoleNumber = 1;
let aypHoles = []; // completed holes so far: {number, length, par, hazards, tee, basket}
let aypTeeMarker = null;
let aypBasketMarker = null;
let aypTeeLatLng = null;
let aypTeeRotation = 0;
let aypBasketLatLng = null;
let aypPlayers = []; // player names, set up on the info screen
let aypPlayerData = []; // [{name, scores: {holeNumber: strokes}}] — mirrors round.js's player shape so it can be saved as a real round
let savingFlowIsAyp = false; // which Finish flow the shared save-visibility-modal should call back into

/* ---------- New Course modal (3-screen wizard) ---------- */

function openNewCourseModeChoice() {
  document.getElementById('new-course-mode-choice-modal').classList.add('active');
}

function handleNcModeAllAtOnce() {
  document.getElementById('new-course-mode-choice-modal').classList.remove('active');
  openNewCourseModal();
}

function handleNcModeAsYouPlay() {
  document.getElementById('new-course-mode-choice-modal').classList.remove('active');
  document.getElementById('ayp-course-name').value = '';
  document.getElementById('ayp-course-address').value = '';
  document.getElementById('ayp-course-location').value = '';
  document.getElementById('ayp-info-status').textContent = '';
  document.getElementById('ayp-info-modal').classList.add('active');
  document.getElementById('ayp-course-name').focus();
}

// Shown AFTER the course name/address has been entered and geocoded —
// not upfront, so the first screen stays focused on just finding the
// course instead of asking for two unrelated things at once.
function openAypPlayersModal() {
  document.getElementById('ayp-new-player-input').value = '';
  aypPlayers = [localStorage.getItem('userName') || 'Player 1'];
  renderAypPlayersList();
  document.getElementById('ayp-players-modal').classList.add('active');
}

function handleAypPlayersBack() {
  document.getElementById('ayp-players-modal').classList.remove('active');
  document.getElementById('ayp-info-modal').classList.add('active');
}

function handleAypStartPlay() {
  document.getElementById('ayp-players-modal').classList.remove('active');
  launchAsYouPlayScreen();
}

function renderAypPlayersList() {
  const el = document.getElementById('ayp-players-list');
  el.innerHTML = aypPlayers.map((name, i) =>
    '<span style="display:inline-block;margin:0.15rem;padding:0.2rem 0.6rem;background:#eee;border-radius:1rem;font-size:0.85rem;">' +
    name + ' <a href="#" data-idx="' + i + '" class="ayp-remove-player" style="color:#c00;text-decoration:none;">&times;</a></span>'
  ).join('');
  el.querySelectorAll('.ayp-remove-player').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (aypPlayers.length <= 1) return; // always need at least one player
      aypPlayers.splice(Number(a.dataset.idx), 1);
      renderAypPlayersList();
    });
  });
}

function handleAypAddPlayer() {
  const input = document.getElementById('ayp-new-player-input');
  const name = input.value.trim();
  if (!name) return;
  aypPlayers.push(name);
  input.value = '';
  renderAypPlayersList();
}

async function handleAypInfoNext() {
  const name = document.getElementById('ayp-course-name').value.trim();
  const address = document.getElementById('ayp-course-address').value.trim();
  const location = document.getElementById('ayp-course-location').value.trim();
  const statusEl = document.getElementById('ayp-info-status');

  if (!name) {
    statusEl.textContent = 'Enter a name for this course.';
    return;
  }

  // Same address-first-then-name fallback as the All at Once flow.
  let result = null;
  const combined = [address, location].filter(Boolean).join(', ');
  if (combined) {
    statusEl.textContent = 'Looking up ' + combined + '...';
    result = await geocodeQuery(combined);
  }
  if (!result) {
    statusEl.textContent = 'Looking up ' + name + '...';
    result = await geocodeQuery(name + ' disc golf course');
  }
  if (!result) {
    statusEl.textContent = 'Nothing found for that. Try adding a street address, or a nearby town/park name.';
    return;
  }

  pendingAypName = name;
  pendingAypAddress = address;
  pendingAypLocation = location;
  pendingAypLat = result.lat;
  pendingAypLng = result.lng;
  statusEl.textContent = '';

  document.getElementById('ayp-info-modal').classList.remove('active');
  openAypPlayersModal();
}

function launchAsYouPlayScreen() {
  document.getElementById('as-you-play-screen').classList.add('active');

  aypCurrentHoleNumber = 1;
  aypHoles = [];
  aypPlayerData = aypPlayers.map(name => ({ name, scores: {} }));

  const center = [pendingAypLat, pendingAypLng];

  if (!aypMap && typeof L !== 'undefined') {
    aypMap = L.map('ayp-map', { zoomSnap: 0.25, zoomDelta: 0.5, maxZoom: 22 });
    L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }).addTo(aypMap);
    aypMapLocationTracker = startLiveLocationTracking(aypMap);

    // The controls float directly on top of the map (mobile-first —
    // see the top/bottom overlay bars in index.html), so taps on them
    // need to be stopped from also reaching the map underneath.
    document.querySelectorAll('#as-you-play-screen .map-popup-overlay-bar, #as-you-play-screen .paper-btn, #as-you-play-screen select, #as-you-play-screen input')
      .forEach(el => {
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
      });
  }
  aypMap.setView(center, 18);
  setTimeout(() => aypMap.invalidateSize(), 50);

  resetAypHoleControls();
}

function resetAypHoleControls() {
  document.getElementById('ayp-hole-label').textContent = pendingAypName + ' — Hole ' + aypCurrentHoleNumber;
  document.getElementById('ayp-instructions').textContent = 'Enter length/par if known, then walk to the tee and press Mark Tee.';
  document.getElementById('ayp-hole-length-input').value = '';
  document.getElementById('ayp-hole-par-select').value = '3';
  document.getElementById('ayp-unknown-length-checkbox').checked = false;
  document.getElementById('ayp-hazard-water').checked = false;
  document.getElementById('ayp-hazard-trees').checked = false;
  document.getElementById('ayp-hazard-dogleg').checked = false;
  document.getElementById('ayp-hazard-ob').checked = false;
  document.getElementById('ayp-mark-tee-btn').classList.remove('hide');
  document.getElementById('ayp-mark-basket-btn').classList.add('hide');
  document.getElementById('ayp-hazards-row').classList.remove('hide');
  document.getElementById('ayp-unknown-length-row').classList.remove('hide');
  document.getElementById('ayp-length-par-row').classList.remove('hide');
  document.getElementById('ayp-tee-rotation-row').classList.add('hide');
  document.getElementById('ayp-score-row').classList.add('hide');
  document.getElementById('ayp-score-input').value = '';
  aypTeeLatLng = null;
  aypTeeRotation = 0;
  aypBasketLatLng = null;
}

function handleAypMarkTee() {
  document.getElementById('ayp-instructions').textContent = 'Getting an accurate GPS reading…';
  captureAccurateGpsPosition((pos) => {
    if (!pos) { document.getElementById('ayp-instructions').textContent = 'Enter length/par if known, then walk to the tee and press Mark Tee.'; return; }
    aypTeeLatLng = pos;
    aypTeeRotation = 0;
    const scale = scaleForZoom(aypMap);
    if (aypTeeMarker) aypMap.removeLayer(aypTeeMarker);
    aypTeeMarker = L.marker([pos.lat, pos.lng], { icon: makeTeeDivIcon(0, scale), draggable: true }).addTo(aypMap);
    aypTeeMarker._rotationDeg = 0;
    aypTeeMarker.on('drag', (ev) => {
      const ll = ev.target.getLatLng();
      aypTeeLatLng = { lat: ll.lat, lng: ll.lng };
    });
    document.getElementById('ayp-mark-tee-btn').classList.add('hide');
    // Hide everything not needed while just confirming facing
    // direction — keeps the bar as short as possible during this step.
    document.getElementById('ayp-hazards-row').classList.add('hide');
    document.getElementById('ayp-unknown-length-row').classList.add('hide');
    document.getElementById('ayp-length-par-row').classList.add('hide');
    document.getElementById('ayp-tee-rotation-row').classList.remove('hide');
    document.getElementById('ayp-tee-rotation').value = 0;
    document.getElementById('ayp-instructions').textContent = 'Drag to adjust, set facing direction, then Confirm Tee.';
    // The bar's height just changed (rows hidden, rotation row shown) —
    // recenter using the ACTUAL new height so the tee lands above it
    // instead of wherever the old, different-sized bar implied.
    recenterAypAbovePoint(pos.lat, pos.lng);
  });
}

function handleAypTeeRotationInput(e) {
  aypTeeRotation = Number(e.target.value);
  if (!aypTeeMarker) return;
  aypTeeMarker._rotationDeg = aypTeeRotation;
  const el = aypTeeMarker.getElement();
  if (!el) return;
  const img = el.querySelector('img');
  if (img) img.style.transform = 'rotate(' + aypTeeRotation + 'deg)';
}

function handleAypConfirmTee() {
  document.getElementById('ayp-tee-rotation-row').classList.add('hide');
  document.getElementById('ayp-hazards-row').classList.remove('hide');
  document.getElementById('ayp-unknown-length-row').classList.remove('hide');
  document.getElementById('ayp-length-par-row').classList.remove('hide');
  document.getElementById('ayp-mark-basket-btn').classList.remove('hide');
  document.getElementById('ayp-instructions').textContent = 'Walk to the basket, then press Mark Basket.';
  // Bar shrank back down now that the rotation row is gone — recenter
  // again on the tee so it's still positioned correctly, not just
  // wherever it ended up while the taller bar was showing.
  if (aypTeeLatLng) recenterAypAbovePoint(aypTeeLatLng.lat, aypTeeLatLng.lng);
}

// Re-centers the map on a point so it lands in the middle of whatever
// space is ACTUALLY still visible between the top and bottom overlay
// bars right now — measured fresh each call, not assumed, since the
// bottom bar's height changes a lot between steps (rotation slider,
// hazard checkboxes, score inputs all show/hide at different points).
function recenterAypAbovePoint(lat, lng) {
  if (!aypMap) return;
  aypMap.setView([lat, lng], aypMap.getZoom());
  const mapEl = document.getElementById('ayp-map');
  const controlsEl = document.getElementById('ayp-controls');
  const topBarEl = document.querySelector('#as-you-play-screen .map-popup-overlay-bar.top');
  const totalH = mapEl.clientHeight || aypMap.getSize().y;
  const bottomH = controlsEl.offsetHeight;
  const topH = topBarEl ? topBarEl.offsetHeight : 0;
  const visibleCenterY = topH + (totalH - topH - bottomH) / 2;
  const mapCenterY = totalH / 2;
  const dy = mapCenterY - visibleCenterY;
  aypMap.panBy([0, dy], { animate: false });
}

function handleAypMarkBasket() {
  document.getElementById('ayp-instructions').textContent = 'Getting an accurate GPS reading…';
  captureAccurateGpsPosition((pos) => {
    if (!pos) { document.getElementById('ayp-instructions').textContent = 'Walk to the basket, then press Mark Basket.'; return; }
    aypBasketLatLng = pos;
    const scale = scaleForZoom(aypMap);
    if (aypBasketMarker) aypMap.removeLayer(aypBasketMarker);
    aypBasketMarker = L.marker([pos.lat, pos.lng], { icon: makeBasketIcon(scale), draggable: true }).addTo(aypMap);
    aypBasketMarker.on('drag', (ev) => {
      const ll = ev.target.getLatLng();
      aypBasketLatLng = { lat: ll.lat, lng: ll.lng };
    });

    const unknownLength = document.getElementById('ayp-unknown-length-checkbox').checked;
    if (unknownLength && aypTeeLatLng) {
      const feet = haversineFeet(aypTeeLatLng.lat, aypTeeLatLng.lng, pos.lat, pos.lng);
      document.getElementById('ayp-hole-length-input').value = Math.round(feet);
    }

    document.getElementById('ayp-mark-basket-btn').classList.add('hide');
    renderAypScoreInputs();
    document.getElementById('ayp-score-row').classList.remove('hide');
    document.getElementById('ayp-instructions').textContent = 'Enter each player\'s score for this hole.';
    // Bar just grew again (score inputs) — recenter on the basket.
    recenterAypAbovePoint(pos.lat, pos.lng);
  });
}

function renderAypScoreInputs() {
  const container = document.getElementById('ayp-score-inputs');
  container.innerHTML = aypPlayerData.map((p, i) =>
    '<label class="ayp-field ayp-field-sm">' + p.name +
    '<input type="number" min="1" step="1" class="ayp-player-score-input" data-player-idx="' + i + '"/></label>'
  ).join('');
}

function handleAypSubmitScore() {
  const inputs = Array.from(document.querySelectorAll('.ayp-player-score-input'));
  const strokesByPlayer = [];
  for (const input of inputs) {
    const strokes = parseInt(input.value, 10);
    if (!Number.isFinite(strokes) || strokes < 1) {
      document.getElementById('ayp-instructions').textContent = 'Enter a valid score for every player.';
      return;
    }
    strokesByPlayer.push(strokes);
  }

  const hole = {
    number: aypCurrentHoleNumber,
    length: Number(document.getElementById('ayp-hole-length-input').value) || 0,
    par: Number(document.getElementById('ayp-hole-par-select').value) || 3,
    tee: { lat: aypTeeLatLng.lat, lng: aypTeeLatLng.lng, rotation: aypTeeRotation },
    basket: aypBasketLatLng
  };
  const hazards = {};
  if (document.getElementById('ayp-hazard-water').checked) hazards.water = true;
  if (document.getElementById('ayp-hazard-trees').checked) hazards.trees = true;
  if (document.getElementById('ayp-hazard-dogleg').checked) hazards.dogleg = true;
  if (document.getElementById('ayp-hazard-ob').checked) hazards.ob = true;
  if (Object.keys(hazards).length) hole.hazards = hazards;

  aypHoles.push(hole);
  aypPlayerData.forEach((p, i) => { p.scores[hole.number] = strokesByPlayer[i]; });

  const totalPar = aypHoles.reduce((s, h) => s + h.par, 0);
  const summaryLines = aypPlayerData.map(p => {
    const total = computePlayerTotal(p);
    const diff = total - totalPar;
    const diffText = diff === 0 ? 'E' : (diff > 0 ? '+' + diff : String(diff));
    return p.name + ': ' + total + ' (' + diffText + ')';
  });

  document.getElementById('ayp-hole-complete-summary').innerHTML =
    'Hole ' + hole.number + ' scored.<br/>' + summaryLines.join('<br/>');
  document.getElementById('ayp-hole-complete-modal').classList.add('active');
}

function handleAypHoleCompleteNext() {
  document.getElementById('ayp-hole-complete-modal').classList.remove('active');
  aypCurrentHoleNumber++;
  resetAypHoleControls();
}

function handleAypClose() {
  document.getElementById('as-you-play-screen').classList.remove('active');
  if (aypMap) {
    stopLiveLocationTracking(aypMapLocationTracker);
    aypMapLocationTracker = null;
    aypMap.remove();
    aypMap = null;
  }
}

// Saves both the course itself (from aypHoles, already in the right
// shape) AND the round just played while building it, since the user
// confirmed they want their As You Play scores to count as a real
// round in Stats. Publishing here only sets local visibility, same as
// every other course save in the app — there's no backend yet to
// actually post it anywhere for review, so "Make Public" isn't trying
// to fake that.
async function finishAsYouPlayCourse() {
  const db = await openDiscTallyDB();

  const courseRecord = {
    name: pendingAypName,
    location: pendingAypLocation,
    address: pendingAypAddress,
    holes: aypHoles,
    source: 'user',
    visibility: pendingCourseVisibility
  };
  if (pendingAypLat != null && pendingAypLng != null) {
    courseRecord.lat = pendingAypLat;
    courseRecord.lng = pendingAypLng;
  }
  const courseId = await addCourse(db, courseRecord);

  const totalPar = aypHoles.reduce((s, h) => s + (Number(h.par) || 0), 0);
  const courseForRating = { holes: aypHoles };
  const players = aypPlayerData.map(p => {
    const total = computePlayerTotal(p);
    return {
      name: p.name,
      total: total,
      roundRating: computeRoundRating(courseForRating, total),
      scores: Object.entries(p.scores).map(([hole, strokes]) => ({ hole: Number(hole), strokes }))
    };
  });

  const roundRecord = {
    courseId: courseId,
    courseName: pendingAypName,
    date: new Date().toISOString(),
    totalPar: totalPar,
    weather: null,
    holes: aypHoles.map(h => ({ number: h.number, par: h.par })),
    players: players
  };
  await addRound(db, roundRecord);
  await recomputeFlightRating();

  handleAypClose();
  await loadCourseOptions();

  // Same read-only scorecard used for a regular round's "Round
  // Complete" summary — full hole-by-hole breakdown for every player,
  // not just a one-line total.
  document.getElementById('round-summary-content').innerHTML =
    buildRoundSummaryScorecard({ holes: aypHoles, players: aypPlayerData }, totalPar);
  document.getElementById('round-summary-modal').classList.add('active');
}

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
  holePlacementSecondTeeMarker = null;
  holePlacementSecondBasketMarker = null;
  holePlacementSecondWaypointMarkers = [];
  holePlacementLivePath = null;
  holePlacementSecondLivePath = null;
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

    // Optional — only meaningful once a 2nd tee is placed on the map
    // for this hole (Match Lengths to Map fills it in from there), but
    // left editable either way since a shorter set of tees is still a
    // real, useful distance to record even before the map is finished.
    // Par can differ for the 2nd tee too (e.g. a shorter layout might
    // play as one stroke less), so it gets its own selector rather than
    // assuming it always matches the main tee's par.
    const secondLengthInput = document.createElement('input');
    secondLengthInput.type = 'number';
    secondLengthInput.min = '1';
    secondLengthInput.placeholder = '2nd Tee (ft)';
    secondLengthInput.dataset.hole = i;
    secondLengthInput.dataset.field = 'secondLength';
    secondLengthInput.style.width = '5.5rem';
    secondLengthInput.style.flex = '0 0 auto';

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

    const secondParSelect = document.createElement('select');
    secondParSelect.dataset.hole = i;
    secondParSelect.dataset.field = 'secondPar';
    secondParSelect.style.width = '4.5rem';
    secondParSelect.style.flex = '0 0 auto';
    for (let p = 2; p <= 7; p++) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = 'Par ' + p;
      if (p === 3) opt.selected = true;
      secondParSelect.appendChild(opt);
    }

    row.appendChild(label);
    row.appendChild(lengthInput);
    row.appendChild(parSelect);
    row.appendChild(secondLengthInput);
    row.appendChild(secondParSelect);
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
  const address = document.getElementById('nc-course-address').value.trim();
  const location = document.getElementById('nc-course-location').value.trim();
  const statusEl = document.getElementById('nc-map-prompt-status');

  // An explicit address/location is more precise than a name-based
  // lookup (course names can be ambiguous or shared across cities), so
  // search that first and only fall back to the course name if there's
  // no address to go on, or the address lookup comes up empty.
  let result = null;
  if (address || location) {
    const combined = [address, location].filter(Boolean).join(', ');
    statusEl.textContent = 'Looking up ' + combined + '...';
    result = await geocodeQuery(combined);
  }

  if (!result) {
    statusEl.textContent = 'Looking up ' + name + '...';
    result = await geocodeQuery(name + ' disc golf course');
  }

  if (result) {
    pendingCourseLat = result.lat;
    pendingCourseLng = result.lng;
    statusEl.textContent = '';
    document.getElementById('new-course-modal').classList.remove('active');
    launchHolePlacementWizard();
    return;
  }

  statusEl.textContent = "Couldn't find it automatically — adjust the address below.";
  document.getElementById('new-course-modal').classList.remove('active');
  document.getElementById('enter-location-modal').classList.add('active');
  document.getElementById('enter-location-status').textContent = '';
  const addressInput = document.getElementById('course-address-input');
  addressInput.value = [address, location].filter(Boolean).join(', ');
  addressInput.focus();
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

    // The wizard's control buttons (Confirm, Add 2nd Tee, etc.) float
    // directly on top of the map via CSS. Without this, the tap that
    // lands on a button also reaches the map underneath and gets
    // registered as a map click — e.g. tapping "Add 2nd Tee" immediately
    // drops a waypoint at that same spot before the button's own handler
    // even changes the sub-step. disableClickPropagation stops the map
    // from ever seeing clicks that originate on these overlay controls.
    document.querySelectorAll('#hole-placement-modal .map-popup-btn, #hole-placement-modal .map-popup-overlay-bar')
      .forEach(el => {
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
      });
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
  holePlacementSecondTeeMarker = null;
  holePlacementSecondTeeRotation = 0;
  holePlacementSecondBasketMarker = null;
  holePlacementSecondWaypointMarkers = [];
  holePlacementSecondPathTarget = 'second';
  clearLivePaths();
  updateHolePlacementUI();
}

// Live-updating path preview while placing/adjusting a hole — the same
// curve math used for the final saved course (catmullRomSplinePoints,
// defined in round.js), redrawn from scratch on every relevant change
// so it always reflects exactly what's currently placed, including a
// waypoint mid-drag before it's even confirmed.
function llArr(marker) {
  const ll = marker.getLatLng();
  return [ll.lat, ll.lng];
}

function updateLivePath() {
  if (!holePlacementMap) return;

  if (holePlacementLivePath) { holePlacementMap.removeLayer(holePlacementLivePath); holePlacementLivePath = null; }
  if (holePlacementTeeMarker) {
    const pts = [llArr(holePlacementTeeMarker)];
    holePlacementWaypointMarkers.forEach(m => pts.push(llArr(m)));
    if (holePlacementCurrentWaypointMarker && holePlacementSubStep === 'waypoint-confirm') pts.push(llArr(holePlacementCurrentWaypointMarker));
    if (holePlacementBasketMarker) pts.push(llArr(holePlacementBasketMarker));
    if (pts.length >= 2) {
      holePlacementLivePath = L.polyline(catmullRomSplinePoints(pts), { color: '#FFD400', weight: 2, opacity: 0.85 }).addTo(holePlacementMap);
    }
  }

  if (holePlacementSecondLivePath) { holePlacementMap.removeLayer(holePlacementSecondLivePath); holePlacementSecondLivePath = null; }
  if (holePlacementSecondTeeMarker) {
    const pts2 = [llArr(holePlacementSecondTeeMarker)];
    holePlacementSecondWaypointMarkers.forEach(m => pts2.push(llArr(m)));
    if (holePlacementCurrentWaypointMarker && holePlacementSubStep === 'second-waypoint-confirm') pts2.push(llArr(holePlacementCurrentWaypointMarker));
    const secondTargetMarker = (holePlacementSecondPathTarget === 'primary')
      ? holePlacementBasketMarker
      : (holePlacementSecondBasketMarker || holePlacementBasketMarker);
    if (secondTargetMarker) pts2.push(llArr(secondTargetMarker));
    if (pts2.length >= 2) {
      holePlacementSecondLivePath = L.polyline(catmullRomSplinePoints(pts2), { color: '#FFD400', weight: 2, opacity: 0.85, dashArray: '4,6' }).addTo(holePlacementMap);
    }
  }
}

function clearLivePaths() {
  if (holePlacementMap && holePlacementLivePath) holePlacementMap.removeLayer(holePlacementLivePath);
  if (holePlacementMap && holePlacementSecondLivePath) holePlacementMap.removeLayer(holePlacementSecondLivePath);
  holePlacementLivePath = null;
  holePlacementSecondLivePath = null;
}

// Toggles which basket the 2nd tee's dashed path runs to, when both a
// main basket and a 2nd basket exist for this hole. Stored directly
// onto pendingHoleGeo (not just held in memory) since there's no
// separate "confirm" step for this — it's an ambient choice, not a
// placement.
function toggleSecondPathTarget() {
  holePlacementSecondPathTarget = (holePlacementSecondPathTarget === 'primary') ? 'second' : 'primary';
  if (pendingHoleGeo[holePlacementIndex]) {
    pendingHoleGeo[holePlacementIndex].secondPathTarget = holePlacementSecondPathTarget;
  }
  updateHolePlacementUI();
  updateLivePath();
}

// Removing the 2nd tee is equivalent to never having added one —
// cascades to the 2nd basket and its waypoints too (they only exist to
// support the 2nd tee's path), then moves straight on to the next hole,
// same as answering "No" to the "Add a 2nd tee?" prompt.
function deleteSecondTee() {
  showConfirmModal('Delete the 2nd tee for this hole? This also removes its 2nd basket and waypoints, if any.', () => {
    const hist = holeMarkersHistory[holePlacementIndex];
    if (hist && hist.secondTeeMarker) { removeMarkerAndLabel(holePlacementMap, hist.secondTeeMarker); hist.secondTeeMarker = null; }
    if (hist && hist.secondBasketMarker) { removeMarkerAndLabel(holePlacementMap, hist.secondBasketMarker); hist.secondBasketMarker = null; }
    if (hist && hist.secondWaypointMarkers) { hist.secondWaypointMarkers.forEach(m => holePlacementMap.removeLayer(m)); hist.secondWaypointMarkers = null; }
    holePlacementSecondWaypointMarkers.forEach(m => holePlacementMap.removeLayer(m));
    holePlacementSecondWaypointMarkers = [];
    holePlacementSecondTeeMarker = null;
    holePlacementSecondBasketMarker = null;
    holePlacementSecondPathTarget = 'second';
    if (pendingHoleGeo[holePlacementIndex]) {
      delete pendingHoleGeo[holePlacementIndex].secondTee;
      delete pendingHoleGeo[holePlacementIndex].secondBasket;
      delete pendingHoleGeo[holePlacementIndex].secondWaypoints;
      delete pendingHoleGeo[holePlacementIndex].secondPathTarget;
    }
    clearLivePaths();
    advanceToNextHoleOrDone();
  });
}

// Removing just the 2nd basket keeps the 2nd tee and its waypoints —
// the live path automatically falls back to the main basket instead
// (same fallback the rendering already uses when no 2nd basket exists).
function deleteSecondBasket() {
  showConfirmModal('Delete the 2nd basket for this hole?', () => {
    const hist = holeMarkersHistory[holePlacementIndex];
    if (hist && hist.secondBasketMarker) { removeMarkerAndLabel(holePlacementMap, hist.secondBasketMarker); hist.secondBasketMarker = null; }
    holePlacementSecondBasketMarker = null;
    holePlacementSecondPathTarget = 'second';
    if (pendingHoleGeo[holePlacementIndex]) {
      delete pendingHoleGeo[holePlacementIndex].secondBasket;
      delete pendingHoleGeo[holePlacementIndex].secondPathTarget;
    }
    updateHolePlacementUI();
    updateLivePath();
  });
}

function handleHolePlacementMapClick(e) {
  const currentHoleNumber = holePlacementHoles[holePlacementIndex].number;

  if (holePlacementSubStep === 'tee-tap') {
    const scale = scaleForZoom(holePlacementMap);
    holePlacementTeeMarker = L.marker(e.latlng, { icon: makeTeeDivIcon(0, scale), draggable: true }).addTo(holePlacementMap);
    holePlacementTeeMarker._rotationDeg = 0;
    holePlacementTeeMarker.on('drag', updateLivePath);
    holePlacementIcons.push({ marker: holePlacementTeeMarker, kind: 'tee' });
    updateMarkerHoleLabel(holePlacementTeeMarker, [currentHoleNumber]);
    holePlacementRotation = 0;
    holePlacementSubStep = 'tee-confirm';
    updateHolePlacementUI();
    applyTeeRotationToMarker();
    updateLivePath();

  } else if (holePlacementSubStep === 'basket-tap') {
    const scale = scaleForZoom(holePlacementMap);
    holePlacementBasketMarker = L.marker(e.latlng, { icon: makeBasketIcon(scale), draggable: true }).addTo(holePlacementMap);
    holePlacementBasketMarker.on('drag', updateLivePath);
    holePlacementIcons.push({ marker: holePlacementBasketMarker, kind: 'basket' });
    updateMarkerHoleLabel(holePlacementBasketMarker, [currentHoleNumber]);
    holePlacementSubStep = 'basket-confirm';
    updateHolePlacementUI();
    updateLivePath();

  } else if (holePlacementSubStep === 'waypoint-tap') {
    const wpIcon = L.divIcon({
      html: '<div style="width:12px;height:12px;border-radius:50%;background:var(--mustard);border:2px solid var(--dark-teal);"></div>',
      className: 'placement-div-icon',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
    holePlacementCurrentWaypointMarker = L.marker(e.latlng, { icon: wpIcon, draggable: true }).addTo(holePlacementMap);
    holePlacementCurrentWaypointMarker.on('drag', updateLivePath);
    holePlacementSubStep = 'waypoint-confirm';
    updateHolePlacementUI();
    updateLivePath();

  } else if (holePlacementSubStep === 'second-waypoint-tap') {
    const wpIcon = L.divIcon({
      html: '<div style="width:12px;height:12px;border-radius:50%;background:var(--mustard);border:2px solid var(--dark-teal);"></div>',
      className: 'placement-div-icon',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
    holePlacementCurrentWaypointMarker = L.marker(e.latlng, { icon: wpIcon, draggable: true }).addTo(holePlacementMap);
    holePlacementCurrentWaypointMarker.on('drag', updateLivePath);
    holePlacementSubStep = 'second-waypoint-confirm';
    updateHolePlacementUI();
    updateLivePath();

  } else if (holePlacementSubStep === 'second-tee-tap') {
    const scale = scaleForZoom(holePlacementMap);
    const m = L.marker(e.latlng, { icon: makeSecondTeeDivIcon(0, scale), draggable: true }).addTo(holePlacementMap);
    m._rotationDeg = 0;
    m.on('drag', updateLivePath);
    holePlacementIcons.push({ marker: m, kind: 'secondTee' });
    updateMarkerHoleLabel(m, [currentHoleNumber + 'A'], { isAlt: true });
    holePlacementSecondTeeMarker = m;
    holePlacementSecondTeeRotation = 0;
    holeMarkersHistory[holePlacementIndex].secondTeeMarker = m;
    holePlacementSubStep = 'second-tee-confirm';
    updateHolePlacementUI();
    updateLivePath();

  } else if (holePlacementSubStep === 'second-basket-tap') {
    const scale = scaleForZoom(holePlacementMap);
    const m = L.marker(e.latlng, { icon: makeSecondBasketIcon(scale), draggable: true }).addTo(holePlacementMap);
    m.on('drag', updateLivePath);
    holePlacementIcons.push({ marker: m, kind: 'secondBasket' });
    updateMarkerHoleLabel(m, [currentHoleNumber + 'A'], { isAlt: true });
    holePlacementSecondBasketMarker = m;
    holeMarkersHistory[holePlacementIndex].secondBasketMarker = m;
    holePlacementSubStep = 'second-basket-confirm';
    updateHolePlacementUI();
    updateLivePath();
  }
  // Any other sub-step: ignore taps.
}

function handleTeeRotationInput(e) {
  const val = Number(e.target.value);
  if (holePlacementSubStep === 'second-tee-confirm') {
    holePlacementSecondTeeRotation = val;
    applySecondTeeRotationToMarker();
  } else {
    holePlacementRotation = val;
    applyTeeRotationToMarker();
  }
}

function applyTeeRotationToMarker() {
  if (!holePlacementTeeMarker) return;
  holePlacementTeeMarker._rotationDeg = holePlacementRotation;
  const el = holePlacementTeeMarker.getElement();
  if (!el) return;
  const img = el.querySelector('img');
  if (img) img.style.transform = 'rotate(' + holePlacementRotation + 'deg)';
}

function applySecondTeeRotationToMarker() {
  if (!holePlacementSecondTeeMarker) return;
  holePlacementSecondTeeMarker._rotationDeg = holePlacementSecondTeeRotation;
  const el = holePlacementSecondTeeMarker.getElement();
  if (!el) return;
  const img = el.querySelector('img');
  if (img) img.style.transform = 'rotate(' + holePlacementSecondTeeRotation + 'deg)';
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

  } else if (holePlacementSubStep === 'second-waypoint-confirm') {
    holePlacementSecondWaypointMarkers.push(holePlacementCurrentWaypointMarker);
    holePlacementCurrentWaypointMarker = null;
    holePlacementSubStep = 'second-waypoint-tap';
    updateHolePlacementUI();

  } else if (holePlacementSubStep === 'second-tee-confirm') {
    const ll = holePlacementSecondTeeMarker.getLatLng();
    pendingHoleGeo[holePlacementIndex].secondTee = { lat: ll.lat, lng: ll.lng, rotation: holePlacementSecondTeeRotation };
    showConfirmModal('Add a 2nd basket for this hole?', () => {
      holePlacementSubStep = 'second-basket-tap';
      updateHolePlacementUI();
    }, () => {
      holePlacementSubStep = 'second-waypoint-tap';
      updateHolePlacementUI();
    });

  } else if (holePlacementSubStep === 'second-basket-confirm') {
    const ll = holePlacementSecondBasketMarker.getLatLng();
    pendingHoleGeo[holePlacementIndex].secondBasket = { lat: ll.lat, lng: ll.lng };
    holePlacementSubStep = 'second-waypoint-tap';
    updateHolePlacementUI();
  }
  updateLivePath();
}

function handleRemoveCurrentWaypoint() {
  if (holePlacementCurrentWaypointMarker && holePlacementMap) {
    holePlacementMap.removeLayer(holePlacementCurrentWaypointMarker);
  }
  holePlacementCurrentWaypointMarker = null;
  holePlacementSubStep = (holePlacementSubStep === 'second-waypoint-confirm') ? 'second-waypoint-tap' : 'waypoint-tap';
  updateHolePlacementUI();
  updateLivePath();
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
  holePlacementBasketMarker = entry.marker;

  document.getElementById('reuse-basket-modal').classList.remove('active');
  holePlacementSubStep = 'waypoint-tap';
  updateHolePlacementUI();
  updateLivePath();
}

function handleDoneWithWaypoints() {
  if (holePlacementSubStep === 'second-waypoint-tap') {
    pendingHoleGeo[holePlacementIndex].secondWaypoints = holePlacementSecondWaypointMarkers.map(m => {
      const ll = m.getLatLng();
      return { lat: ll.lat, lng: ll.lng };
    });
    holeMarkersHistory[holePlacementIndex].secondWaypointMarkers = holePlacementSecondWaypointMarkers.slice();
    advanceToNextHoleOrDone();
    return;
  }

  pendingHoleGeo[holePlacementIndex].waypoints = holePlacementWaypointMarkers.map(m => {
    const ll = m.getLatLng();
    return { lat: ll.lat, lng: ll.lng };
  });
  holeMarkersHistory[holePlacementIndex].waypointMarkers = holePlacementWaypointMarkers.slice();

  showConfirmModal('Add a 2nd tee (alternate layout) for this hole?', () => {
    holePlacementSubStep = 'second-tee-tap';
    updateHolePlacementUI();
  }, () => {
    advanceToNextHoleOrDone();
  });
}

function advanceToNextHoleOrDone() {
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
  holePlacementSecondWaypointMarkers.forEach(m => holePlacementMap.removeLayer(m));
  holePlacementSecondWaypointMarkers = [];
  if (holePlacementSecondBasketMarker) { removeMarkerAndLabel(holePlacementMap, holePlacementSecondBasketMarker); holePlacementSecondBasketMarker = null; }
  const hist = holeMarkersHistory[holePlacementIndex];
  if (hist && hist.secondTeeMarker) { removeMarkerAndLabel(holePlacementMap, hist.secondTeeMarker); hist.secondTeeMarker = null; }
  if (hist && hist.secondBasketMarker) { removeMarkerAndLabel(holePlacementMap, hist.secondBasketMarker); hist.secondBasketMarker = null; }
  if (hist && hist.secondWaypointMarkers) { hist.secondWaypointMarkers.forEach(m => holePlacementMap.removeLayer(m)); hist.secondWaypointMarkers = null; }
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
  if (hist.secondTeeMarker) removeMarkerAndLabel(holePlacementMap, hist.secondTeeMarker);
  if (hist.secondBasketMarker) removeMarkerAndLabel(holePlacementMap, hist.secondBasketMarker);
  if (hist.secondWaypointMarkers) hist.secondWaypointMarkers.forEach(m => holePlacementMap.removeLayer(m));
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
  const secondPathTargetBtn = document.getElementById('hole-placement-second-path-target-btn');
  const secondDeleteRow = document.getElementById('hole-placement-second-delete-row');
  const deleteSecondTeeBtn = document.getElementById('hole-placement-delete-second-tee-btn');
  const deleteSecondBasketBtn = document.getElementById('hole-placement-delete-second-basket-btn');

  rotationRow.classList.add('hide');
  confirmBtn.classList.add('hide');
  removeBtn.classList.add('hide');
  doneWaypointsBtn.classList.add('hide');
  finishBtn.classList.add('hide');
  reuseBasketBtn.classList.add('hide');

  const canGoBack = (holePlacementSubStep === 'done') ? holePlacementHoles.length > 0 : holePlacementIndex > 0;
  previousHoleBtn.classList.toggle('hide', !canGoBack);

  // The toggle only makes sense once both a main basket AND a 2nd
  // basket exist for this hole — otherwise there's nothing to choose
  // between. Restricted to the tap step (not while confirming a
  // pending waypoint) since it shares its screen slot with Remove.
  const showPathTargetToggle = !!(holePlacementBasketMarker && holePlacementSecondBasketMarker &&
    holePlacementSubStep === 'second-waypoint-tap');
  secondPathTargetBtn.classList.toggle('hide', !showPathTargetToggle);
  secondPathTargetBtn.textContent = 'Path to: ' + (holePlacementSecondPathTarget === 'primary' ? 'Main Basket' : '2nd Basket');

  // Delete controls for whatever 2nd-tee-path pieces currently exist —
  // available across every 2nd-tee-path step (not just the tap steps)
  // so you can back out at any point after placing the 2nd tee.
  const showSecondDeleteRow = !!holePlacementSecondTeeMarker && holePlacementSubStep.indexOf('second') === 0;
  secondDeleteRow.classList.toggle('hide', !showSecondDeleteRow);
  deleteSecondBasketBtn.classList.toggle('hide', !holePlacementSecondBasketMarker);

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
      document.getElementById('hole-placement-rotation').value = holePlacementRotation;
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
      instructionsEl.textContent = holeLabel + ": Would you like to add a waypoint? It creates the curve in the path — place it at the height of the turn. Tap the map to add one, or click 'No More Waypoints' when done.";
      doneWaypointsBtn.classList.remove('hide');
      break;
    case 'waypoint-confirm':
      instructionsEl.textContent = holeLabel + ': Drag to adjust, then Confirm (or Remove).';
      confirmBtn.classList.remove('hide');
      removeBtn.classList.remove('hide');
      break;
    case 'second-tee-tap':
      instructionsEl.textContent = holeLabel + ': Tap the map to place the 2nd tee (optional alternate layout).';
      break;
    case 'second-tee-confirm':
      instructionsEl.textContent = holeLabel + ': Drag to adjust, use the slider to set facing direction, then Confirm.';
      rotationRow.classList.remove('hide');
      confirmBtn.classList.remove('hide');
      document.getElementById('hole-placement-rotation').value = holePlacementSecondTeeRotation;
      break;
    case 'second-basket-tap':
      instructionsEl.textContent = holeLabel + ': Tap the map to place the 2nd basket (optional alternate layout).';
      break;
    case 'second-basket-confirm':
      instructionsEl.textContent = holeLabel + ': Drag to adjust, then Confirm.';
      confirmBtn.classList.remove('hide');
      break;
    case 'second-waypoint-tap':
      instructionsEl.textContent = holeLabel + ": Would you like to add a waypoint for the 2nd tee's path? Tap the map to add one, or click 'No More Waypoints' when done.";
      doneWaypointsBtn.classList.remove('hide');
      break;
    case 'second-waypoint-confirm':
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

    // Same idea for a 2nd tee, when one's been placed — targets its
    // own basket if it has one, otherwise the shared basket, matching
    // whichever endpoint its dashed path is currently set to use.
    if (geo.secondTee) {
      const endBasket = (geo.secondPathTarget === 'primary') ? geo.basket : (geo.secondBasket || geo.basket);
      if (endBasket) {
        const secondFeet = haversineFeet(geo.secondTee.lat, geo.secondTee.lng, endBasket.lat, endBasket.lng);
        const secondLengthInput = row.querySelector('[data-field="secondLength"]');
        if (secondLengthInput) secondLengthInput.value = Math.round(secondFeet);
      }
    }
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
  savingFlowIsAyp = false;
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
    const secondLengthInput = row.querySelector('[data-field="secondLength"]');
    const parSelect = row.querySelector('[data-field="par"]');
    const secondParSelect = row.querySelector('[data-field="secondPar"]');
    const hole = {
      number: i + 1,
      length: Number(lengthInput.value) || 0,
      par: Number(parSelect.value) || 3
    };
    if (secondLengthInput && Number(secondLengthInput.value) > 0) {
      hole.secondLength = Number(secondLengthInput.value);
      hole.secondPar = Number(secondParSelect && secondParSelect.value) || hole.par;
    }
    const geo = pendingHoleGeo[i];
    if (geo) {
      if (geo.tee) hole.tee = geo.tee;
      if (geo.basket) hole.basket = geo.basket;
      if (geo.waypoints && geo.waypoints.length) hole.waypoints = geo.waypoints;
      if (geo.secondTee) hole.secondTee = geo.secondTee;
      if (geo.secondBasket) hole.secondBasket = geo.secondBasket;
      if (geo.secondWaypoints && geo.secondWaypoints.length) hole.secondWaypoints = geo.secondWaypoints;
      if (geo.secondTee && geo.secondBasket && geo.secondPathTarget) hole.secondPathTarget = geo.secondPathTarget;
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
