/* js/putt-practice.js
   Putt Practice, rebuilt around standalone "putting areas" (same
   pattern as Field Work's "fields") instead of picking a hole off a
   saved course. A putting area has just a basket location (no
   rotation, unlike a tee). This file covers Segment 1: choosing an
   existing area or creating a new one — name/address search, then tap
   the map to place the basket. Practice mode (placing throwing spots,
   recording attempts/makes) is a later segment.

   A putting area record: { id, name, address, lat, lng, basket: {lat, lng} }
*/

let puttPracticeMap = null;
let puttPracticeMapLocationTracker = null;

let pendingPuttingAreaName = '';
let pendingPuttingAreaAddress = '';
let pendingPuttingAreaLat = null;
let pendingPuttingAreaLng = null;

let puttingAreaBasketPlacementMap = null;
let puttingAreaBasketPlacementMapLocationTracker = null;
let puttingAreaBasketPlacementMarker = null;
let puttingAreaBasketPlacementLatLng = null; // {lat, lng} once the basket has been tapped
let puttingAreaBasketPlacementCircle1 = null; // Circle 1 (10m) — magenta
let puttingAreaBasketPlacementCircle2 = null; // Circle 2 (20m) — blue

function openPuttingAreaChoiceModal() {
  document.getElementById('putting-area-choice-modal').classList.add('active');
}

async function handleUseExistingPuttingAreaClick() {
  const db = await openDiscTallyDB();
  const areas = await getAllPuttingAreas(db);
  const select = document.getElementById('putting-area-select-dropdown');
  select.innerHTML = '';

  if (!areas || areas.length === 0) {
    document.getElementById('putting-area-choice-modal').classList.remove('active');
    showGenericModal('No putting areas saved yet. Create a new one to get started.');
    return;
  }

  areas.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name;
    select.appendChild(opt);
  });

  document.getElementById('putting-area-choice-modal').classList.remove('active');
  document.getElementById('putting-area-select-modal').classList.add('active');
}

async function handlePuttingAreaSelectGo() {
  const select = document.getElementById('putting-area-select-dropdown');
  const areaId = Number(select.value);
  if (!areaId) return;

  const db = await openDiscTallyDB();
  const area = await getPuttingAreaById(db, areaId);
  if (!area) return;

  document.getElementById('putting-area-select-modal').classList.remove('active');
  openPuttingPracticeMode(area);
}

function handleCreateNewPuttingAreaClick() {
  document.getElementById('new-putting-area-name-input').value = '';
  document.getElementById('new-putting-area-street-input').value = '';
  document.getElementById('new-putting-area-city-state-input').value = '';
  document.getElementById('new-putting-area-search-status').textContent = '';
  document.getElementById('putting-area-choice-modal').classList.remove('active');
  document.getElementById('new-putting-area-info-modal').classList.add('active');
  document.getElementById('new-putting-area-name-input').focus();
}

async function handleNewPuttingAreaSearch() {
  const name = document.getElementById('new-putting-area-name-input').value.trim();
  const street = document.getElementById('new-putting-area-street-input').value.trim();
  const cityState = document.getElementById('new-putting-area-city-state-input').value.trim();
  const address = [street, cityState].filter(Boolean).join(', ');
  const statusEl = document.getElementById('new-putting-area-search-status');

  if (!name) {
    statusEl.textContent = 'Enter a name for this putting area.';
    return;
  }
  if (!address) {
    statusEl.textContent = 'Enter a street and/or city, state to search.';
    return;
  }

  statusEl.textContent = 'Searching...';
  const result = await geocodeQuery(address);
  if (!result) {
    statusEl.textContent = 'Nothing found for that. Try a fuller address or a nearby town/park name.';
    return;
  }

  pendingPuttingAreaName = name;
  pendingPuttingAreaAddress = address;
  pendingPuttingAreaLat = result.lat;
  pendingPuttingAreaLng = result.lng;
  statusEl.textContent = '';

  document.getElementById('new-putting-area-info-modal').classList.remove('active');
  launchPuttingAreaBasketPlacement();
}

function launchPuttingAreaBasketPlacement() {
  puttingAreaBasketPlacementLatLng = null;
  puttingAreaBasketPlacementMarker = null;
  puttingAreaBasketPlacementCircle1 = null;
  puttingAreaBasketPlacementCircle2 = null;
  document.getElementById('putting-area-basket-placement-confirm-btn').classList.add('hide');
  document.getElementById('putting-area-basket-placement-instructions').textContent = 'Tap the map to place the basket.';

  document.getElementById('putting-area-basket-placement-modal').classList.add('active');

  const center = [pendingPuttingAreaLat, pendingPuttingAreaLng];

  if (!puttingAreaBasketPlacementMap && typeof L !== 'undefined') {
    puttingAreaBasketPlacementMap = L.map('putting-area-basket-placement-map', { zoomAnimation: false, fadeAnimation: false, zoomSnap: 0.25, zoomDelta: 0.5, maxZoom: 22 });
    L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }).addTo(puttingAreaBasketPlacementMap);
    puttingAreaBasketPlacementMapLocationTracker = startLiveLocationTracking(puttingAreaBasketPlacementMap);
    puttingAreaBasketPlacementMap.on('click', handlePuttingAreaBasketPlacementMapClick);

    document.querySelectorAll('#putting-area-basket-placement-modal .map-popup-btn, #putting-area-basket-placement-modal .map-popup-overlay-bar')
      .forEach(el => {
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
      });
  } else if (puttingAreaBasketPlacementMap) {
    // Reused map instance from a cancelled/earlier attempt this page
    // load — clear its marker/circles so they don't linger alongside
    // whatever gets placed this time.
    puttingAreaBasketPlacementMap.eachLayer(layer => {
      if (layer instanceof L.Marker || layer instanceof L.Circle) puttingAreaBasketPlacementMap.removeLayer(layer);
    });
  }
  puttingAreaBasketPlacementMap.setView(center, 18);
  setTimeout(() => puttingAreaBasketPlacementMap.invalidateSize(), 50);
}

// Circle 1 (10m) and Circle 2 (20m), the standard PDGA putting rings,
// drawn as true geodesic circles (L.circle's radius is real-world
// meters, not pixels) so they're always the correct size relative to
// the map regardless of zoom level — a fixed-pixel icon couldn't do
// that. Colored with the project's established magenta/blue rather
// than inventing new colors.
function updatePuttingPracticeCircles(map, latlng) {
  if (!puttingAreaBasketPlacementCircle1) {
    puttingAreaBasketPlacementCircle1 = L.circle(latlng, { radius: 10, color: '#FF2D95', weight: 3, fill: false }).addTo(map);
  } else {
    puttingAreaBasketPlacementCircle1.setLatLng(latlng);
  }
  if (!puttingAreaBasketPlacementCircle2) {
    puttingAreaBasketPlacementCircle2 = L.circle(latlng, { radius: 20, color: '#0080FF', weight: 3, fill: false }).addTo(map);
  } else {
    puttingAreaBasketPlacementCircle2.setLatLng(latlng);
  }
}

function handlePuttingAreaBasketPlacementMapClick(e) {
  puttingAreaBasketPlacementLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
  const scale = scaleForZoom(puttingAreaBasketPlacementMap);

  if (puttingAreaBasketPlacementMarker) {
    puttingAreaBasketPlacementMarker.setLatLng(e.latlng);
  } else {
    puttingAreaBasketPlacementMarker = L.marker(e.latlng, { icon: makeBasketIcon(scale), draggable: true }).addTo(puttingAreaBasketPlacementMap);
    puttingAreaBasketPlacementMarker.on('drag', (ev) => {
      puttingAreaBasketPlacementLatLng = { lat: ev.target.getLatLng().lat, lng: ev.target.getLatLng().lng };
      updatePuttingPracticeCircles(puttingAreaBasketPlacementMap, ev.target.getLatLng());
    });
  }
  updatePuttingPracticeCircles(puttingAreaBasketPlacementMap, e.latlng);

  document.getElementById('putting-area-basket-placement-instructions').textContent = 'Drag to adjust, then press Enter.';
  document.getElementById('putting-area-basket-placement-confirm-btn').classList.remove('hide');
}

async function handlePuttingAreaBasketPlacementConfirm() {
  if (!puttingAreaBasketPlacementLatLng) return;

  const area = {
    name: pendingPuttingAreaName,
    address: pendingPuttingAreaAddress,
    lat: pendingPuttingAreaLat,
    lng: pendingPuttingAreaLng,
    basket: puttingAreaBasketPlacementLatLng
  };

  const db = await openDiscTallyDB();
  area.id = await addPuttingArea(db, area);

  document.getElementById('putting-area-basket-placement-modal').classList.remove('active');
  if (puttingAreaBasketPlacementMap) {
    stopLiveLocationTracking(puttingAreaBasketPlacementMapLocationTracker);
    puttingAreaBasketPlacementMapLocationTracker = null;
    puttingAreaBasketPlacementMap.remove();
    puttingAreaBasketPlacementMap = null;
  }

  openPuttingPracticeMode(area);
}

function handlePuttingAreaBasketPlacementCancel() {
  document.getElementById('putting-area-basket-placement-modal').classList.remove('active');
  if (puttingAreaBasketPlacementMap) {
    stopLiveLocationTracking(puttingAreaBasketPlacementMapLocationTracker);
    puttingAreaBasketPlacementMapLocationTracker = null;
    puttingAreaBasketPlacementMap.remove();
    puttingAreaBasketPlacementMap = null;
  }
}

/* ---------- Practice mode (Segment 2) ---------- */

let puttPracticeCurrentArea = null;
let puttPracticeSpots = [];        // permanent spots loaded from DB for this area: {id, areaId, number, lat, lng}
let puttPracticeTempSpotCounter = 0; // numbering for this-session-only temporary spots
let puttPracticeCircle1 = null;    // Circle 1 (10m) around the basket — magenta
let puttPracticeCircle2 = null;    // Circle 2 (20m) around the basket — blue
let puttPracticeAddSpotType = null; // 'permanent' | 'temporary', set once chosen, cleared after marking
let puttPracticeActiveSpot = null;  // spot currently being scored: {number, lat, lng, isPermanent, spotId, distanceFt}
let puttPracticeSessionRounds = []; // this visit's recorded results — Segment 4's Finish Practice will persist these
let puttPracticeWeather = null;     // fetched once when practice mode opens, saved with the session

async function openPuttingPracticeMode(area) {
  puttPracticeCurrentArea = area;
  puttPracticeAddSpotType = null;
  puttPracticeTempSpotCounter = 0;
  puttPracticeCircle1 = null;
  puttPracticeCircle2 = null;
  puttPracticeActiveSpot = null;
  puttPracticeSessionRounds = [];
  puttPracticeWeather = null;
  document.getElementById('putt-practice-session-log').innerHTML = '';

  document.getElementById('putt-practice-hole-label').textContent = 'Putt Practice — ' + (area.name || 'Area');
  document.getElementById('putt-practice-screen').classList.add('active');

  if (puttPracticeMap) {
    stopLiveLocationTracking(puttPracticeMapLocationTracker);
    puttPracticeMapLocationTracker = null;
    puttPracticeMap.remove();
    puttPracticeMap = null;
  }

  puttPracticeMap = L.map('putt-practice-map', { zoomSnap: 0.25, zoomDelta: 0.5, maxZoom: 22 });
  L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri'
  }).addTo(puttPracticeMap);
  puttPracticeMapLocationTracker = startLiveLocationTracking(puttPracticeMap);

  const center = [area.basket.lat, area.basket.lng];

  const weatherEl = document.getElementById('putt-practice-weather');
  if (weatherEl) weatherEl.innerHTML = '<div class="weather-widget-unavailable">Loading weather&hellip;</div>';
  fetchNwsWeather(area.basket.lat, area.basket.lng).then(weatherData => {
    puttPracticeWeather = weatherData;
    if (weatherEl) renderWeatherWidget(weatherEl, weatherData);
  });

  setTimeout(() => {
    puttPracticeMap.invalidateSize();
    puttPracticeMap.setView(center, 20);
    L.marker(center, { icon: makeBasketIcon(1.5, false) }).addTo(puttPracticeMap);
    updatePuttPracticeRings(center);
  }, 50);

  const db = await openDiscTallyDB();
  puttPracticeSpots = await getPuttingSpotsForArea(db, area.id);
  puttPracticeSpots.forEach(spot => plotPuttPracticeSpotMarker(spot.number, spot.lat, spot.lng, true));

  resetPuttPracticeControls();
}

// Circle 1 (10m) / Circle 2 (20m) stay fixed at the BASKET — they mark
// the putting zones relative to the basket, not to wherever a throwing
// spot happens to be. Same geodesic-meters approach as the basket
// placement screen, so these are correctly scaled at any zoom too.
function updatePuttPracticeRings(latlng) {
  if (!puttPracticeCircle1) {
    puttPracticeCircle1 = L.circle(latlng, { radius: 10, color: '#FF2D95', weight: 3, fill: false }).addTo(puttPracticeMap);
  } else {
    puttPracticeCircle1.setLatLng(latlng);
  }
  if (!puttPracticeCircle2) {
    puttPracticeCircle2 = L.circle(latlng, { radius: 20, color: '#0080FF', weight: 3, fill: false }).addTo(puttPracticeMap);
  } else {
    puttPracticeCircle2.setLatLng(latlng);
  }
}

// Numbered throwing-spot marker — teal for permanent spots (reusable
// next visit), orange for temporary (this session only) — deliberately
// different from the magenta/blue C1/C2 rings so they don't get
// visually confused with each other.
function plotPuttPracticeSpotMarker(number, lat, lng, isPermanent) {
  const label = isPermanent ? String(number) : ('T' + number);
  const icon = L.divIcon({
    html: '<div style="width:26px;height:26px;border-radius:50%;background:' + (isPermanent ? '#038C7F' : '#F27405') +
      ';border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:0.8rem;box-shadow:0 0 3px rgba(0,0,0,0.6);">' + label + '</div>',
    className: 'placement-div-icon',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
  return L.marker([lat, lng], { icon }).addTo(puttPracticeMap);
}

function resetPuttPracticeControls() {
  puttPracticeAddSpotType = null;
  puttPracticeActiveSpot = null;
  document.getElementById('putt-practice-instructions').textContent = '';
  document.getElementById('putt-practice-add-spot-btn').classList.remove('hide');
  document.getElementById('putt-practice-spot-permanent-btn').classList.add('hide');
  document.getElementById('putt-practice-spot-temporary-btn').classList.add('hide');
  document.getElementById('putt-practice-mark-btn').classList.add('hide');
  document.getElementById('putt-practice-cancel-add-spot-btn').classList.add('hide');
  document.getElementById('putt-practice-record-row').classList.add('hide');
  document.getElementById('putt-practice-record-status').textContent = '';
  document.getElementById('putt-practice-attempts-input').value = '';
  document.getElementById('putt-practice-makes-input').value = '';

  const reuseSelect = document.getElementById('putt-practice-reuse-spot-select');
  const useExistingBtn = document.getElementById('putt-practice-use-existing-spot-btn');
  if (puttPracticeSpots.length > 0) {
    reuseSelect.innerHTML = '';
    puttPracticeSpots.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = 'Spot ' + s.number;
      reuseSelect.appendChild(opt);
    });
    reuseSelect.classList.remove('hide');
    useExistingBtn.classList.remove('hide');
  } else {
    reuseSelect.classList.add('hide');
    useExistingBtn.classList.add('hide');
  }
}

function handleAddSpotClick() {
  document.getElementById('putt-practice-instructions').textContent = 'New spot: permanent (reusable next visit) or temporary (just for today)?';
  document.getElementById('putt-practice-add-spot-btn').classList.add('hide');
  document.getElementById('putt-practice-reuse-spot-select').classList.add('hide');
  document.getElementById('putt-practice-use-existing-spot-btn').classList.add('hide');
  document.getElementById('putt-practice-spot-permanent-btn').classList.remove('hide');
  document.getElementById('putt-practice-spot-temporary-btn').classList.remove('hide');
  document.getElementById('putt-practice-cancel-add-spot-btn').classList.remove('hide');
}

function handleChooseSpotType(isPermanent) {
  puttPracticeAddSpotType = isPermanent ? 'permanent' : 'temporary';
  document.getElementById('putt-practice-spot-permanent-btn').classList.add('hide');
  document.getElementById('putt-practice-spot-temporary-btn').classList.add('hide');
  document.getElementById('putt-practice-instructions').textContent = 'Walk to your spot, then press Mark.';
  document.getElementById('putt-practice-mark-btn').classList.remove('hide');
}

function handleCancelAddSpot() {
  resetPuttPracticeControls();
}

function handlePuttPracticeMark() {
  document.getElementById('putt-practice-mark-btn').classList.add('hide');
  document.getElementById('putt-practice-cancel-add-spot-btn').classList.add('hide');

  captureAccurateGpsPosition(async (pos) => {
    if (!pos) { resetPuttPracticeControls(); return; }

    const isPermanent = (puttPracticeAddSpotType === 'permanent');
    const distanceFt = haversineFeet(puttPracticeCurrentArea.basket.lat, puttPracticeCurrentArea.basket.lng, pos.lat, pos.lng);

    let number;
    if (isPermanent) {
      number = puttPracticeSpots.reduce((max, s) => Math.max(max, s.number), 0) + 1;
      const spot = { areaId: puttPracticeCurrentArea.id, number, lat: pos.lat, lng: pos.lng };
      const db = await openDiscTallyDB();
      spot.id = await addPuttingSpot(db, spot);
      puttPracticeSpots.push(spot);
    } else {
      number = ++puttPracticeTempSpotCounter;
    }

    plotPuttPracticeSpotMarker(number, pos.lat, pos.lng, isPermanent);

    showPuttPracticeRecordForm({
      number,
      lat: pos.lat,
      lng: pos.lng,
      isPermanent,
      spotId: isPermanent ? puttPracticeSpots[puttPracticeSpots.length - 1].id : null,
      distanceFt
    });
  });
}

function handleUseExistingSpot() {
  const select = document.getElementById('putt-practice-reuse-spot-select');
  const spotId = Number(select.value);
  const spot = puttPracticeSpots.find(s => s.id === spotId);
  if (!spot) return;

  const distanceFt = haversineFeet(puttPracticeCurrentArea.basket.lat, puttPracticeCurrentArea.basket.lng, spot.lat, spot.lng);

  showPuttPracticeRecordForm({
    number: spot.number,
    lat: spot.lat,
    lng: spot.lng,
    isPermanent: true,
    spotId: spot.id,
    distanceFt
  });
}

// Shows the Attempts/Makes entry form for whichever spot was just
// marked or selected. Kept separate from resetPuttPracticeControls()
// since this needs the OTHER controls (Add Spot, reuse dropdown)
// hidden while it's active, not shown alongside it.
function showPuttPracticeRecordForm(spot) {
  puttPracticeActiveSpot = spot;

  document.getElementById('putt-practice-add-spot-btn').classList.add('hide');
  document.getElementById('putt-practice-reuse-spot-select').classList.add('hide');
  document.getElementById('putt-practice-use-existing-spot-btn').classList.add('hide');
  document.getElementById('putt-practice-spot-permanent-btn').classList.add('hide');
  document.getElementById('putt-practice-spot-temporary-btn').classList.add('hide');
  document.getElementById('putt-practice-mark-btn').classList.add('hide');
  document.getElementById('putt-practice-cancel-add-spot-btn').classList.add('hide');

  document.getElementById('putt-practice-instructions').textContent =
    (spot.isPermanent ? 'Spot ' + spot.number : 'Temporary spot ' + spot.number) + ' — enter your results.';
  document.getElementById('putt-practice-record-distance').textContent =
    Math.round(spot.distanceFt) + ' ft from the basket';
  document.getElementById('putt-practice-attempts-input').value = '';
  document.getElementById('putt-practice-makes-input').value = '';
  document.getElementById('putt-practice-record-status').textContent = '';
  document.getElementById('putt-practice-record-row').classList.remove('hide');
}

function handleCancelPuttResults() {
  resetPuttPracticeControls();
}

function handleSavePuttResults() {
  const statusEl = document.getElementById('putt-practice-record-status');
  const attempts = parseInt(document.getElementById('putt-practice-attempts-input').value, 10);
  const makes = parseInt(document.getElementById('putt-practice-makes-input').value, 10);

  if (!Number.isFinite(attempts) || attempts < 1) {
    statusEl.textContent = 'Enter how many attempts you took.';
    return;
  }
  if (!Number.isFinite(makes) || makes < 0 || makes > attempts) {
    statusEl.textContent = 'Makes must be a number between 0 and the attempts you entered.';
    return;
  }

  const spot = puttPracticeActiveSpot;

  if (spot.isPermanent) {
    finalizePuttResultsSave(spot, attempts, makes, true);
  } else {
    showConfirmModal(
      'Save these stats to your history? (The spot itself is temporary either way — this only affects whether today\'s attempts/makes here get kept.)',
      () => finalizePuttResultsSave(spot, attempts, makes, true),
      () => finalizePuttResultsSave(spot, attempts, makes, false)
    );
  }
}

function finalizePuttResultsSave(spot, attempts, makes, saveToHistory) {
  puttPracticeSessionRounds.push({
    spotId: spot.spotId,
    spotNumber: spot.number,
    isPermanent: spot.isPermanent,
    lat: spot.lat,
    lng: spot.lng,
    distanceFt: spot.distanceFt,
    attempts,
    makes,
    saveToHistory
  });

  const logEl = document.getElementById('putt-practice-session-log');
  const row = document.createElement('div');
  row.textContent = (spot.isPermanent ? 'Spot ' + spot.number : 'Temp ' + spot.number) +
    ': ' + makes + '/' + attempts + ' — ' + Math.round(spot.distanceFt) + ' ft' +
    (spot.isPermanent ? '' : (saveToHistory ? ' (saved)' : ' (not saved)'));
  logEl.appendChild(row);

  resetPuttPracticeControls();
}

/* ---------- Finish Practice + Putting stats (Segment 4) ---------- */

async function handleFinishPuttPractice() {
  // Permanent-spot results always persist; temporary-spot results only
  // persist if the user opted in when saving them (see finalizePuttResultsSave).
  const roundsToSave = puttPracticeSessionRounds.filter(r => r.isPermanent || r.saveToHistory);

  if (roundsToSave.length > 0) {
    const db = await openDiscTallyDB();
    await addPuttingSession(db, {
      areaId: puttPracticeCurrentArea.id,
      areaName: puttPracticeCurrentArea.name,
      date: Date.now(),
      weather: puttPracticeWeather,
      rounds: roundsToSave
    });
  }

  const totalAttempts = puttPracticeSessionRounds.reduce((s, r) => s + r.attempts, 0);
  const totalMakes = puttPracticeSessionRounds.reduce((s, r) => s + r.makes, 0);

  document.getElementById('putt-practice-screen').classList.remove('active');
  const weatherEl = document.getElementById('putt-practice-weather');
  if (weatherEl) weatherEl.innerHTML = '';
  if (puttPracticeMap) {
    stopLiveLocationTracking(puttPracticeMapLocationTracker);
    puttPracticeMapLocationTracker = null;
    puttPracticeMap.remove();
    puttPracticeMap = null;
  }

  showGenericModal(
    puttPracticeSessionRounds.length === 0
      ? 'No results were recorded this session.'
      : 'Session saved — ' + totalMakes + '/' + totalAttempts + ' overall this visit. Check the Putting tab in Stats to see updated averages.'
  );
}

// Flattens every saved session's rounds into per-spot totals — a
// permanent spot's results are grouped by its stable spotId (so the
// same spot's results accumulate across multiple visits); temporary
// spots have no stable identity across sessions, so all of an area's
// saved temporary-spot results are lumped into one bucket per area.
function computePuttingStatsBySpot(sessions) {
  const bySpot = {};
  let overallAttempts = 0, overallMakes = 0;

  (sessions || []).forEach(session => {
    (session.rounds || []).forEach(r => {
      overallAttempts += r.attempts;
      overallMakes += r.makes;

      const key = r.isPermanent ? ('spot:' + r.spotId) : ('temp:' + session.areaId);
      if (!bySpot[key]) {
        bySpot[key] = {
          label: r.isPermanent ? (session.areaName + ' — Spot ' + r.spotNumber) : (session.areaName + ' — Temporary spots'),
          attempts: 0,
          makes: 0,
          distances: []
        };
      }
      bySpot[key].attempts += r.attempts;
      bySpot[key].makes += r.makes;
      bySpot[key].distances.push(r.distanceFt);
    });
  });

  const spotStats = Object.values(bySpot).map(s => ({
    label: s.label,
    attempts: s.attempts,
    makes: s.makes,
    pct: s.attempts ? (s.makes / s.attempts * 100) : 0,
    avgDistance: s.distances.reduce((a, b) => a + b, 0) / s.distances.length
  })).sort((a, b) => b.attempts - a.attempts);

  return {
    sessions: (sessions || []).length,
    overallAttempts,
    overallMakes,
    overallPct: overallAttempts ? (overallMakes / overallAttempts * 100) : 0,
    spotStats
  };
}

async function renderPuttingStatsTab() {
  const db = await openDiscTallyDB();
  const sessions = await getAllPuttingSessions(db);

  const container = document.getElementById('stats-modal-content');
  const clearBtn = document.getElementById('clear-all-stats-btn');
  const deleteBtn = document.getElementById('delete-selected-rounds-btn');
  if (deleteBtn) deleteBtn.classList.add('hide'); // no per-session selection UI on this aggregate view

  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<p>No Putt Practice sessions recorded yet. Finish a session to see stats here.</p>';
    if (clearBtn) clearBtn.classList.add('hide');
    return;
  }
  if (clearBtn) clearBtn.classList.remove('hide');

  const stats = computePuttingStatsBySpot(sessions);

  let html = '<div class="stats-overall-block"><h5>Overall</h5>' +
    '<div class="stats-round-row"><span>Sessions</span><span>' + stats.sessions + '</span></div>' +
    '<div class="stats-round-row"><span>Attempts</span><span>' + stats.overallAttempts + '</span></div>' +
    '<div class="stats-round-row"><span>Makes</span><span>' + stats.overallMakes + '</span></div>' +
    '<div class="stats-round-row"><span>Make %</span><span>' + Math.round(stats.overallPct) + '%</span></div>' +
    '</div>';

  stats.spotStats.forEach(s => {
    html += '<div class="stats-overall-block"><h5>' + s.label + '</h5>' +
      '<div class="stats-round-row"><span>Distance</span><span>' + Math.round(s.avgDistance) + ' ft</span></div>' +
      '<div class="stats-round-row"><span>Attempts</span><span>' + s.attempts + '</span></div>' +
      '<div class="stats-round-row"><span>Makes</span><span>' + s.makes + '</span></div>' +
      '<div class="stats-round-row"><span>Make %</span><span>' + Math.round(s.pct) + '%</span></div>' +
      '</div>';
  });

  container.innerHTML = html;
}

async function clearAllPuttingStats() {
  const db = await openDiscTallyDB();
  await clearAllPuttingSessions(db);
  await renderStatsTabs();
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('putt-practice-finish-btn')?.addEventListener('click', handleFinishPuttPractice);
  document.getElementById('putt-practice-close-btn')?.addEventListener('click', () => {
    document.getElementById('putt-practice-screen').classList.remove('active');
    const weatherEl = document.getElementById('putt-practice-weather');
    if (weatherEl) weatherEl.innerHTML = '';
    if (puttPracticeMap) {
      stopLiveLocationTracking(puttPracticeMapLocationTracker);
      puttPracticeMapLocationTracker = null;
      puttPracticeMap.remove();
      puttPracticeMap = null;
    }
  });

  document.getElementById('putting-area-use-existing-btn')?.addEventListener('click', handleUseExistingPuttingAreaClick);
  document.getElementById('putting-area-create-new-btn')?.addEventListener('click', handleCreateNewPuttingAreaClick);
  document.getElementById('putting-area-choice-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('putting-area-choice-modal').classList.remove('active');
  });

  document.getElementById('putting-area-select-go-btn')?.addEventListener('click', handlePuttingAreaSelectGo);
  document.getElementById('putting-area-select-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('putting-area-select-modal').classList.remove('active');
  });

  document.getElementById('new-putting-area-search-btn')?.addEventListener('click', handleNewPuttingAreaSearch);
  document.getElementById('new-putting-area-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('new-putting-area-info-modal').classList.remove('active');
  });
  document.getElementById('new-putting-area-street-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleNewPuttingAreaSearch();
  });
  document.getElementById('new-putting-area-city-state-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleNewPuttingAreaSearch();
  });

  document.getElementById('putting-area-basket-placement-confirm-btn')?.addEventListener('click', handlePuttingAreaBasketPlacementConfirm);
  document.getElementById('putting-area-basket-placement-cancel-btn')?.addEventListener('click', handlePuttingAreaBasketPlacementCancel);

  document.getElementById('putt-practice-add-spot-btn')?.addEventListener('click', handleAddSpotClick);
  document.getElementById('putt-practice-spot-permanent-btn')?.addEventListener('click', () => handleChooseSpotType(true));
  document.getElementById('putt-practice-spot-temporary-btn')?.addEventListener('click', () => handleChooseSpotType(false));
  document.getElementById('putt-practice-cancel-add-spot-btn')?.addEventListener('click', handleCancelAddSpot);
  document.getElementById('putt-practice-mark-btn')?.addEventListener('click', handlePuttPracticeMark);
  document.getElementById('putt-practice-use-existing-spot-btn')?.addEventListener('click', handleUseExistingSpot);
  document.getElementById('putt-practice-save-results-btn')?.addEventListener('click', handleSavePuttResults);
  document.getElementById('putt-practice-cancel-results-btn')?.addEventListener('click', handleCancelPuttResults);
});
