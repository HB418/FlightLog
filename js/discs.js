/* js/discs.js
   Adding discs to the user's collection — search the DiscIt API
   (discit-api.fly.dev, free/public, no API key) by brand+model, show
   the found disc's image and flight numbers for confirmation, or offer
   manual entry if nothing matches. Manually-entered discs use the same
   field shape as API results so both look identical in the collection
   list later. */

const DISCIT_API_BASE = 'https://discit-api.fly.dev/disc';

let discSearchResults = [];   // last search's results, so picking one from the list works
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
});
