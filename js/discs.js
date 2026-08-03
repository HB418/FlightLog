/* js/discs.js
   Adding discs to the user's collection — search the DiscIt API
   (discit-api.fly.dev, free/public, no API key) by brand+model, show
   the found disc's image and flight numbers for confirmation, or offer
   manual entry if nothing matches. Manually-entered discs use the same
   field shape as API results so both look identical in the collection
   list later. */

const DISCIT_API_BASE = 'https://discit-api.fly.dev/disc';

let discSearchResults = [];   // last search's results, so picking one from the list works
let discSelectionMode = false; // true while picking discs to remove (Remove button was pressed)
let selectedDiscIds = new Set();
let selectedFoundDisc = null; // the disc currently shown in the confirm-add modal

function openAddDiscSearchModal() {
  document.getElementById('add-disc-brand-input').value = '';
  document.getElementById('add-disc-name-input').value = '';
  document.getElementById('add-disc-search-status').textContent = '';
  document.getElementById('add-disc-search-modal').classList.add('active');
}

async function searchForDisc() {
  const brand = document.getElementById('add-disc-brand-input').value.trim();
  const name = document.getElementById('add-disc-name-input').value.trim();
  const statusEl = document.getElementById('add-disc-search-status');

  if (!name) {
    statusEl.textContent = 'Please enter a disc model/name.';
    return;
  }
  statusEl.textContent = 'Searching...';

  const params = new URLSearchParams();
  params.set('name', name);
  if (brand) params.set('brand', brand);

  let results = [];
  try {
    const resp = await fetch(DISCIT_API_BASE + '?' + params.toString());
    if (resp.ok) {
      results = await resp.json();
    }
  } catch (err) {
    console.error('Disc search failed:', err);
  }

  document.getElementById('add-disc-search-modal').classList.remove('active');

  if (!Array.isArray(results) || results.length === 0) {
    document.getElementById('add-disc-not-found-modal').classList.add('active');
    return;
  }

  if (results.length === 1) {
    showAddDiscConfirm(results[0]);
    return;
  }

  discSearchResults = results;
  renderDiscResultsList(results);
  document.getElementById('add-disc-results-modal').classList.add('active');
}

function renderDiscResultsList(results) {
  const listEl = document.getElementById('add-disc-results-list');
  listEl.innerHTML = '';
  results.forEach((disc, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:0.75rem;padding:0.5rem;cursor:pointer;border-bottom:1px solid #ccc;';
    row.innerHTML =
      (disc.pic ? '<img src="' + disc.pic + '" alt="" class="no-paper-img-border" style="width:50px;height:50px;object-fit:contain;"/>' : '') +
      '<div><strong>' + (disc.name || 'Unknown') + '</strong><br/><span style="font-size:0.85rem;opacity:0.75;">' + (disc.brand || '') + (disc.category ? ' \u00b7 ' + disc.category : '') + '</span></div>';
    row.addEventListener('click', () => {
      document.getElementById('add-disc-results-modal').classList.remove('active');
      showAddDiscConfirm(disc);
    });
    listEl.appendChild(row);
  });
}

function showAddDiscConfirm(disc) {
  selectedFoundDisc = disc;
  const img = document.getElementById('add-disc-confirm-img');
  if (disc.pic) {
    img.src = disc.pic;
    img.classList.remove('hide');
    img.style.cursor = 'pointer';
    img.onclick = () => openImageLightbox(disc.pic);
  } else {
    img.classList.add('hide');
    img.onclick = null;
  }
  const details = document.getElementById('add-disc-confirm-details');
  details.innerHTML =
    '<strong>' + (disc.name || 'Unknown') + '</strong><br/>' +
    (disc.brand || '') + (disc.category ? ' \u00b7 ' + disc.category : '') + '<br/>' +
    'Speed ' + disc.speed + ' \u00b7 Glide ' + disc.glide + ' \u00b7 Turn ' + disc.turn + ' \u00b7 Fade ' + disc.fade +
    (disc.stability ? '<br/>' + disc.stability : '');
  document.getElementById('add-disc-confirm-modal').classList.add('active');
}

function openImageLightbox(src) {
  document.getElementById('image-lightbox-img').src = src;
  document.getElementById('image-lightbox-modal').classList.add('active');
}

async function addFoundDiscToCollection() {
  if (!selectedFoundDisc) return;
  const d = selectedFoundDisc;
  const db = await openDiscTallyDB();
  await addDisc(db, {
    name: d.name || '',
    brand: d.brand || '',
    category: d.category || '',
    speed: d.speed,
    glide: d.glide,
    turn: d.turn,
    fade: d.fade,
    stability: d.stability || '',
    pic: d.pic || '',
    manual: false
  });
  selectedFoundDisc = null;
  document.getElementById('add-disc-confirm-modal').classList.remove('active');
}

function openManualDiscForm() {
  document.getElementById('add-disc-not-found-modal').classList.remove('active');
  document.getElementById('manual-disc-name').value = document.getElementById('add-disc-name-input').value;
  document.getElementById('manual-disc-brand').value = document.getElementById('add-disc-brand-input').value;
  document.getElementById('manual-disc-category').value = '';
  document.getElementById('manual-disc-speed').value = '';
  document.getElementById('manual-disc-glide').value = '';
  document.getElementById('manual-disc-turn').value = '';
  document.getElementById('manual-disc-fade').value = '';
  document.getElementById('add-disc-manual-modal').classList.add('active');
}

async function saveManualDisc() {
  const name = document.getElementById('manual-disc-name').value.trim();
  if (!name) { showGenericModal('Please enter a disc name.'); return; }

  const db = await openDiscTallyDB();
  await addDisc(db, {
    name,
    brand: document.getElementById('manual-disc-brand').value.trim(),
    category: document.getElementById('manual-disc-category').value.trim(),
    speed: Number(document.getElementById('manual-disc-speed').value) || null,
    glide: Number(document.getElementById('manual-disc-glide').value) || null,
    turn: Number(document.getElementById('manual-disc-turn').value) || null,
    fade: Number(document.getElementById('manual-disc-fade').value) || null,
    stability: '',
    pic: '',
    manual: true
  });
  document.getElementById('add-disc-manual-modal').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('add-disc-search-btn')?.addEventListener('click', searchForDisc);
  document.getElementById('add-disc-search-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('add-disc-search-modal').classList.remove('active');
  });
  document.getElementById('add-disc-results-back-btn')?.addEventListener('click', () => {
    document.getElementById('add-disc-results-modal').classList.remove('active');
    openAddDiscSearchModal();
  });
  document.getElementById('add-disc-confirm-add-btn')?.addEventListener('click', addFoundDiscToCollection);
  document.getElementById('add-disc-confirm-cancel-btn')?.addEventListener('click', () => {
    selectedFoundDisc = null;
    document.getElementById('add-disc-confirm-modal').classList.remove('active');
  });
  document.getElementById('add-disc-manual-yes-btn')?.addEventListener('click', openManualDiscForm);
  document.getElementById('add-disc-manual-no-btn')?.addEventListener('click', () => {
    document.getElementById('add-disc-not-found-modal').classList.remove('active');
  });
  document.getElementById('manual-disc-save-btn')?.addEventListener('click', saveManualDisc);
  document.getElementById('manual-disc-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('add-disc-manual-modal').classList.remove('active');
  });
  document.getElementById('image-lightbox-close-btn')?.addEventListener('click', () => {
    document.getElementById('image-lightbox-modal').classList.remove('active');
  });
  document.getElementById('discs-list-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('discs-list-modal').classList.remove('active');
  });
  document.getElementById('discs-list-remove-btn')?.addEventListener('click', handleDiscRemoveOrDeleteClick);
});

async function openDiscsListModal() {
  discSelectionMode = false;
  selectedDiscIds.clear();
  const removeBtn = document.getElementById('discs-list-remove-btn');
  if (removeBtn) removeBtn.textContent = 'Remove';
  await loadDiscsList();
  document.getElementById('discs-list-modal').classList.add('active');
}

async function loadDiscsList() {
  const db = await openDiscTallyDB();
  const discs = await getAllDiscs(db);
  const listEl = document.getElementById('discs-list-items');
  if (!listEl) return;

  listEl.innerHTML = '';

  discs.forEach((d) => {
    const tile = document.createElement('div');
    tile.className = 'course-grid-tile';

    const content = document.createElement('div');
    content.className = 'course-grid-tile-content';
    tile.appendChild(content);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'course-grid-tile-select-checkbox' + (discSelectionMode ? '' : ' hide');
    checkbox.checked = selectedDiscIds.has(d.id);
    tile.appendChild(checkbox);

    if (d.pic) {
      const img = document.createElement('img');
      img.className = 'course-grid-tile-logo no-paper-img-border';
      img.src = d.pic;
      img.alt = '';
      img.style.cursor = 'pointer';
      img.addEventListener('click', (e) => {
        e.stopPropagation(); // don't also trigger the tile's delete-confirm click
        openImageLightbox(d.pic);
      });
      content.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'course-grid-tile-logo-placeholder';
      placeholder.textContent = (d.name || '?').charAt(0).toUpperCase();
      content.appendChild(placeholder);
    }

    const infoRow = document.createElement('div');
    infoRow.className = 'course-grid-tile-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'course-grid-tile-name';
    nameEl.textContent = d.name || 'Unnamed Disc';
    infoRow.appendChild(nameEl);

    const brandEl = document.createElement('span');
    brandEl.className = 'course-grid-tile-location';
    brandEl.textContent = (d.brand || '') + (d.category ? ' \u00b7 ' + d.category : '');
    infoRow.appendChild(brandEl);

    const hasFlightNums = [d.speed, d.glide, d.turn, d.fade].some(v => v != null && v !== '');
    if (hasFlightNums) {
      const speedGlideEl = document.createElement('span');
      speedGlideEl.className = 'course-grid-tile-meta';
      speedGlideEl.textContent = 'Speed ' + d.speed + ' \u00b7 Glide ' + d.glide;
      infoRow.appendChild(speedGlideEl);

      const turnFadeEl = document.createElement('span');
      turnFadeEl.className = 'course-grid-tile-meta';
      turnFadeEl.textContent = 'Turn ' + d.turn + ' \u00b7 Fade ' + d.fade;
      infoRow.appendChild(turnFadeEl);
    } else {
      const noneEl = document.createElement('span');
      noneEl.className = 'course-grid-tile-meta';
      noneEl.textContent = 'No flight numbers on file';
      infoRow.appendChild(noneEl);
    }

    if (d.stability) {
      const stabilityEl = document.createElement('span');
      stabilityEl.className = 'course-grid-tile-location';
      stabilityEl.textContent = d.stability;
      infoRow.appendChild(stabilityEl);
    }

    content.appendChild(infoRow);

    tile.addEventListener('click', () => {
      if (discSelectionMode) {
        if (selectedDiscIds.has(d.id)) selectedDiscIds.delete(d.id);
        else selectedDiscIds.add(d.id);
        const cb = tile.querySelector('.course-grid-tile-select-checkbox');
        if (cb) cb.checked = selectedDiscIds.has(d.id);
        return;
      }
      // Browsing only — deletion now goes through Remove/Delete.
    });

    listEl.appendChild(tile);
  });

  // Always show a full list of 10 slots — fill any remaining empty
  // slots with "Disc coming soon" placeholders, same as the Courses
  // list. If there are more than 10 discs, no placeholders are added
  // and the list just grows past 10 as needed.
  const minSlots = 10;
  for (let i = discs.length; i < minSlots; i++) {
    const empty = document.createElement('div');
    empty.className = 'course-grid-tile-empty';
    empty.textContent = 'Disc coming soon';
    listEl.appendChild(empty);
  }
}

function handleDiscRemoveOrDeleteClick() {
  const btn = document.getElementById('discs-list-remove-btn');
  if (!discSelectionMode) {
    discSelectionMode = true;
    btn.textContent = 'Delete';
    showGenericModal('Tap the discs you want to remove, then press Delete.');
    loadDiscsList();
    return;
  }
  if (selectedDiscIds.size === 0) {
    showGenericModal('No discs selected. Tap a disc first, or press Close to cancel.');
    return;
  }
  confirmAndDeleteSelectedDiscs();
}

function resetDiscSelectionMode() {
  discSelectionMode = false;
  selectedDiscIds.clear();
  const btn = document.getElementById('discs-list-remove-btn');
  if (btn) btn.textContent = 'Remove';
}

async function confirmAndDeleteSelectedDiscs() {
  const db = await openDiscTallyDB();
  const allDiscs = await getAllDiscs(db);
  const selected = allDiscs.filter(d => selectedDiscIds.has(d.id));

  let message = 'You are about to permanently remove:\n';
  selected.forEach(d => {
    message += '\u2022 ' + (d.name || 'Unnamed disc') + '\n';
  });
  message += '\nThis cannot be undone.\n\nContinue?';

  showConfirmModal(
    message,
    async () => {
      for (const d of selected) {
        await deleteDisc(db, d.id);
      }
      resetDiscSelectionMode();
      await loadDiscsList();
    },
    () => {
      resetDiscSelectionMode();
      loadDiscsList();
    }
  );
}
