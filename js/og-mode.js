/* js/og-mode.js
   "OG" mode — playing the original, informal way: no course, no map,
   just picking a target (that tree in 3, the hoop in 4) and playing
   holes one at a time. Only the current hole is shown; par is chosen
   per-hole from a dropdown (up to 8) instead of coming from a saved
   course. Survives an accidental close the same way a normal round
   does, via its own separate saved-progress slot. */

let currentOGRound = null; // { players: [{name, scores:{}}], holes: [{par}], currentHoleIndex }

function saveOGRound() {
  if (!currentOGRound) return;
  try {
    localStorage.setItem('ogInProgressRound', JSON.stringify(currentOGRound));
  } catch (err) {
    console.error('Failed to save in-progress OG round:', err);
  }
}

function loadOGRoundFromStorage() {
  const raw = localStorage.getItem('ogInProgressRound');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse saved OG round:', err);
    return null;
  }
}

function clearOGRound() {
  localStorage.removeItem('ogInProgressRound');
}

function startOGRound() {
  const playerName = localStorage.getItem('userName') || 'Player 1';
  currentOGRound = {
    players: [{ name: playerName, scores: {} }],
    holes: [{ par: 3 }],
    currentHoleIndex: 0
  };
  saveOGRound();
  showOGModeScreen();
}

function resumeOGRound() {
  const saved = loadOGRoundFromStorage();
  if (!saved) return;
  currentOGRound = saved;
  showOGModeScreen();
}

function showOGModeScreen() {
  document.getElementById('controls-section').classList.add('hide');
  document.getElementById('course-actions-section').classList.add('hide');
  document.getElementById('stats-section').classList.add('hide');
  document.getElementById('scorecard-card').classList.add('hide');
  document.getElementById('og-mode-card').classList.remove('hide');
  renderOGMode();
}

function computeOGRunningPar() {
  return currentOGRound.holes
    .slice(0, currentOGRound.currentHoleIndex + 1)
    .reduce((sum, h) => sum + (Number(h.par) || 0), 0);
}

function renderOGMode() {
  const round = currentOGRound;
  const holeIndex = round.currentHoleIndex;
  const hole = round.holes[holeIndex];
  const container = document.getElementById('og-mode-container');

  let html = '<h4 style="text-align:center;margin:0 0 0.75rem;">Hole ' + (holeIndex + 1) + '</h4>';

  // Current-hole entry: Par + its dropdown on the left, Add Player on
  // the right — all three the same compact size. One uniform row per
  // player below with their score dropdown, same fixed-width label
  // column as the history grid below so everything lines up.
  html += '<div class="og-row og-row-header">';
  html += '<span class="og-label">Par</span>';
  html += '<select id="og-par-select" class="og-compact-control">';
  for (let p = 2; p <= 8; p++) {
    html += '<option value="' + p + '"' + (Number(hole.par) === p ? ' selected' : '') + '>' + p + '</option>';
  }
  html += '</select>';
  html += '<button type="button" id="og-add-player-btn" class="paper-btn og-compact-control">Add Player</button>';
  html += '</div>';

  round.players.forEach((player, idx) => {
    const score = player.scores[holeIndex];
    html += '<div class="og-row og-row-entry">';
    html += '<span class="og-label">' + player.name + '</span>';
    html += '<select data-player-idx="' + idx + '" class="og-score-select og-compact-control og-push-right"><option value="">-</option>';
    for (let s = 1; s <= 15; s++) {
      html += '<option value="' + s + '"' + (score === s ? ' selected' : '') + '>' + s + '</option>';
    }
    html += '</select></div>';
  });

  html += '<hr class="og-divider"/>';

  // Read-only history: a real grid so every row's numbers start at the
  // exact same x position, regardless of label length ("Total Par" vs
  // "Joe") — not just visually spaced apart.
  html += '<div class="og-history">';
  html += '<div class="og-history-row"><span class="og-label">Total Par</span><span class="og-history-nums">';
  for (let h = 0; h <= holeIndex; h++) {
    html += '<span>' + round.holes[h].par + '</span>';
  }
  html += '</span><span class="og-history-total">' + computeOGRunningPar() + '</span></div>';

  round.players.forEach(player => {
    html += '<div class="og-history-row"><span class="og-label">' + player.name + '</span><span class="og-history-nums">';
    for (let h = 0; h <= holeIndex; h++) {
      const s = player.scores[h];
      html += '<span>' + (s != null ? s : '-') + '</span>';
    }
    html += '</span><span class="og-history-total">' + computePlayerTotal(player) + '</span></div>';
  });
  html += '</div>';

  html += '<hr class="og-divider"/>';

  container.innerHTML = html;

  document.getElementById('og-par-select').addEventListener('change', (e) => {
    hole.par = Number(e.target.value);
    saveOGRound();
    renderOGMode();
  });

  document.querySelectorAll('.og-score-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const idx = Number(e.target.dataset.playerIdx);
      const val = e.target.value;
      if (val === '') {
        delete round.players[idx].scores[holeIndex];
      } else {
        round.players[idx].scores[holeIndex] = Number(val);
      }
      saveOGRound();
      renderOGMode();
    });
  });

  document.getElementById('og-add-player-btn').addEventListener('click', openOGAddPlayerModal);

  const prevBtn = document.getElementById('og-prev-hole-btn');
  if (prevBtn) prevBtn.disabled = (holeIndex === 0);
}

function goToPrevOGHole() {
  if (currentOGRound.currentHoleIndex === 0) return;
  currentOGRound.currentHoleIndex--;
  saveOGRound();
  renderOGMode();
}

function goToNextOGHole() {
  currentOGRound.currentHoleIndex++;
  // Only create a fresh hole if we've actually reached the end (not
  // just moving forward again after using Prev Hole).
  if (currentOGRound.currentHoleIndex >= currentOGRound.holes.length) {
    currentOGRound.holes.push({ par: 3 });
  }
  saveOGRound();
  renderOGMode();
}

function openOGAddPlayerModal() {
  if (!currentOGRound) return;
  document.getElementById('og-add-player-name').value = '';
  document.getElementById('og-add-player-modal').classList.add('active');
}

function saveOGAddPlayer() {
  const nameInput = document.getElementById('og-add-player-name');
  const name = nameInput.value.trim();
  if (!name) { showGenericModal('Please enter a player name.'); return; }
  if (!currentOGRound) { document.getElementById('og-add-player-modal').classList.remove('active'); return; }

  currentOGRound.players.push({ name, scores: {} });
  document.getElementById('og-add-player-modal').classList.remove('active');
  saveOGRound();
  renderOGMode();
}

function exitOGRound() {
  currentOGRound = null;
  document.getElementById('og-mode-card').classList.add('hide');
  document.getElementById('controls-section').classList.remove('hide');
  document.getElementById('course-actions-section').classList.remove('hide');
  document.getElementById('stats-section').classList.remove('hide');
}

function finishOGRound() {
  clearOGRound();
  exitOGRound();
}

function cancelOGRound() {
  if (!currentOGRound) return;
  showConfirmModal(
    'This will permanently discard this OG round\'s scores. This cannot be undone. Continue?',
    () => {
      clearOGRound();
      exitOGRound();
    }
  );
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('og-mode-btn')?.addEventListener('click', startOGRound);

  if (loadOGRoundFromStorage()) {
    document.getElementById('continue-og-round-row')?.classList.remove('hide');
  }
  document.getElementById('continue-og-round-btn')?.addEventListener('click', () => {
    document.getElementById('continue-og-round-row')?.classList.add('hide');
    resumeOGRound();
  });

  document.getElementById('og-finish-btn')?.addEventListener('click', () => {
    showConfirmModal('End this OG round? Once submitted, you will not be able to change any scores.', finishOGRound);
  });
  document.getElementById('og-cancel-btn')?.addEventListener('click', cancelOGRound);
  document.getElementById('og-next-hole-btn')?.addEventListener('click', goToNextOGHole);
  document.getElementById('og-prev-hole-btn')?.addEventListener('click', goToPrevOGHole);

  document.getElementById('og-save-add-player-btn')?.addEventListener('click', saveOGAddPlayer);
  document.getElementById('og-cancel-add-player-btn')?.addEventListener('click', () => {
    document.getElementById('og-add-player-modal').classList.remove('active');
  });
});
