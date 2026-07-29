/* js/db.js
   IndexedDB data layer for FlightLog.
   Stores:
     - courses: { id, name, holes: [{ number, length, par }] }
     - rounds:  { id, courseId, courseName, date, players: [{ name, scores: [{hole, strokes}] }] }
*/

const FLIGHTLOG_DB_NAME = 'DiscTallyDB';
const FLIGHTLOG_DB_VERSION = 2;

function openDiscTallyDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FLIGHTLOG_DB_NAME, FLIGHTLOG_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('courses')) {
        db.createObjectStore('courses', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('rounds')) {
        const roundsStore = db.createObjectStore('rounds', { keyPath: 'id', autoIncrement: true });
        roundsStore.createIndex('courseId', 'courseId', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function addCourse(db, course) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('courses', 'readwrite');
    const req = tx.objectStore('courses').add(course);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getCourseById(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('courses', 'readonly');
    const req = tx.objectStore('courses').get(id);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getAllCourses(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('courses', 'readonly');
    const req = tx.objectStore('courses').getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function deleteCourse(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('courses', 'readwrite');
    tx.objectStore('courses').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

function addRound(db, round) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('rounds', 'readwrite');
    const req = tx.objectStore('rounds').add(round);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getRoundsByCourse(db, courseId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('rounds', 'readonly');
    const idx = tx.objectStore('rounds').index('courseId');
    const req = idx.getAll(courseId);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getAllRounds(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('rounds', 'readonly');
    const req = tx.objectStore('rounds').getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function deleteRounds(db, ids) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('rounds', 'readwrite');
    const store = tx.objectStore('rounds');
    ids.forEach(id => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

function clearAllRounds(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('rounds', 'readwrite');
    tx.objectStore('rounds').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}
