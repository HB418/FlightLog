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
  },
  {
    stockKey: 'bellamy-park-dgc',
    name: "Bellamy Park DGC",
    address: "27 Bellamy Rd",
    location: "Dover, NH",
    source: "admin",
    lat: 43.1805123,
    lng: -70.8896371,
    logo: "img/BPDG.png",
    holes: [
      {
        "number": 1, "length": 224, "par": 3, "secondLength": 162, "secondPar": 3,
        "hazards": { "dogleg": true, "water": true, "trees": true },
        "tee": { "lat": 43.17923029603951, "lng": -70.89051604270936, "rotation": -45, "labelOffset": { "x": 5, "y": -15 } },
        "basket": { "lat": 43.17968406586326, "lng": -70.89094519615175, "labelOffset": { "x": -5, "y": -32 } },
        "secondTee": { "lat": 43.1793007088194, "lng": -70.89083790779115, "rotation": -9, "labelOffset": { "x": 8, "y": 0 } },
        "waypoints": [ { "lat": 43.1794415341356, "lng": -70.89082717895509 } ]
      },
      {
        "number": 2, "length": 296, "par": 3, "secondLength": 186, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.17975447811987, "lng": -70.89068770408632, "rotation": 18, "labelOffset": { "x": 9, "y": 0 } },
        "basket": { "lat": 43.18048206668344, "lng": -70.89033365249635, "labelOffset": { "x": -5, "y": -32 } },
        "secondTee": { "lat": 43.17991877306953, "lng": -70.89053750038148, "rotation": 16, "labelOffset": { "x": 7, "y": 4 } }
      },
      {
        "number": 3, "length": 242, "par": 3, "secondLength": 178, "secondPar": 3,
        "hazards": { "dogleg": true, "trees": true },
        "tee": { "lat": 43.18064635967524, "lng": -70.89079499244691, "rotation": 72, "labelOffset": { "x": 4, "y": 10 } },
        "basket": { "lat": 43.18076371154156, "lng": -70.88994741439821, "labelOffset": { "x": -4, "y": -30 } },
        "secondTee": { "lat": 43.180708947365346, "lng": -70.8906126022339, "rotation": 85, "labelOffset": { "x": -11, "y": -15 } },
        "waypoints": [
          { "lat": 43.18072850600535, "lng": -70.89033365249635 },
          { "lat": 43.18069721217836, "lng": -70.89007616043092 }
        ]
      },
      {
        "number": 4, "length": 388, "par": 4, "secondLength": 202, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.1807950053345, "lng": -70.88977575302125, "rotation": 43, "labelOffset": { "x": 16, "y": 0 } },
        "basket": { "lat": 43.18163602001143, "lng": -70.88908374309541, "labelOffset": { "x": -3, "y": -30 } },
        "secondTee": { "lat": 43.18106882533843, "lng": -70.88938415050508, "rotation": 18, "labelOffset": { "x": 8, "y": 3 } },
        "waypoints": [ { "lat": 43.181213558272965, "lng": -70.88934123516084 } ]
      },
      {
        "number": 5, "length": 424, "par": 4, "secondLength": 235, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.18129179214877, "lng": -70.88953435420991, "rotation": -72, "labelOffset": { "x": -1, "y": -13 } },
        "basket": { "lat": 43.18159299163474, "lng": -70.89101493358613, "labelOffset": { "x": -4, "y": -32 } },
        "secondTee": { "lat": 43.18148737639973, "lng": -70.8901619911194, "rotation": -77, "labelOffset": { "x": -8, "y": -12 } }
      },
      {
        "number": 6, "length": 223, "par": 3, "secondLength": 166, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.18138958435258, "lng": -70.89124023914339, "rotation": 108, "labelOffset": { "x": -6, "y": 13 } },
        "basket": { "lat": 43.18130743891193, "lng": -70.89044094085695, "labelOffset": { "x": -5, "y": -29 } },
        "secondTee": { "lat": 43.18127223368922, "lng": -70.89109003543855, "rotation": 97, "labelOffset": { "x": -11, "y": 11 } },
        "waypoints": [ { "lat": 43.18129961553085, "lng": -70.89082181453706 } ]
      },
      {
        "number": 7, "length": 238, "par": 3, "secondLength": 148, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.18089279833401, "lng": -70.89027464389802, "rotation": -83, "labelOffset": { "x": -1, "y": -14 } },
        "basket": { "lat": 43.18099059117691, "lng": -70.89109539985658, "labelOffset": { "x": -2, "y": -29 } },
        "secondTee": { "lat": 43.18089671005073, "lng": -70.89060723781587, "rotation": -81, "labelOffset": { "x": -9, "y": -16 } }
      },
      {
        "number": 8, "length": 194, "par": 3, "secondLength": 159, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.18072850600535, "lng": -70.8911168575287, "rotation": 135, "labelOffset": { "x": 3, "y": -13 } },
        "basket": { "lat": 43.18036862602633, "lng": -70.89067697525026, "labelOffset": { "x": -4, "y": -30 } },
        "secondTee": { "lat": 43.180632668609476, "lng": -70.89103907346727, "rotation": 128, "labelOffset": { "x": 0.5, "y": -12.5 } }
      },
      {
        "number": 9, "length": 204, "par": 3, "secondLength": 129, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.18005568518985, "lng": -70.89078426361085, "rotation": -24, "labelOffset": { "x": 5, "y": -5 } },
        "basket": { "lat": 43.18054074280268, "lng": -70.89112222194673, "labelOffset": { "x": -4, "y": -31 } },
        "secondTee": { "lat": 43.180278655700114, "lng": -70.89090764522554, "rotation": -27, "labelOffset": { "x": 16, "y": 0 } }
      },
      {
        "number": 10, "length": 217, "par": 3, "secondLength": 169, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.18042730225459, "lng": -70.89125633239748, "rotation": 153, "labelOffset": { "x": -17, "y": 6 } },
        "basket": { "lat": 43.17991877306953, "lng": -70.89099884033205, "labelOffset": { "x": -7, "y": -30 } },
        "secondTee": { "lat": 43.180292346845256, "lng": -70.891350209713, "rotation": 148, "labelOffset": { "x": -20.5, "y": 4.5 } }
      },
      {
        "number": 11, "length": 311, "par": 3, "secondLength": 218, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.179840537434345, "lng": -70.89139580726625, "rotation": 176, "labelOffset": { "x": -19, "y": 6 } },
        "basket": { "lat": 43.17900340986298, "lng": -70.89121341705324, "labelOffset": { "x": -7, "y": -32 } },
        "secondTee": { "lat": 43.179641036110915, "lng": -70.89131265878679, "rotation": -7, "labelOffset": { "x": 16, "y": 0 } }
      },
      {
        "number": 12, "length": 317, "par": 4, "secondLength": 164, "secondPar": 3,
        "hazards": { "water": true, "trees": true },
        "tee": { "lat": 43.17894864410787, "lng": -70.89193224906923, "rotation": -123, "labelOffset": { "x": -17, "y": -9 } },
        "basket": { "lat": 43.17851834003697, "lng": -70.89291930198671, "labelOffset": { "x": -8, "y": -30 } },
        "secondTee": { "lat": 43.178682638312814, "lng": -70.89235067367555, "rotation": -108, "labelOffset": { "x": -14.5, "y": -13.5 } },
        "waypoints": [ { "lat": 43.178682638312814, "lng": -70.89240431785585 } ]
      },
      {
        "number": 13, "length": 345, "par": 4, "secondLength": 261, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.17862004854557, "lng": -70.8930802345276, "rotation": 41, "labelOffset": { "x": 7, "y": 4 } },
        "basket": { "lat": 43.179191177793356, "lng": -70.89242577552797, "labelOffset": { "x": 6, "y": -22 } },
        "secondTee": { "lat": 43.17879217025114, "lng": -70.89289784431459, "rotation": 40, "labelOffset": { "x": 5, "y": 3.5 } }
      },
      {
        "number": 14, "length": 376, "par": 4, "secondLength": 224, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.179328091545216, "lng": -70.89247405529024, "rotation": -119, "labelOffset": { "x": -17, "y": -14 } },
        "basket": { "lat": 43.17882346505456, "lng": -70.89341282844545, "labelOffset": { "x": -8, "y": -31 } },
        "secondTee": { "lat": 43.17922638421602, "lng": -70.89291930198671, "rotation": -137, "labelOffset": { "x": -24, "y": -9 } }
      },
      {
        "number": 15, "length": 204, "par": 3, "secondLength": 171, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.17858092990846, "lng": -70.89332699775697, "rotation": -96, "labelOffset": { "x": -12, "y": -15 } },
        "basket": { "lat": 43.17857310617803, "lng": -70.89401364326478, "labelOffset": { "x": -6, "y": -32 } },
        "secondTee": { "lat": 43.17861418075161, "lng": -70.8934584259987, "rotation": -97, "labelOffset": { "x": -12.5, "y": -15 } }
      },
      {
        "number": 16, "length": 208, "par": 3, "secondLength": 159, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.17818974215895, "lng": -70.8941960334778, "rotation": -135, "labelOffset": { "x": -20, "y": -9 } },
        "basket": { "lat": 43.17778290424088, "lng": -70.89474856853487, "labelOffset": { "x": -8, "y": -33 } },
        "secondTee": { "lat": 43.178150623246154, "lng": -70.89437305927278, "rotation": -142, "labelOffset": { "x": -26, "y": -7 } }
      },
      {
        "number": 17, "length": 256, "par": 3, "secondLength": 193, "secondPar": 3,
        "hazards": { "dogleg": true, "trees": true },
        "tee": { "lat": 43.17782202338926, "lng": -70.89441061019899, "rotation": 63, "labelOffset": { "x": 4, "y": 10 } },
        "basket": { "lat": 43.178221037271136, "lng": -70.89363276958467, "labelOffset": { "x": -6, "y": -31 } },
        "secondTee": { "lat": 43.17794133663702, "lng": -70.89425504207613, "rotation": 61, "labelOffset": { "x": 16, "y": 0 } },
        "waypoints": [ { "lat": 43.17802935445722, "lng": -70.89386343955995 } ]
      },
      {
        "number": 18, "length": 476, "par": 4, "secondLength": 298, "secondPar": 3,
        "hazards": { "trees": true },
        "tee": { "lat": 43.178682638312814, "lng": -70.89281201362611, "rotation": 54, "labelOffset": { "x": 8, "y": 8 } },
        "basket": { "lat": 43.17933982699538, "lng": -70.89140653610231, "labelOffset": { "x": -8, "y": -30 } },
        "secondTee": { "lat": 43.17889974607071, "lng": -70.89225411415102, "rotation": 54, "labelOffset": { "x": -22.5, "y": -17.5 } }
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
