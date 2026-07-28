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
let pendingCourseLocationConfirmed = false;
let courseLocationMap = null;
let courseLocationMapMarker = null;

// Tee pad marker icon — a real illustrated asset (img/tee-pad.png), not a
// pin, so it's anchored at its own center rather than a bottom point.
// Native art is 242x481px; displayed small on the map.
const TEE_PAD_ICON = (typeof L !== 'undefined') ? L.icon({
  iconUrl: 'img/tee-pad.png',
  iconSize: [22, 44],
  iconAnchor: [11, 22]
}) : null;

// Basket marker icon — anchored at the bottom-center of the pole, since
// this marker should point at one exact ground spot (unlike the tee pad,
// which represents an area and is anchored at its own center).
const BASKET_ICON = (typeof L !== 'undefined') ? L.icon({
  iconUrl: 'img/basket.png',
  iconSize: [28, 40],
  iconAnchor: [14, 40]
}) : null;


document.addEventListener('DOMContentLoaded', function () {
  loadCourseOptions();

  document.getElementById('select-course-btn')?.addEventListener('click', async () => {
    const select = document.getElementById('course-select');
    if (!select || !select.value) { showSelectCourseEmptyModal(); return; }
    const db = await openDiscTallyDB();
    const course = await getCourseById(db, Number(select.value));
    if (!course) { showGenericModal('Course not found.'); return; }
    startRound(course);
  });

  document.getElementById('delete-course-btn')?.addEventListener('click', async () => {
    const select = document.getElementById('course-select');
    if (!select || !select.value) { showSelectCourseEmptyModal(); return; }
    const db = await openDiscTallyDB();
    await deleteCourse(db, Number(select.value));
    await loadCourseOptions();
  });

  document.getElementById('new-course-btn')?.addEventListener('click', openNewCourseModal);
  document.getElementById('cancel-new-course-btn')?.addEventListener('click', closeNewCourseModal);
  document.getElementById('generate-hole-fields-btn')?.addEventListener('click', generateHoleFields);
  document.getElementById('save-new-course-btn')?.addEventListener('click', saveNewCourse);

  document.getElementById('find-course-location-btn')?.addEventListener('click', openEnterLocationModal);
  document.getElementById('cancel-course-address-btn')?.addEventListener('click', () => {
    document.getElementById('enter-location-modal').classList.remove('active');
    document.getElementById('new-course-modal').classList.add('active');
  });
  document.getElementById('search-course-address-btn')?.addEventListener('click', handleCourseAddressSearch);
  document.getElementById('course-location-yes-btn')?.addEventListener('click', () => {
    pendingCourseLocationConfirmed = true;
    document.getElementById('course-location-modal').classList.remove('active');
    document.getElementById('new-course-modal').classList.add('active');
    const statusEl = document.getElementById('course-location-status');
    if (statusEl) statusEl.textContent = 'Location confirmed for this course.';
  });
  document.getElementById('course-location-no-btn')?.addEventListener('click', () => {
    pendingCourseLat = null;
    pendingCourseLng = null;
    pendingCourseLocationConfirmed = false;
    document.getElementById('course-location-modal').classList.remove('active');
    document.getElementById('new-course-modal').classList.add('active');
    const statusEl = document.getElementById('course-location-status');
    if (statusEl) statusEl.textContent = 'No location saved. Try a more specific course name and search again.';
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

/* ---------- New Course modal ---------- */

function openNewCourseModal() {
  document.getElementById('new-course-name').value = '';
  document.getElementById('new-course-hole-count').value = 18;
  document.getElementById('new-course-holes-container').innerHTML = '';
  document.getElementById('course-location-status').textContent = '';
  document.getElementById('course-address-input').value = '';
  pendingCourseLat = null;
  pendingCourseLng = null;
  pendingCourseLocationConfirmed = false;
  document.getElementById('new-course-modal').classList.add('active');
}

function closeNewCourseModal() {
  document.getElementById('new-course-modal').classList.remove('active');
}

function openEnterLocationModal() {
  document.getElementById('new-course-modal').classList.remove('active');
  document.getElementById('enter-location-modal').classList.add('active');
  const addressInput = document.getElementById('course-address-input');
  const statusEl = document.getElementById('enter-location-status');
  if (statusEl) statusEl.textContent = '';
  if (addressInput) addressInput.focus();
}

async function handleCourseAddressSearch() {
  const addressInput = document.getElementById('course-address-input');
  const nameInput = document.getElementById('new-course-name');
  const statusEl = document.getElementById('enter-location-status');

  const address = addressInput.value.trim();
  const courseName = nameInput.value.trim();
  const query = address || courseName;

  if (!query) {
    if (statusEl) statusEl.textContent = 'Enter an address, or a course name, to search.';
    return;
  }

  if (statusEl) statusEl.textContent = 'Searching...';

  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const results = await res.json();
    if (!results || results.length === 0) {
      if (statusEl) statusEl.textContent = 'Nothing found for that. Try a fuller address or a nearby town/park name.';
      return;
    }
    const lat = Number(results[0].lat);
    const lng = Number(results[0].lon);
    if (statusEl) statusEl.textContent = '';
    document.getElementById('enter-location-modal').classList.remove('active');
    showCourseLocationConfirm(courseName || query, lat, lng, results[0].display_name);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Search failed — check your connection and try again.';
  }
}

function showCourseLocationConfirm(name, lat, lng, displayName) {
  pendingCourseLat = lat;
  pendingCourseLng = lng;
  pendingCourseLocationConfirmed = false;

  document.getElementById('course-location-message').textContent =
    'Is this the location for "' + name + '"?' + (displayName ? (' (' + displayName + ')') : '');

  document.getElementById('new-course-modal').classList.remove('active');
  document.getElementById('course-location-modal').classList.add('active');

  setTimeout(() => {
    if (!courseLocationMap && typeof L !== 'undefined') {
      courseLocationMap = L.map('course-location-map', { zoomAnimation: false, fadeAnimation: false });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri',
        detectRetina: true
      }).addTo(courseLocationMap);
    }
    if (courseLocationMap) {
      courseLocationMap.setView([lat, lng], 16);
      if (!courseLocationMapMarker) {
        courseLocationMapMarker = L.marker([lat, lng]).addTo(courseLocationMap);
      } else {
        courseLocationMapMarker.setLatLng([lat, lng]);
      }
      courseLocationMap.invalidateSize();
    }
  }, 50);
}

function generateHoleFields() {
  const count = Math.max(1, Math.min(36, Number(document.getElementById('new-course-hole-count').value) || 18));
  const container = document.getElementById('new-course-holes-container');
  container.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const row = document.createElement('div');
    row.className = 'new-course-hole-row';
    row.innerHTML =
      '<span>Hole ' + i + '</span>' +
      '<input type="number" min="1" placeholder="Length (ft)" data-hole="' + i + '" data-field="length"/>' +
      '<input type="number" min="1" placeholder="Par" data-hole="' + i + '" data-field="par" value="3"/>';
    container.appendChild(row);
  }
}

async function saveNewCourse() {
  const name = document.getElementById('new-course-name').value.trim();
  const container = document.getElementById('new-course-holes-container');
  const rows = container.querySelectorAll('.new-course-hole-row');

  if (!name) { showGenericModal('Please enter a course name.'); return; }
  if (rows.length === 0) { showGenericModal('Click "Set Up Holes" first.'); return; }

  const holes = [];
  for (let i = 0; i < rows.length; i++) {
    const lengthInput = rows[i].querySelector('[data-field="length"]');
    const parInput = rows[i].querySelector('[data-field="par"]');
    holes.push({
      number: i + 1,
      length: Number(lengthInput.value) || 0,
      par: Number(parInput.value) || 3
    });
  }

  const db = await openDiscTallyDB();
  const courseRecord = { name, holes };
  if (pendingCourseLocationConfirmed && pendingCourseLat != null && pendingCourseLng != null) {
    courseRecord.lat = pendingCourseLat;
    courseRecord.lng = pendingCourseLng;
  }
  await addCourse(db, courseRecord);
  pendingCourseLat = null;
  pendingCourseLng = null;
  pendingCourseLocationConfirmed = false;
  closeNewCourseModal();
  await loadCourseOptions();
}

/* ---------- Round / scorecard ---------- */

function startRound(course) {
  const playerName = localStorage.getItem('userName') || 'Player 1';
  currentRound = {
    courseId: course.id,
    courseName: course.name,
    holes: course.holes || [],
    courseLat: course.lat != null ? course.lat : null,
    courseLng: course.lng != null ? course.lng : null,
    players: [
      { name: playerName, scores: {} }
    ]
  };

  document.getElementById('controls-section').classList.add('hide');
  document.getElementById('course-actions-section').classList.add('hide');
  document.getElementById('stats-section').classList.add('hide');
  document.getElementById('scorecard-card').classList.remove('hide');

  showHeaderMap();
  buildScorecard(currentRound);
}

function exitRound() {
  currentRound = null;
  document.getElementById('scorecard-card').classList.add('hide');
  document.getElementById('controls-section').classList.remove('hide');
  document.getElementById('course-actions-section').classList.remove('hide');
  hideHeaderMap();
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
      zoomControl: false,
      attributionControl: true,
      zoomAnimation: false,
      fadeAnimation: false,
      doubleClickZoom: false
    });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
      detectRetina: true
    }).addTo(headerMap);
    headerMap.setView(initialCenter, 16);
  } else if (headerMap) {
    headerMap.setView(initialCenter, 16);
  }

  if (headerMap) {
    setTimeout(() => headerMap.invalidateSize(), 50);
  }

  if (headerMap && navigator.geolocation) {
    if (headerMapWatchId != null) navigator.geolocation.clearWatch(headerMapWatchId);
    headerMapWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude];
        headerMap.setView(latlng, 17);
        if (!headerMapMarker) {
          headerMapMarker = L.marker(latlng).addTo(headerMap);
        } else {
          headerMapMarker.setLatLng(latlng);
        }
      },
      () => { /* location unavailable; map stays at default view */ },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
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

  if (!mapZoomMap) {
    mapZoomMap = L.map('map-zoom-map', { zoomAnimation: false, fadeAnimation: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
      detectRetina: true
    }).addTo(mapZoomMap);
  }

  mapZoomMap.setView(center, zoom);

  if (headerMapMarker) {
    const markerLatLng = headerMapMarker.getLatLng();
    if (!mapZoomMarker) {
      mapZoomMarker = L.marker(markerLatLng).addTo(mapZoomMap);
    } else {
      mapZoomMarker.setLatLng(markerLatLng);
    }
  }

  setTimeout(() => mapZoomMap.invalidateSize(), 50);
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
