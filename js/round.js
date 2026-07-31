/* js/round.js
   Starting, scoring, and finishing a round; the scorecard UI; the round
   map (small header map + enlarged view); stats; adding a player. */

let currentRound = null;      // { courseId, courseName, holes, players: [{name, scores:{hole:strokes}}] }
let headerMap = null;
let headerMapLines = [];      // [{holeNumber, polyline}] — so the current hole's line can be colored red
let mapZoomMapLines = [];
let mapZoomMap = null;

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
  // Wrapped in try/catch: a bug in the map/overlay code should never be
  // able to prevent the scorecard itself from rendering.
  if (hasCourseMap) {
    try {
      showHeaderMap();
    } catch (err) {
      console.error('showHeaderMap failed, continuing without the map:', err);
    }
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
  }
  headerMapIcons = [];
  headerMapLines = [];
  if (mapZoomMap) {
    mapZoomMap.remove();
    mapZoomMap = null;
  }
  mapZoomMapIcons = [];
  mapZoomMapLines = [];
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
  updateCurrentHoleStyling(headerMap, headerMapIcons, headerMapLines, hole.number);
}

function renderCourseOverlay(map, holes, registry, lineRegistry) {
  const bounds = [];
  const scale = scaleForZoom(map);
  holes.forEach(h => {
    if (h.tee) {
      const m = L.marker([h.tee.lat, h.tee.lng], { icon: makeTeeDivIcon(h.tee.rotation || 0, scale, false) }).addTo(map);
      m._rotationDeg = h.tee.rotation || 0;
      if (registry) registry.push({ marker: m, kind: 'tee', holeNumber: h.number, isCurrent: false });
      updateMarkerHoleLabel(m, [h.number], { draggable: false, baseOffset: h.tee.labelOffset });
      bounds.push([h.tee.lat, h.tee.lng]);
    }
    if (h.basket) {
      const m = L.marker([h.basket.lat, h.basket.lng], { icon: makeBasketIcon(scale, false) }).addTo(map);
      if (registry) registry.push({ marker: m, kind: 'basket', holeNumber: h.number, isCurrent: false });
      updateMarkerHoleLabel(m, [h.number], { draggable: false, baseOffset: h.basket.labelOffset });
      bounds.push([h.basket.lat, h.basket.lng]);
    }

    if (h.tee && h.basket) {
      const pts = [[h.tee.lat, h.tee.lng]];
      (h.waypoints || []).forEach(w => pts.push([w.lat, w.lng]));
      pts.push([h.basket.lat, h.basket.lng]);
      const pl = L.polyline(pts, { color: '#FFD400', weight: 2, opacity: 0.85 }).addTo(map);
      if (lineRegistry) lineRegistry.push({ holeNumber: h.number, polyline: pl });
    }
  });
  return bounds;
}

// Swaps the current hole to its "active" look (yellow tee pad, pink
// basket, pink connecting line) and every other hole back to its default
// look (pink tee pad, yellow basket, yellow connecting line) — both the
// icon registry (for re-icon via setIcon) and the line registry.
function updateCurrentHoleStyling(map, iconRegistry, lineRegistry, currentHoleNumber) {
  const scale = scaleForZoom(map);
  iconRegistry.forEach(entry => {
    const isCurrent = entry.holeNumber === currentHoleNumber;
    entry.isCurrent = isCurrent;
    if (entry.kind === 'tee') {
      entry.marker.setIcon(makeTeeDivIcon(entry.marker._rotationDeg || 0, scale, isCurrent));
    } else {
      entry.marker.setIcon(makeBasketIcon(scale, isCurrent));
    }
  });
  lineRegistry.forEach(entry => {
    entry.polyline.setStyle({ color: entry.holeNumber === currentHoleNumber ? '#FF2D95' : '#FFD400' });
  });
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
      zoomSnap: 1,
      zoomDelta: 1,
      maxZoom: 21
    });
    L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 21,
      maxNativeZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }).addTo(headerMap);

    // Compute the current hole BEFORE overlay rendering, so centering
    // below still works even if renderCourseOverlay throws.
    const currentHole = currentRound && currentRound.hasCourseMap ? getCurrentHole(currentRound) : null;
    const holeCenterPoint = getHoleCenter(currentHole);
    const holeCenter = holeCenterPoint ? [holeCenterPoint.lat, holeCenterPoint.lng] : null;

    // Fitting bounds / setting view must happen AFTER the container has
    // actually been laid out (it was just unhidden this same tick), or
    // Leaflet computes against a stale zero-size box and everything
    // ends up positioned wrong — same delayed callback as invalidateSize.
    // The overlay (markers + labels) is ALSO rendered inside this same
    // deferred callback, after setView — positioning a label marker via
    // containerPointToLatLng requires the map to already have a real
    // zoom/center, or it computes garbage coordinates that never render
    // (the tee/basket markers themselves still show, since those use
    // real lat/lng directly — only the labels silently fail).
    setTimeout(() => {
      headerMap.invalidateSize();
      if (holeCenter) {
        headerMap.setView(holeCenter, 18);
      } else {
        headerMap.setView(initialCenter, 16);
      }

      if (currentRound && currentRound.hasCourseMap) {
        try {
          headerMapIcons = [];
          headerMapLines = [];
          renderCourseOverlay(headerMap, currentRound.holes, headerMapIcons, headerMapLines);
          headerMap.on('zoomend', () => rescaleIconMarkers(headerMap, headerMapIcons));
          if (currentHole) updateCurrentHoleStyling(headerMap, headerMapIcons, headerMapLines, currentHole.number);
        } catch (err) {
          console.error('Course overlay rendering failed:', err);
        }
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
    mapZoomMap = L.map('map-zoom-map', {
      zoomAnimation: false,
      fadeAnimation: false,
      zoomControl: true,
      zoomSnap: 1,
      zoomDelta: 1,
      maxZoom: 22
    });
    L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }).addTo(mapZoomMap);
  }

  // Same layout-timing fix as the small map: don't set the view until
  // the container has actually been laid out (it was just unhidden).
  // The overlay is ALSO rendered inside this same deferred callback
  // (only on first creation), after setView — same reason as the small
  // map: positioning a label marker needs the map to already have a
  // real zoom/center, or the label silently fails to render.
  setTimeout(() => {
    mapZoomMap.invalidateSize();
    mapZoomMap.setView(center, zoom);

    if (isNewMap && currentRound && currentRound.hasCourseMap) {
      try {
        mapZoomMapIcons = [];
        mapZoomMapLines = [];
        renderCourseOverlay(mapZoomMap, currentRound.holes, mapZoomMapIcons, mapZoomMapLines);
        mapZoomMap.on('zoomend', () => rescaleIconMarkers(mapZoomMap, mapZoomMapIcons));
        const currentHole = getCurrentHole(currentRound);
        if (currentHole) updateCurrentHoleStyling(mapZoomMap, mapZoomMapIcons, mapZoomMapLines, currentHole.number);
      } catch (err) {
        console.error('Enlarged map overlay rendering failed:', err);
      }
    }
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
