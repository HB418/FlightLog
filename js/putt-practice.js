/* js/putt-practice.js
   Putt practice mode: pick a course, pick a hole with a saved basket
   location, then a full-screen top-down view of just that basket with
   the standard PDGA Circle 1 (10m) and Circle 2 (20m) rings drawn as
   true geodesic circles (L.circle uses real-world meters, not pixels,
   so these stay accurate at any zoom/latitude). Practice only — never
   shown during an actual round. */

let puttPracticeMap = null;
let puttPracticeMapLocationTracker = null;

function openPuttPracticeHolePicker(course) {
  const holes = (course.holes || []).filter(h => h.basket);
  const listEl = document.getElementById('putt-practice-hole-list');
  listEl.innerHTML = '';

  if (holes.length === 0) {
    listEl.innerHTML = '<p style="padding:0.5rem;">This course has no holes with a saved basket location yet.</p>';
    document.getElementById('putt-practice-hole-modal').classList.add('active');
    return;
  }

  holes.forEach(h => {
    const item = document.createElement('div');
    item.className = 'course-list-item';
    item.textContent = 'Hole ' + h.number + (h.par ? (' (Par ' + h.par + ')') : '');
    item.addEventListener('click', () => {
      document.getElementById('putt-practice-hole-modal').classList.remove('active');
      openPuttPracticeView(course, h);
    });
    listEl.appendChild(item);
  });

  document.getElementById('putt-practice-hole-modal').classList.add('active');
}

function openPuttPracticeView(course, hole) {
  document.getElementById('putt-practice-hole-label').textContent =
    'Putt Practice — ' + (course.name || 'Course') + ', Hole ' + hole.number;
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

  const center = [hole.basket.lat, hole.basket.lng];

  setTimeout(() => {
    puttPracticeMap.invalidateSize();
    puttPracticeMap.setView(center, 21);

    // Circle 1 — inside 10m is a "putt" for score-keeping purposes.
    L.circle(center, {
      radius: 10,
      color: '#FF2D95',
      weight: 3,
      fill: false
    }).addTo(puttPracticeMap);

    // Circle 2 — the 10m-20m band.
    L.circle(center, {
      radius: 20,
      color: '#FFD400',
      weight: 3,
      fill: false
    }).addTo(puttPracticeMap);

    // The basket itself, for reference — same icon as everywhere else,
    // fixed size since this view is always at one tight zoom level.
    L.marker(center, { icon: makeBasketIcon(1.5, false) }).addTo(puttPracticeMap);
  }, 50);
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('putt-practice-hole-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('putt-practice-hole-modal').classList.remove('active');
  });

  document.getElementById('putt-practice-close-btn')?.addEventListener('click', () => {
    document.getElementById('putt-practice-screen').classList.remove('active');
    if (puttPracticeMap) {
      stopLiveLocationTracking(puttPracticeMapLocationTracker);
      puttPracticeMapLocationTracker = null;
      puttPracticeMap.remove();
      puttPracticeMap = null;
    }
  });
});
