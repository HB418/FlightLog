/* js/stock-courses.js
   Courses that ship with the app itself, so they're available on any
   fresh install without needing to be manually re-entered in the Admin
   panel. Seeded into IndexedDB once — tracked via each course's
   stockKey in localStorage, not by checking the DB record itself.

   stockKey is also kept ON the saved course record itself (not just
   the localStorage seed-tracking list) — that's the permanent marker
   the delete flow checks to tell a stock course apart from a regular
   admin-created one, so a non-admin can't delete it and even the admin
   gets an explicit extra warning before doing so.

   Note: the course logo is intentionally NOT included here. The
   original logo's base64 data was too large to safely hand-transcribe
   without risking silent corruption (confirmed corrupted on the first
   attempt), so it was dropped rather than ship a broken image. Add it
   back via the Admin panel's "Upload Logo" if wanted. */

const STOCK_COURSES = [
  {
    stockKey: 'old-town-hall-dgc',
    name: "Old Town Hall DGC",
    source: "admin",
    lat: 43.0979622,
    lng: -70.8325818,
    logo: "data:image/png;base64,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",
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

async function seedStockCourses() {
  const seededRaw = localStorage.getItem('seededStockCourseKeys');
  const seeded = seededRaw ? JSON.parse(seededRaw) : [];
  const db = await openDiscTallyDB();
  let changed = false;
  for (const stock of STOCK_COURSES) {
    if (seeded.includes(stock.stockKey)) continue;
    // stockKey is kept ON the saved record (not stripped) — it's the
    // permanent marker that lets the app tell a stock course apart from
    // a regular admin-created one later, e.g. to protect it from being
    // deleted by a non-admin.
    await addCourse(db, Object.assign({}, stock));
    seeded.push(stock.stockKey);
    changed = true;
  }
  if (changed) {
    localStorage.setItem('seededStockCourseKeys', JSON.stringify(seeded));
  }
}
