/* js/ratings.js
   The Flight Rating system: course difficulty (length + hazards),
   the expected "1000-rated player" baseline score for a course, and
   each round's rating relative to that baseline. Shared by the Admin
   panel (hazard checkboxes), round.js (computing a round's rating when
   a round finishes), and the Account/Stats pages (showing the player's
   overall Flight Rating).

   This is an original system, not a reproduction of PDGA's — PDGA's
   real formula needs a live field of rated players on the same day to
   work at all, which a small app without that player pool can't do.
   This version instead treats the course itself (length + a hazard
   checklist) as the fixed difficulty input, so a single player can get
   a real rating the very first time they play a course, alone. */

const HAZARD_TYPES = ['dogleg', 'water', 'trees', 'ob'];
const HAZARD_LABELS = { dogleg: 'Dogleg', water: 'Water', trees: 'Trees', ob: 'Out of Bounds' };
const HAZARD_STEP = 0.05;      // multiplier added per checked hazard, per hole
const OBSTACLE_TO_STROKES = 15; // hazard difficulty points -> extra strokes on the baseline
const POINTS_PER_STROKE = 10;   // rating points per stroke, vs. the baseline
const DEFAULT_FLIGHT_RATING = 1000;

// Cumulative course multiplier: starts at 1.00, +0.05 for every checked
// hazard on every hole (never averaged or reset — a course with more
// hazard-flagged holes always ends up with a higher multiplier).
function computeCourseMultiplier(course) {
  let multiplier = 1.0;
  (course.holes || []).forEach(h => {
    const hazards = h.hazards || {};
    HAZARD_TYPES.forEach(type => {
      if (hazards[type]) multiplier += HAZARD_STEP;
    });
  });
  return multiplier;
}

function getCourseTotals(course) {
  const holes = course.holes || [];
  const totalLength = holes.reduce((sum, h) => sum + (Number(h.length) || 0), 0);
  const totalPar = holes.reduce((sum, h) => sum + (Number(h.par) || 0), 0);
  return { totalLength, totalPar };
}

// Course Rating: (total length x hazard multiplier) / total par. This is
// the number shown next to a course in list screens.
function computeCourseRating(course) {
  const { totalLength, totalPar } = getCourseTotals(course);
  if (!totalPar) return null;
  const multiplier = computeCourseMultiplier(course);
  return (totalLength * multiplier) / totalPar;
}

// The Baseline Score is what a hypothetical 1000-rated player would be
// expected to shoot on this specific course. It starts from the same
// length-per-par ratio a completely open course would have (the "Open
// Index"), then adds extra strokes for whatever hazard difficulty the
// course's multiplier adds on top of that.
function computeBaselineScore(course) {
  const { totalLength, totalPar } = getCourseTotals(course);
  if (!totalPar) return null;
  const openIndex = totalLength / totalPar;
  const courseRating = computeCourseRating(course);
  const obstaclePoints = courseRating - openIndex;
  const extraStrokes = obstaclePoints / OBSTACLE_TO_STROKES;
  return totalPar + extraStrokes;
}

// A single round's rating: 1000 at the baseline score, +/- 10 points per
// stroke better/worse than that baseline.
function computeRoundRating(course, actualScore) {
  const baseline = computeBaselineScore(course);
  if (baseline == null) return null;
  return 1000 - ((actualScore - baseline) * POINTS_PER_STROKE);
}

// Recomputes the signed-in user's overall Flight Rating from every round
// they've played (simple average of that round's stored roundRating for
// their own player entry), and saves it to localStorage. Called after a
// round finishes, and after any stats-deleting action, so the number
// never goes stale.
async function recomputeFlightRating() {
  const userName = localStorage.getItem('userName');
  if (!userName) return DEFAULT_FLIGHT_RATING;

  const db = await openDiscTallyDB();
  const rounds = await getAllRounds(db);
  const ratings = [];
  rounds.forEach(r => {
    const entry = (r.players || []).find(p => p.name === userName);
    if (entry && typeof entry.roundRating === 'number') ratings.push(entry.roundRating);
  });

  const rating = ratings.length
    ? Math.round(ratings.reduce((s, v) => s + v, 0) / ratings.length)
    : DEFAULT_FLIGHT_RATING;

  localStorage.setItem('userFlightRating', String(rating));
  return rating;
}

function getStoredFlightRating() {
  const stored = localStorage.getItem('userFlightRating');
  return stored != null ? Number(stored) : DEFAULT_FLIGHT_RATING;
}
