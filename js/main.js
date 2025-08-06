
/**
 * Enable or disable the Select and Delete Course buttons based on selection.
 */

function enableSelectCourse() {
    // Always enable buttons so modal prompt can fire when none selected
    const selectBtn = document.getElementById('select-course-btn');
    const deleteBtn = document.getElementById('delete-course-btn');
    if (selectBtn) selectBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;
}

/* Custom modal logic for PaperCSS */

document.addEventListener('DOMContentLoaded', function() {
  const select = document.getElementById('course-select');
  loadCourseOptions();

  document.getElementById('select-course-btn')?.addEventListener('click', async () => {
    const select = document.getElementById('course-select');
    if (!select || !select.value) { showSelectCourseEmptyModal(); return; }
    const db = await openDiscTallyDB();
    const course = await getCourseById(db, Number(select.value));
    if (!course) { alert('Course not found'); return; }
    document.getElementById('controls-section').classList.add('hide');
    document.getElementById('course-actions-section').classList.add('hide');
    document.getElementById('stats-section').classList.add('hide');
    document.getElementById('scorecard-card').classList.remove('hide');
    buildScorecard(course);
  });

  document.getElementById('save-score-btn')?.addEventListener('click', () => {
    const v = document.getElementById('strokes-input')?.value;
    if (currentBtn && v) currentBtn.textContent = v;
  });
  document.getElementById('cancel-score-btn')?.addEventListener('click', () => {
    document.getElementById('score-form')?.reset();
  });
});

let currentBtn = null;

function openDiscTallyDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('DiscTallyDB');
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains('courses')) db.createObjectStore('courses',{keyPath:'id',autoIncrement:true});
    };
    r.onsuccess = e => res(e.target.result);
    r.onerror = e => rej(e.target.error);
  });
}

function getCourseById(db,id) {
  return new Promise((res,rej) => {
    const tx = db.transaction('courses','readonly');
    const store = tx.objectStore('courses');
    const req = store.get(id);
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

async function loadCourseOptions() {
  const db = await openDiscTallyDB();
  const store = db.transaction('courses','readonly').objectStore('courses');
  store.getAll().onsuccess = e => {
    const sel = document.getElementById('course-select');
    e.target.result.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.name||`Course ${c.id}`;
      sel.append(o);
    });
    };
}

function buildScorecard(course) {
  const cont = document.getElementById('scorecard-container');
  cont.innerHTML=''; const holes=course.holes||[],n=holes.length;
  const t=document.createElement('table');t.className='highlight';
  const th=t.createTHead().insertRow();
  th.insertCell().textContent='Player Name';
  for(let i=1;i<=n;i++) th.appendChild(document.createElement('th')).textContent=i;
  const tb=t.createTBody();
  for(let p=1;p<=4;p++){ const r=tb.insertRow(),c=r.insertCell();
    c.textContent=p===1?(course.playerName||'Player 1'):'';
    for(let h=1;h<=n;h++){ const cell=r.insertCell(),btn=document.createElement('button');
      btn.className='score-btn modal-trigger'; btn.dataset.target='score-modal';
      btn.dataset.hole=h; btn.dataset.player=p; btn.textContent='-';
      btn.addEventListener('click',()=>currentBtn=btn);
      cell.append(btn);
    }
  }
  const tf=t.createTFoot().insertRow();
  tf.insertCell().textContent='Hole Length/Par';
  holes.forEach(h=>tf.appendChild(document.createElement('td')).textContent=`${h.length}ft / ${h.par}`);
  cont.append(t);
}


// Checkbox grouping for deselectable radio-style inputs
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('#score-modal input[type="checkbox"][data-group]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var group = this.dataset.group;
      if (this.checked) {
        // uncheck others in group
        document.querySelectorAll('#score-modal input[type="checkbox"][data-group="' + group + '"]').forEach(function(other) {
          if (other !== cb) {
            other.checked = false;
          }
        });
      }
    });
  });
});


// Handle delete-course-btn click
document.getElementById('delete-course-btn')?.addEventListener('click', async () => {
    const select = document.getElementById('course-select');
    if (!select || !select.value) { showSelectCourseEmptyModal(); return; }
    const db = await openDiscTallyDB();
    const tx = db.transaction('courses', 'readwrite');
    tx.objectStore('courses').delete(Number(select.value));
    tx.oncomplete = () => { loadCourseOptions(); enableSelectCourse(); };
});
