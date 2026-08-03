/* js/stock-courses.js
   Courses that ship with the app itself, so they're available on any
   fresh install without needing to be manually re-entered in the Admin
   panel. Reconciled against the actual database on every load — not a
   one-time "seeded, never check again" flag — so a stock course that
   goes missing for any reason (deleted, or a leftover from an older
   version of this file) gets restored automatically. No manual console
   command or DevTools access is ever required, on desktop or a phone.

   stockKey is kept ON the saved course record itself — that's the
   permanent marker the delete flow checks to tell a stock course apart
   from a regular admin-created one, so a non-admin can't delete it and
   even the admin gets an explicit extra warning before doing so.

   Course logos are plain image files in img/ (e.g. img/OTHDGC.png),
   referenced here by path — same as any other image in the app. Not
   embedded as base64 text: a real file needs no transcription at all
   (no risk of corruption, no size limit to worry about), and <img>
   renders a file path and a base64 data-URI identically either way. */

const STOCK_COURSES = [
  {
    stockKey: 'old-town-hall-dgc',
    name: "Old Town Hall DGC",
    address: "336 Nimble Hill Rd",
    location: "Newington, NH",
    source: "admin",
    lat: 43.0979622,
    lng: -70.8325818,
    logo: "img/OTHDGC.png",
    holes: [
      {
        "number": 1, "length": 171, "par": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.09659194917489, "lng": -70.83317041397096, "rotation": 23, "labelOffset": { "x": 10, "y": 1 } },
        "basket": { "lat": 43.09704633267787, "lng": -70.83297193050386, "labelOffset": { "x": -4, "y": -29 } }
      },
      {
        "number": 2, "length": 112, "par": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.09713642555808, "lng": -70.83307385444643, "rotation": -82, "labelOffset": { "x": -2, "y": -11 } },
        "basket": { "lat": 43.09717951341046, "lng": -70.83350837230684, "labelOffset": { "x": -4, "y": -32 } },
        "waypoints": [ { "lat": 43.097144259715314, "lng": -70.8333206176758 } ]
      },
      {
        "number": 3, "length": 138, "par": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.097112923080374, "lng": -70.83355128765108, "rotation": 167, "labelOffset": { "x": -14, "y": 5 } },
        "basket": { "lat": 43.09672904800081, "lng": -70.83343863487245, "labelOffset": { "x": -4, "y": -30 } }
      },
      {
        "number": 4, "length": 217, "par": 4,
        "hazards": { "dogleg": true },
        "tee": { "lat": 43.09669379404631, "lng": -70.83352446556093, "rotation": -31, "labelOffset": { "x": -12, "y": 6 } },
        "basket": { "lat": 43.09719126463767, "lng": -70.83370149135591, "labelOffset": { "x": -3, "y": -31 } },
        "waypoints": [ { "lat": 43.09703849850811, "lng": -70.83384096622468 } ]
      },
      {
        "number": 5, "length": 203, "par": 4,
        "hazards": { "dogleg": true },
        "tee": { "lat": 43.097351864516774, "lng": -70.83364248275758, "rotation": -115, "labelOffset": { "x": -11, "y": -11 } },
        "basket": { "lat": 43.09697190802467, "lng": -70.8341306447983, "labelOffset": { "x": -5, "y": -30 } },
        "waypoints": [
          { "lat": 43.09714817679356, "lng": -70.83416283130647 },
          { "lat": 43.097069835181124, "lng": -70.83420574665071 }
        ]
      },
      {
        "number": 6, "length": 348, "par": 5,
        "hazards": { "dogleg": true },
        "tee": { "lat": 43.09730877678568, "lng": -70.83399116992952, "rotation": -103, "labelOffset": { "x": -8, "y": -13 } },
        "basket": { "lat": 43.09741062046488, "lng": -70.83510696887971, "labelOffset": { "x": -2, "y": -30 } },
        "waypoints": [ { "lat": 43.097214767085305, "lng": -70.83503723144533 } ]
      },
      {
        "number": 7, "length": 135, "par": 3,
        "hazards": { "dogleg": true },
        "tee": { "lat": 43.09751638102937, "lng": -70.83531081676485, "rotation": 173, "labelOffset": { "x": -20, "y": 3 } },
        "basket": { "lat": 43.09715209387156, "lng": -70.83536446094514, "labelOffset": { "x": -2, "y": -28 } },
        "waypoints": [ { "lat": 43.09725002073987, "lng": -70.83526253700258 } ]
      },
      {
        "number": 8, "length": 138, "par": 3,
        "hazards": { "dogleg": true },
        "tee": { "lat": 43.09713642555808, "lng": -70.83545565605165, "rotation": 167, "labelOffset": { "x": -15, "y": 5 } },
        "basket": { "lat": 43.09677605324189, "lng": -70.83539128303529, "labelOffset": { "x": -5, "y": -31 } },
        "waypoints": [ { "lat": 43.09690531746879, "lng": -70.83531618118288 } ]
      },
      {
        "number": 9, "length": 184, "par": 3,
        "hazards": { "dogleg": true },
        "tee": { "lat": 43.0967329651056, "lng": -70.8353751897812, "rotation": 80, "labelOffset": { "x": -1, "y": 13 } },
        "basket": { "lat": 43.09666245718084, "lng": -70.83471536636354, "labelOffset": { "x": -4, "y": -30 } }
      }
    ]
  }
];

// Reconciles the stock courses shipped in this file against what's
// actually in the database — self-healing, no manual console command
// or DevTools access ever required, even on a phone. Cheap fast path
// on every normal load (just a count comparison); only does the full
// scan-and-repair work when something's actually off.
async function seedStockCourses() {
  const db = await openDiscTallyDB();
  const existingCourses = await getAllCourses(db);
  const existingStockCourses = existingCourses.filter(c => c.stockKey);

  // Fast path: counts match, nothing to reconcile.
  if (existingStockCourses.length === STOCK_COURSES.length) return;

  // Counts don't match — scan the list.
  const currentStockKeys = new Set(STOCK_COURSES.map(s => s.stockKey));
  const existingStockKeys = new Set(existingStockCourses.map(c => c.stockKey));

  // Add any stock course missing from the database — safe and
  // additive, no confirmation needed. stockKey is kept ON the saved
  // record (not stripped) — it's the permanent marker that lets the
  // app tell a stock course apart from a regular admin-created one
  // later, e.g. to protect it from being deleted by a non-admin.
  for (const stock of STOCK_COURSES) {
    if (!existingStockKeys.has(stock.stockKey)) {
      await addCourse(db, Object.assign({}, stock));
    }
  }

  // Any course with a stockKey that no longer exists in the current
  // source is orphaned (e.g. a leftover test duplicate that was
  // removed from the source later) — ask before removing anything,
  // since a course could have rounds/stats tied to it.
  const orphaned = existingStockCourses.filter(c => !currentStockKeys.has(c.stockKey));
  orphaned.forEach(promptRemoveOrphanedStockCourse);
}

function promptRemoveOrphanedStockCourse(course) {
  showConfirmModal(
    'Found a leftover stock course that\'s no longer part of the app: "' + (course.name || 'Unnamed course') + '". This looks like a duplicate from an earlier version. Delete it?',
    async () => {
      const db = await openDiscTallyDB();
      await deleteCourse(db, course.id);
      await loadCourseOptions();
    }
  );
}
