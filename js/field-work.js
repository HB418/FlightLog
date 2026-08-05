/* js/field-work.js
   Field Work: practice-throw sessions at a saved location (a "field")
   rather than a disc golf course. This file currently covers Segment 1:
   choosing an existing field or creating a new one (name/address search
   + tee placement). The session setup screen and the throw-marking map
   are separate, later segments.

   A field record: { id, name, address, lat, lng, tee: {lat, lng} }
*/

let pendingFieldName = '';
let pendingFieldAddress = '';
let pendingFieldLat = null;
let pendingFieldLng = null;

let fieldTeePlacementMap = null;
let fieldTeePlacementMapLocationTracker = null;
let fieldTeePlacementTeeMarker = null;
let fieldTeePlacementLatLng = null; // {lat, lng} once the tee has been tapped
let fieldTeePlacementRotation = 0;

function openFieldWorkChoiceModal() {
  document.getElementById('field-work-choice-modal').classList.add('active');
}

async function handleUseExistingFieldClick() {
  const db = await openDiscTallyDB();
  const fields = await getAllFields(db);
  const select = document.getElementById('field-select-dropdown');
  select.innerHTML = '';

  if (!fields || fields.length === 0) {
    document.getElementById('field-work-choice-modal').classList.remove('active');
    showGenericModal('No fields saved yet. Create a new one to get started.');
    return;
  }

  fields.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    select.appendChild(opt);
  });

  document.getElementById('field-work-choice-modal').classList.remove('active');
  document.getElementById('field-select-modal').classList.add('active');
}

async function handleFieldSelectGo() {
  const select = document.getElementById('field-select-dropdown');
  const fieldId = Number(select.value);
  if (!fieldId) return;

  const db = await openDiscTallyDB();
  const field = await getFieldById(db, fieldId);
  if (!field) return;

  document.getElementById('field-select-modal').classList.remove('active');
  openFieldWorkSetupScreen(field);
}

function handleCreateNewFieldClick() {
  document.getElementById('new-field-name-input').value = '';
  document.getElementById('new-field-street-input').value = '';
  document.getElementById('new-field-city-state-input').value = '';
  document.getElementById('new-field-search-status').textContent = '';
  document.getElementById('field-work-choice-modal').classList.remove('active');
  document.getElementById('new-field-info-modal').classList.add('active');
  document.getElementById('new-field-name-input').focus();
}

async function handleNewFieldSearch() {
  const name = document.getElementById('new-field-name-input').value.trim();
  const street = document.getElementById('new-field-street-input').value.trim();
  const cityState = document.getElementById('new-field-city-state-input').value.trim();
  const address = [street, cityState].filter(Boolean).join(', ');
  const statusEl = document.getElementById('new-field-search-status');

  if (!name) {
    statusEl.textContent = 'Enter a name for this field.';
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

  pendingFieldName = name;
  pendingFieldAddress = address;
  pendingFieldLat = result.lat;
  pendingFieldLng = result.lng;
  statusEl.textContent = '';

  document.getElementById('new-field-info-modal').classList.remove('active');
  launchFieldTeePlacement();
}

function launchFieldTeePlacement() {
  fieldTeePlacementLatLng = null;
  fieldTeePlacementTeeMarker = null;
  fieldTeePlacementRotation = 0;
  document.getElementById('field-tee-placement-confirm-btn').classList.add('hide');
  document.getElementById('field-tee-placement-rotation-row').classList.add('hide');
  document.getElementById('field-tee-placement-rotation').value = 0;
  document.getElementById('field-tee-placement-instructions').textContent = 'Tap the map to place the tee.';

  document.getElementById('field-tee-placement-modal').classList.add('active');

  const center = [pendingFieldLat, pendingFieldLng];

  if (!fieldTeePlacementMap && typeof L !== 'undefined') {
    fieldTeePlacementMap = L.map('field-tee-placement-map', { zoomAnimation: false, fadeAnimation: false, zoomSnap: 0.25, zoomDelta: 0.5, maxZoom: 22 });
    L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }).addTo(fieldTeePlacementMap);
    fieldTeePlacementMapLocationTracker = startLiveLocationTracking(fieldTeePlacementMap);
    fieldTeePlacementMap.on('click', handleFieldTeePlacementMapClick);

    document.querySelectorAll('#field-tee-placement-modal .map-popup-btn, #field-tee-placement-modal .map-popup-overlay-bar')
      .forEach(el => {
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
      });
  }
  fieldTeePlacementMap.setView(center, 18);
  setTimeout(() => fieldTeePlacementMap.invalidateSize(), 50);
}

function handleFieldTeePlacementMapClick(e) {
  fieldTeePlacementLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
  const scale = scaleForZoom(fieldTeePlacementMap);

  if (fieldTeePlacementTeeMarker) {
    fieldTeePlacementTeeMarker.setLatLng(e.latlng);
  } else {
    fieldTeePlacementRotation = 0;
    fieldTeePlacementTeeMarker = L.marker(e.latlng, { icon: makeTeeDivIcon(0, scale), draggable: true }).addTo(fieldTeePlacementMap);
    fieldTeePlacementTeeMarker._rotationDeg = 0;
    fieldTeePlacementTeeMarker.on('drag', (ev) => {
      fieldTeePlacementLatLng = { lat: ev.target.getLatLng().lat, lng: ev.target.getLatLng().lng };
    });
  }

  document.getElementById('field-tee-placement-instructions').textContent = 'Drag to adjust, use the slider to set facing direction, then press Enter.';
  document.getElementById('field-tee-placement-rotation-row').classList.remove('hide');
  document.getElementById('field-tee-placement-rotation').value = fieldTeePlacementRotation;
  document.getElementById('field-tee-placement-confirm-btn').classList.remove('hide');
}

function handleFieldTeeRotationInput(e) {
  fieldTeePlacementRotation = Number(e.target.value);
  if (!fieldTeePlacementTeeMarker) return;
  fieldTeePlacementTeeMarker._rotationDeg = fieldTeePlacementRotation;
  const el = fieldTeePlacementTeeMarker.getElement();
  if (!el) return;
  const img = el.querySelector('img');
  if (img) img.style.transform = 'rotate(' + fieldTeePlacementRotation + 'deg)';
}

async function handleFieldTeePlacementConfirm() {
  if (!fieldTeePlacementLatLng) return;

  const field = {
    name: pendingFieldName,
    address: pendingFieldAddress,
    lat: pendingFieldLat,
    lng: pendingFieldLng,
    tee: { lat: fieldTeePlacementLatLng.lat, lng: fieldTeePlacementLatLng.lng, rotation: fieldTeePlacementRotation }
  };

  const db = await openDiscTallyDB();
  field.id = await addField(db, field);

  document.getElementById('field-tee-placement-modal').classList.remove('active');
  if (fieldTeePlacementMap) {
    stopLiveLocationTracking(fieldTeePlacementMapLocationTracker);
    fieldTeePlacementMapLocationTracker = null;
    fieldTeePlacementMap.remove();
    fieldTeePlacementMap = null;
  }

  openFieldWorkSetupScreen(field);
}

function handleFieldTeePlacementCancel() {
  document.getElementById('field-tee-placement-modal').classList.remove('active');
  if (fieldTeePlacementMap) {
    stopLiveLocationTracking(fieldTeePlacementMapLocationTracker);
    fieldTeePlacementMapLocationTracker = null;
    fieldTeePlacementMap.remove();
    fieldTeePlacementMap = null;
  }
}

/* ---------- Session setup screen (Segment 2) ---------- */

let fieldWorkCurrentField = null; // the field record this setup screen is configuring a session for
let fieldWorkShotType = 'backhand';
let fieldWorkNotes = '';
let fieldWorkActiveDiscSlots = []; // [{discId, discName, color}] chosen at setup, up to 5
let fieldWorkWeather = null; // fetched once when the map screen opens, saved with the session

async function openFieldWorkSetupScreen(field) {
  fieldWorkCurrentField = field;
  document.getElementById('fw-shot-type-select').value = 'backhand';
  document.getElementById('fw-disc-count-select').value = '1';
  document.getElementById('fw-notes-input').value = '';
  await rebuildFieldWorkDiscSlots(1);
  document.getElementById('field-work-setup-modal').classList.add('active');
}

// Sorts discs by their real Field Work average distance (from saved
// sessions), closest first. discStatsMap is keyed by discId, built by
// computeFieldWorkDiscStats() — discs with no throws recorded yet keep
// their existing relative order (they all tie on Infinity).
function orderDiscsByClosest(discs, discStatsMap) {
  return discs.slice().sort((a, b) => {
    const av = (discStatsMap[a.id] && typeof discStatsMap[a.id].avgDistance === 'number') ? discStatsMap[a.id].avgDistance : Infinity;
    const bv = (discStatsMap[b.id] && typeof discStatsMap[b.id].avgDistance === 'number') ? discStatsMap[b.id].avgDistance : Infinity;
    return av - bv;
  });
}

async function rebuildFieldWorkDiscSlots(count) {
  const db = await openDiscTallyDB();
  const discs = await getAllDiscs(db);
  const sessions = await getAllFieldSessions(db);
  const discStatsMap = {};
  computeFieldWorkDiscStats(sessions).forEach(s => { discStatsMap[s.discId] = s; });
  const ordered = orderDiscsByClosest(discs, discStatsMap);

  const container = document.getElementById('fw-disc-slots-container');
  const previousValues = Array.from(container.querySelectorAll('.disc-combobox-input')).map(inp => ({
    text: inp.value,
    discId: inp.dataset.discId
  }));

  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const slot = buildFieldWorkDiscSlot(i, ordered);
    container.appendChild(slot);
    // Preserve whatever was already typed/picked in this slot's position
    // when just changing the disc count, rather than wiping every slot.
    if (previousValues[i]) {
      const input = slot.querySelector('.disc-combobox-input');
      input.value = previousValues[i].text;
      if (previousValues[i].discId) input.dataset.discId = previousValues[i].discId;
    }
  }
}

function buildFieldWorkDiscSlot(index, discs) {
  const wrap = document.createElement('div');
  wrap.className = 'fw-disc-slot';
  wrap.style.marginBottom = '0.7rem';

  const label = document.createElement('label');
  label.textContent = 'Disc ' + (index + 1);
  wrap.appendChild(label);

  const combo = document.createElement('div');
  combo.className = 'disc-combobox';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'disc-combobox-input';
  input.placeholder = 'Type to search discs...';
  input.autocomplete = 'off';
  input.style.width = '100%';
  combo.appendChild(input);

  const list = document.createElement('div');
  list.className = 'disc-combobox-list hide';
  combo.appendChild(list);

  wrap.appendChild(combo);

  const colorSwatches = document.createElement('div');
  colorSwatches.className = 'fw-color-swatches hide';
  colorSwatches.style.marginTop = '0.4rem';
  wrap.appendChild(colorSwatches);

  function renderList(query) {
    list.innerHTML = '';
    let items = discs;
    if (query) {
      items = discs
        .map(d => ({ d, score: searchRelevanceScore([d.name, d.brand, d.category], query) }))
        .filter(x => x.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.d);
    }
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'disc-combobox-empty';
      empty.textContent = 'No matching discs';
      list.appendChild(empty);
      return;
    }
    items.forEach(d => {
      const item = document.createElement('div');
      item.className = 'disc-combobox-item';
      item.textContent = d.name + (d.brand ? ' (' + d.brand + ')' : '');
      item.addEventListener('mousedown', (ev) => {
        ev.preventDefault(); // keeps the click registering before the input's blur hides the list
        input.value = d.name;
        input.dataset.discId = d.id;
        list.classList.add('hide');
        populateFieldWorkColorSwatches(colorSwatches, d);
      });
      list.appendChild(item);
    });
  }

  input.addEventListener('focus', () => {
    renderList(input.value.trim());
    list.classList.remove('hide');
  });
  input.addEventListener('input', () => {
    delete input.dataset.discId; // typing invalidates whatever was previously picked
    colorSwatches.classList.add('hide');
    renderList(input.value.trim());
    list.classList.remove('hide');
  });
  input.addEventListener('blur', () => {
    setTimeout(() => list.classList.add('hide'), 150);
  });

  return wrap;
}

function populateFieldWorkColorSwatches(container, disc) {
  container.innerHTML = '';
  delete container.dataset.selectedColor;
  if (!Array.isArray(disc.colors) || disc.colors.length === 0) {
    container.classList.add('hide');
    return;
  }
  disc.colors.forEach((c, i) => {
    const swatch = document.createElement('div');
    swatch.setAttribute('role', 'button');
    swatch.tabIndex = 0;
    swatch.className = 'fw-color-swatch';
    swatch.style.background = c;
    swatch.title = c;
    swatch.addEventListener('click', () => {
      container.dataset.selectedColor = c;
      container.querySelectorAll('.fw-color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
    });
    swatch.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); swatch.click(); }
    });
    container.appendChild(swatch);
  });
  // Default to the first color so a choice always exists without
  // requiring an extra click.
  container.dataset.selectedColor = disc.colors[0];
  container.firstChild.classList.add('selected');
  container.classList.remove('hide');
}

function handleFieldWorkSetupBack() {
  document.getElementById('field-work-setup-modal').classList.remove('active');
  openFieldWorkChoiceModal();
}

function handleFieldWorkSetupNext() {
  const shotType = document.getElementById('fw-shot-type-select').value;
  const notes = document.getElementById('fw-notes-input').value.trim();

  const slots = Array.from(document.querySelectorAll('#fw-disc-slots-container .fw-disc-slot'));
  const discs = [];
  for (const slot of slots) {
    const input = slot.querySelector('.disc-combobox-input');
    const discId = input.dataset.discId ? Number(input.dataset.discId) : null;
    if (!discId) continue; // skip any slot left blank/unselected
    const colorSwatches = slot.querySelector('.fw-color-swatches');
    const color = (!colorSwatches.classList.contains('hide')) ? (colorSwatches.dataset.selectedColor || null) : null;
    discs.push({ discId, discName: input.value.trim(), color });
  }

  if (discs.length === 0) {
    showGenericModal('Pick at least one disc before continuing.');
    return;
  }

  fieldWorkShotType = shotType;
  fieldWorkNotes = notes;
  fieldWorkActiveDiscSlots = discs;

  document.getElementById('field-work-setup-modal').classList.remove('active');
  openFieldWorkMapScreen();
}

/* ---------- Throw-marking map (Segment 3) ---------- */

let fieldWorkMap = null;
let fieldWorkMapLocationTracker = null;
let fieldWorkThrows = [];        // saved rounds for this session: {shotType, discA, discB, teeToA, teeToB, aToB, bearing, timestamp}
let fwCurrentStep = null;        // 'mark-disc1' | 'mark-disc2' | 'review'
let fwDisc1 = null;              // {discId, discName, color, lat, lng, marker}
let fwDisc2 = null;              // same shape
let fwBaseBearing = 0;           // GPS-computed bearing disc1 -> disc2
let fwBaseDistance = 0;          // GPS-computed distance disc1 -> disc2 (feet)
let fwCurrentBearing = 0;        // possibly slider-adjusted
let fwCurrentDistance = 0;       // possibly user-typed override
let fwArrowMarker = null;

// A colored dot for a marked disc landing spot — color matches whatever
// was assigned to that disc during setup, falling back to a plain
// yellow if the disc has no color assigned.
function makeThrowMarkerIcon(color) {
  const size = 18;
  return L.divIcon({
    html: '<div style="width:100%;height:100%;border-radius:50%;background:' + (color || '#FFD400') +
      ';border:2px solid #222;box-shadow:0 0 3px rgba(0,0,0,0.6);"></div>',
    className: 'placement-div-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

// A small arrow rooted at disc 1, pointing toward disc 2 — rotated to
// match a compass bearing (0=N, 90=E, ...). The SVG's own rest pose
// points east (90°), so the CSS rotation needed is bearing-90.
function makeDirectionArrowIcon(bearingDeg) {
  const w = 40, h = 14;
  return L.divIcon({
    html: '<div style="width:100%;height:100%;transform:rotate(' + (bearingDeg - 90) + 'deg);transform-origin:10% 50%;">' +
      '<svg viewBox="0 0 100 40" style="width:100%;height:100%;overflow:visible;">' +
      '<polygon points="0,12 70,12 70,2 100,20 70,38 70,28 0,28" fill="#FF2D95" stroke="#fff" stroke-width="2"/>' +
      '</svg></div>',
    className: 'placement-div-icon',
    iconSize: [w, h],
    iconAnchor: [4, h / 2]
  });
}

function openFieldWorkMapScreen() {
  fieldWorkThrows = [];
  fwDisc1 = null;
  fwDisc2 = null;
  fwArrowMarker = null;
  fieldWorkWeather = null;

  const select = document.getElementById('fw-active-disc-select');
  select.innerHTML = '';
  fieldWorkActiveDiscSlots.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = d.discName;
    select.appendChild(opt);
  });

  document.getElementById('field-work-map-modal').classList.add('active');

  const tee = fieldWorkCurrentField.tee;
  const center = [tee.lat, tee.lng];

  if (!fieldWorkMap && typeof L !== 'undefined') {
    fieldWorkMap = L.map('field-work-map', { zoomAnimation: false, fadeAnimation: false, zoomSnap: 0.25, zoomDelta: 0.5, maxZoom: 22 });
    L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }).addTo(fieldWorkMap);
    fieldWorkMapLocationTracker = startLiveLocationTracking(fieldWorkMap);

    document.querySelectorAll('#field-work-map-modal .map-popup-btn, #field-work-map-modal .map-popup-overlay-bar')
      .forEach(el => {
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
      });
  } else if (fieldWorkMap) {
    // Reused map instance from an earlier session in this same page load — clear old markers.
    fieldWorkMap.eachLayer(layer => {
      if (layer instanceof L.Marker) fieldWorkMap.removeLayer(layer);
    });
  }
  fieldWorkMap.setView(center, 19);
  setTimeout(() => fieldWorkMap.invalidateSize(), 50);

  const scale = scaleForZoom(fieldWorkMap);
  L.marker(center, { icon: makeTeeDivIcon(tee.rotation || 0, scale) }).addTo(fieldWorkMap);

  fwCurrentStep = 'mark-disc1';
  updateFieldWorkMapUI();

  fetchAndRenderFieldWorkWeather();
}

// Fetched once per session (not polled) using the field's saved
// location — the same snapshot approach as the scorecard's weather,
// and reused later when Finish Practice saves the session.
function fetchAndRenderFieldWorkWeather() {
  const weatherEl = document.getElementById('fw-map-weather');
  if (weatherEl) weatherEl.innerHTML = '<div class="weather-widget-unavailable">Loading weather&hellip;</div>';
  fetchNwsWeather(fieldWorkCurrentField.lat, fieldWorkCurrentField.lng).then(weatherData => {
    fieldWorkWeather = weatherData;
    if (weatherEl) renderWeatherWidget(weatherEl, weatherData);
  });
}

function updateFieldWorkMapUI() {
  const instructions = document.getElementById('fw-map-instructions');
  const discPickerRow = document.getElementById('fw-disc-picker-row');
  const arrowRow = document.getElementById('fw-arrow-adjust-row');
  const distanceRow = document.getElementById('fw-distance-override-row');
  const resultsBlock = document.getElementById('fw-results-block');
  const markBtn = document.getElementById('fw-map-mark-btn');
  const saveBtn = document.getElementById('fw-map-save-btn');

  discPickerRow.classList.add('hide');
  arrowRow.classList.add('hide');
  distanceRow.classList.add('hide');
  markBtn.classList.add('hide');
  saveBtn.classList.add('hide');

  if (fwCurrentStep === 'mark-disc1') {
    instructions.textContent = 'Throw your disc, then walk to it and press Mark.';
    discPickerRow.classList.remove('hide');
    markBtn.classList.remove('hide');
    resultsBlock.classList.add('hide');

  } else if (fwCurrentStep === 'mark-disc2') {
    instructions.textContent = 'Walk to your 2nd disc and press Mark. Same disc, or pick a different one below.';
    discPickerRow.classList.remove('hide');
    markBtn.classList.remove('hide');

  } else if (fwCurrentStep === 'review') {
    instructions.textContent = 'Slide the arrow or edit the distance if it looks off, then Save.';
    arrowRow.classList.remove('hide');
    distanceRow.classList.remove('hide');
    saveBtn.classList.remove('hide');
  }
}

function renderFieldWorkResults() {
  const resultsBlock = document.getElementById('fw-results-block');
  const parts = [];
  if (fwDisc1) parts.push(fwDisc1.discName + ': ' + Math.round(haversineFeet(fieldWorkCurrentField.tee.lat, fieldWorkCurrentField.tee.lng, fwDisc1.lat, fwDisc1.lng)) + ' ft from tee');
  if (fwDisc2) {
    parts.push(fwDisc2.discName + ': ' + Math.round(haversineFeet(fieldWorkCurrentField.tee.lat, fieldWorkCurrentField.tee.lng, fwDisc2.lat, fwDisc2.lng)) + ' ft from tee');
    parts.push(Math.round(fwCurrentDistance) + ' ft between discs');
  }
  resultsBlock.innerHTML = parts.join('<br/>');
  resultsBlock.classList.remove('hide');
}

// Samples GPS position repeatedly for a few seconds and averages the
// readings for accuracy, showing a "hold your position" overlay for
// the duration. Calls back with {lat, lng} on success, or null if no
// reading could be obtained at all (no geolocation support, or every
// attempt errored).
function captureAccurateGpsPosition(onResult) {
  if (!navigator.geolocation) {
    showGenericModal('This device/browser does not support GPS location.');
    onResult(null);
    return;
  }

  document.getElementById('fw-gps-capture-modal').classList.add('active');
  const readings = [];
  const watchId = navigator.geolocation.watchPosition(
    (pos) => { readings.push({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
    () => { /* ignore individual errors, judge by whether we got any readings at all */ },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
  );

  setTimeout(() => {
    navigator.geolocation.clearWatch(watchId);
    document.getElementById('fw-gps-capture-modal').classList.remove('active');

    if (readings.length === 0) {
      showGenericModal('Could not get a GPS reading. Check location permissions and try again.');
      onResult(null);
      return;
    }
    const avgLat = readings.reduce((s, r) => s + r.lat, 0) / readings.length;
    const avgLng = readings.reduce((s, r) => s + r.lng, 0) / readings.length;
    onResult({ lat: avgLat, lng: avgLng });
  }, 5000);
}

function handleFieldWorkMark() {
  const select = document.getElementById('fw-active-disc-select');
  const slot = fieldWorkActiveDiscSlots[Number(select.value)];
  if (!slot) return;

  captureAccurateGpsPosition((pos) => {
    if (!pos) return;

    if (fwCurrentStep === 'mark-disc1') {
      const marker = L.marker([pos.lat, pos.lng], { icon: makeThrowMarkerIcon(slot.color) }).addTo(fieldWorkMap);
      fwDisc1 = { discId: slot.discId, discName: slot.discName, color: slot.color, lat: pos.lat, lng: pos.lng, marker };
      fwCurrentStep = 'mark-disc2';
      updateFieldWorkMapUI();
      renderFieldWorkResults();

    } else if (fwCurrentStep === 'mark-disc2') {
      const marker = L.marker([pos.lat, pos.lng], { icon: makeThrowMarkerIcon(slot.color) }).addTo(fieldWorkMap);
      fwDisc2 = { discId: slot.discId, discName: slot.discName, color: slot.color, lat: pos.lat, lng: pos.lng, marker };

      fwBaseBearing = bearingDegrees(fwDisc1.lat, fwDisc1.lng, fwDisc2.lat, fwDisc2.lng);
      fwBaseDistance = haversineFeet(fwDisc1.lat, fwDisc1.lng, fwDisc2.lat, fwDisc2.lng);
      fwCurrentBearing = fwBaseBearing;
      fwCurrentDistance = fwBaseDistance;

      document.getElementById('fw-arrow-rotation').value = 0;
      document.getElementById('fw-distance-override-input').value = Math.round(fwBaseDistance);

      fwArrowMarker = L.marker([fwDisc1.lat, fwDisc1.lng], { icon: makeDirectionArrowIcon(fwCurrentBearing) }).addTo(fieldWorkMap);

      fwCurrentStep = 'review';
      updateFieldWorkMapUI();
      renderFieldWorkResults();
    }
  });
}

// Moves disc 2's marker (and the arrow) to match whatever the current
// bearing/distance combo is, recomputed from disc 1's fixed position —
// used by both the direction slider and the distance override input.
function repositionDisc2FromBearingAndDistance() {
  const dest = destinationPoint(fwDisc1.lat, fwDisc1.lng, fwCurrentBearing, fwCurrentDistance);
  fwDisc2.lat = dest.lat;
  fwDisc2.lng = dest.lng;
  fwDisc2.marker.setLatLng([dest.lat, dest.lng]);
  fwArrowMarker.setIcon(makeDirectionArrowIcon(fwCurrentBearing));
  renderFieldWorkResults();
}

function handleFieldWorkArrowRotationInput(e) {
  const offset = Number(e.target.value);
  fwCurrentBearing = (fwBaseBearing + offset + 360) % 360;
  repositionDisc2FromBearingAndDistance();
}

function handleFieldWorkDistanceOverrideInput(e) {
  const val = Number(e.target.value);
  fwCurrentDistance = (val > 0) ? val : fwBaseDistance;
  repositionDisc2FromBearingAndDistance();
}

function handleFieldWorkSave() {
  const teeToA = haversineFeet(fieldWorkCurrentField.tee.lat, fieldWorkCurrentField.tee.lng, fwDisc1.lat, fwDisc1.lng);
  const teeToB = haversineFeet(fieldWorkCurrentField.tee.lat, fieldWorkCurrentField.tee.lng, fwDisc2.lat, fwDisc2.lng);

  fieldWorkThrows.push({
    shotType: fieldWorkShotType,
    discA: { discId: fwDisc1.discId, discName: fwDisc1.discName, color: fwDisc1.color, lat: fwDisc1.lat, lng: fwDisc1.lng },
    discB: { discId: fwDisc2.discId, discName: fwDisc2.discName, color: fwDisc2.color, lat: fwDisc2.lat, lng: fwDisc2.lng },
    teeToA,
    teeToB,
    aToB: fwCurrentDistance,
    bearing: fwCurrentBearing,
    timestamp: Date.now()
  });

  fwDisc1 = null;
  fwDisc2 = null;
  fwArrowMarker = null;
  document.getElementById('fw-results-block').classList.add('hide');

  fwCurrentStep = 'mark-disc1';
  updateFieldWorkMapUI();
}

function teardownFieldWorkMap() {
  document.getElementById('field-work-map-modal').classList.remove('active');
  if (fieldWorkMap) {
    stopLiveLocationTracking(fieldWorkMapLocationTracker);
    fieldWorkMapLocationTracker = null;
    fieldWorkMap.remove();
    fieldWorkMap = null;
  }
}

function handleFieldWorkMapBack() {
  teardownFieldWorkMap();
  document.getElementById('field-work-setup-modal').classList.add('active');
}

async function handleFieldWorkFinish() {
  const summaryLines = fieldWorkThrows.map((t, i) =>
    '#' + (i + 1) + ': ' + t.discA.discName + ' ' + Math.round(t.teeToA) + 'ft, ' +
    t.discB.discName + ' ' + Math.round(t.teeToB) + 'ft (' + Math.round(t.aToB) + 'ft apart)'
  );

  if (fieldWorkThrows.length > 0) {
    const db = await openDiscTallyDB();
    await addFieldSession(db, {
      fieldId: fieldWorkCurrentField.id,
      fieldName: fieldWorkCurrentField.name,
      tee: {
        lat: fieldWorkCurrentField.tee.lat,
        lng: fieldWorkCurrentField.tee.lng,
        rotation: fieldWorkCurrentField.tee.rotation || 0
      },
      shotType: fieldWorkShotType,
      notes: fieldWorkNotes,
      weather: fieldWorkWeather,
      discSlots: fieldWorkActiveDiscSlots.map(d => ({ discId: d.discId, discName: d.discName, color: d.color })),
      throws: fieldWorkThrows,
      date: Date.now()
    });
  }

  teardownFieldWorkMap();

  showGenericModal(
    fieldWorkThrows.length === 0
      ? 'No throws were recorded this session.'
      : 'Session saved — ' + fieldWorkThrows.length + ' throw(s) recorded. ' + summaryLines.join('  •  ') +
        '  Check the Fieldwork tab in Stats to see updated averages.'
  );
}

/* ---------- Fieldwork stats (Segment 4) ---------- */

// Flattens every saved session's throws into per-disc distance
// history (each pair-round contributes one entry for discA at its
// tee-to-disc distance, and one for discB), then aggregates that into
// the numbers shown on the Fieldwork stats tab and used to order the
// disc pickers in the setup screen.
function computeFieldWorkDiscStats(sessions) {
  const byDisc = {};

  (sessions || []).forEach(session => {
    const shotType = session.shotType || 'backhand';
    (session.throws || []).forEach(t => {
      [
        { id: t.discA.discId, name: t.discA.discName, dist: t.teeToA },
        { id: t.discB.discId, name: t.discB.discName, dist: t.teeToB }
      ].forEach(entry => {
        if (!byDisc[entry.id]) byDisc[entry.id] = { discId: entry.id, discName: entry.name, distances: [], byShotType: {} };
        byDisc[entry.id].distances.push(entry.dist);
        if (!byDisc[entry.id].byShotType[shotType]) byDisc[entry.id].byShotType[shotType] = [];
        byDisc[entry.id].byShotType[shotType].push(entry.dist);
      });
    });
  });

  return Object.values(byDisc).map(d => {
    const distances = d.distances;
    const avg = distances.reduce((s, v) => s + v, 0) / distances.length;
    const byShotType = {};
    Object.keys(d.byShotType).forEach(st => {
      const arr = d.byShotType[st];
      byShotType[st] = { count: arr.length, avg: arr.reduce((s, v) => s + v, 0) / arr.length };
    });
    return {
      discId: d.discId,
      discName: d.discName,
      timesThrown: distances.length,
      avgDistance: avg,
      bestDistance: Math.max(...distances),
      shortestDistance: Math.min(...distances),
      byShotType
    };
  }).sort((a, b) => b.timesThrown - a.timesThrown);
}

function capitalizeWord(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function renderFieldworkStatsTab() {
  const db = await openDiscTallyDB();
  const sessions = await getAllFieldSessions(db);

  const container = document.getElementById('stats-modal-content');
  const clearBtn = document.getElementById('clear-all-stats-btn');
  const deleteBtn = document.getElementById('delete-selected-rounds-btn');
  // No per-session selection UI on this aggregate view.
  if (deleteBtn) deleteBtn.classList.add('hide');

  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<p>No Field Work sessions recorded yet. Finish a Field Work session to see stats here.</p>';
    if (clearBtn) clearBtn.classList.add('hide');
    return;
  }
  if (clearBtn) clearBtn.classList.remove('hide');

  const discStats = computeFieldWorkDiscStats(sessions);
  const totalThrows = discStats.reduce((s, d) => s + d.timesThrown, 0);

  let html = '<div class="stats-overall-block"><h5>Overall</h5>' +
    '<div class="stats-round-row"><span>Sessions</span><span>' + sessions.length + '</span></div>' +
    '<div class="stats-round-row"><span>Discs Thrown</span><span>' + discStats.length + '</span></div>' +
    '<div class="stats-round-row"><span>Total Throws</span><span>' + totalThrows + '</span></div>' +
    '</div>';

  html += '<p style="text-align:center;"><a href="#" id="fw-history-link">View Fieldwork History &rarr;</a></p>';

  discStats.forEach(d => {
    html += '<div class="stats-overall-block"><h5>' + d.discName + '</h5>' +
      '<div class="stats-round-row"><span>Throws</span><span>' + d.timesThrown + '</span></div>' +
      '<div class="stats-round-row"><span>Average Distance</span><span>' + Math.round(d.avgDistance) + ' ft</span></div>' +
      '<div class="stats-round-row"><span>Best Distance</span><span>' + Math.round(d.bestDistance) + ' ft</span></div>' +
      '<div class="stats-round-row"><span>Shortest Distance</span><span>' + Math.round(d.shortestDistance) + ' ft</span></div>';
    Object.keys(d.byShotType).forEach(st => {
      const s = d.byShotType[st];
      html += '<div class="stats-round-row"><span>' + capitalizeWord(st) + ' Avg (' + s.count + ')</span><span>' + Math.round(s.avg) + ' ft</span></div>';
    });
    html += '</div>';
  });

  container.innerHTML = html;

  document.getElementById('fw-history-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    openFieldWorkHistoryModal(sessions);
  });
}

async function clearAllFieldWorkStats() {
  const db = await openDiscTallyDB();
  await clearAllFieldSessions(db);
  await renderStatsTabs();
}

/* ---------- Fieldwork history (map view instead of stored images) ---------- */

let fieldWorkHistoryMap = null;
let fieldWorkHistorySessions = []; // currently-displayed, date-sorted list, for index lookup on row click

function openFieldWorkHistoryModal(sessions) {
  fieldWorkHistorySessions = (sessions || []).slice().sort((a, b) => (b.date || 0) - (a.date || 0));

  const listEl = document.getElementById('fw-history-list');
  if (fieldWorkHistorySessions.length === 0) {
    listEl.innerHTML = '<p>No sessions recorded yet.</p>';
  } else {
    listEl.innerHTML = fieldWorkHistorySessions.map((s, i) => {
      const dateStr = new Date(s.date || Date.now()).toLocaleDateString();
      const throwCount = (s.throws || []).length;
      return '<div class="stats-round-row fw-history-row" data-index="' + i + '">' +
        '<span>' + dateStr + ' &middot; ' + (s.fieldName || 'Field') + '</span>' +
        '<span>' + throwCount + ' throw(s)</span></div>';
    }).join('');
  }

  document.getElementById('field-work-history-modal').classList.add('active');

  listEl.querySelectorAll('.fw-history-row').forEach(row => {
    row.addEventListener('click', () => {
      const session = fieldWorkHistorySessions[Number(row.dataset.index)];
      document.getElementById('field-work-history-modal').classList.remove('active');
      openFieldWorkHistorySessionMap(session);
    });
  });
}

// Renders a session's tee + every marked disc position on a live map,
// instead of a stored snapshot image — cheap to keep (a handful of
// coordinates per session vs. an actual image file) and stays fully
// zoomable/interactive.
function openFieldWorkHistorySessionMap(session) {
  document.getElementById('field-work-history-map-modal').classList.add('active');

  if (!fieldWorkHistoryMap && typeof L !== 'undefined') {
    fieldWorkHistoryMap = L.map('field-work-history-map', { zoomAnimation: false, fadeAnimation: false, zoomSnap: 0.25, zoomDelta: 0.5, maxZoom: 22 });
    L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }).addTo(fieldWorkHistoryMap);

    document.querySelectorAll('#field-work-history-map-modal .map-popup-btn, #field-work-history-map-modal .map-popup-overlay-bar')
      .forEach(el => {
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
      });
  } else if (fieldWorkHistoryMap) {
    fieldWorkHistoryMap.eachLayer(layer => {
      if (layer instanceof L.Marker) fieldWorkHistoryMap.removeLayer(layer);
    });
  }

  renderWeatherWidget(document.getElementById('fw-history-map-weather'), session.weather);

  setTimeout(() => fieldWorkHistoryMap.invalidateSize(), 50);

  const bounds = [];

  if (session.tee) {
    const scale = scaleForZoom(fieldWorkHistoryMap);
    L.marker([session.tee.lat, session.tee.lng], { icon: makeTeeDivIcon(session.tee.rotation || 0, scale) }).addTo(fieldWorkHistoryMap);
    bounds.push([session.tee.lat, session.tee.lng]);
  }

  (session.throws || []).forEach(t => {
    [t.discA, t.discB].forEach(d => {
      if (d && typeof d.lat === 'number' && typeof d.lng === 'number') {
        L.marker([d.lat, d.lng], { icon: makeThrowMarkerIcon(d.color) }).addTo(fieldWorkHistoryMap);
        bounds.push([d.lat, d.lng]);
      }
    });
  });

  if (bounds.length > 1) {
    fieldWorkHistoryMap.fitBounds(bounds, { padding: [30, 30] });
  } else if (bounds.length === 1) {
    fieldWorkHistoryMap.setView(bounds[0], 19);
  }
}

function closeFieldWorkHistoryMap() {
  document.getElementById('field-work-history-map-modal').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('field-work-use-existing-btn')?.addEventListener('click', handleUseExistingFieldClick);
  document.getElementById('field-work-create-new-btn')?.addEventListener('click', handleCreateNewFieldClick);
  document.getElementById('field-work-choice-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('field-work-choice-modal').classList.remove('active');
  });

  document.getElementById('field-select-go-btn')?.addEventListener('click', handleFieldSelectGo);
  document.getElementById('field-select-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('field-select-modal').classList.remove('active');
  });

  document.getElementById('new-field-search-btn')?.addEventListener('click', handleNewFieldSearch);
  document.getElementById('new-field-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('new-field-info-modal').classList.remove('active');
  });
  document.getElementById('new-field-street-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleNewFieldSearch();
  });
  document.getElementById('new-field-city-state-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleNewFieldSearch();
  });

  document.getElementById('field-tee-placement-confirm-btn')?.addEventListener('click', handleFieldTeePlacementConfirm);
  document.getElementById('field-tee-placement-cancel-btn')?.addEventListener('click', handleFieldTeePlacementCancel);
  document.getElementById('field-tee-placement-rotation')?.addEventListener('input', handleFieldTeeRotationInput);

  document.getElementById('fw-disc-count-select')?.addEventListener('change', (e) => {
    rebuildFieldWorkDiscSlots(Number(e.target.value));
  });
  document.getElementById('fw-setup-back-btn')?.addEventListener('click', handleFieldWorkSetupBack);
  document.getElementById('fw-setup-next-btn')?.addEventListener('click', handleFieldWorkSetupNext);

  document.getElementById('fw-map-back-btn')?.addEventListener('click', handleFieldWorkMapBack);
  document.getElementById('fw-map-finish-btn')?.addEventListener('click', handleFieldWorkFinish);
  document.getElementById('fw-map-mark-btn')?.addEventListener('click', handleFieldWorkMark);
  document.getElementById('fw-map-save-btn')?.addEventListener('click', handleFieldWorkSave);
  document.getElementById('fw-arrow-rotation')?.addEventListener('input', handleFieldWorkArrowRotationInput);
  document.getElementById('fw-distance-override-input')?.addEventListener('input', handleFieldWorkDistanceOverrideInput);

  document.getElementById('fw-history-close-btn')?.addEventListener('click', () => {
    document.getElementById('field-work-history-modal').classList.remove('active');
  });
  document.getElementById('fw-history-map-close-btn')?.addEventListener('click', closeFieldWorkHistoryMap);
});
