/* js/db.js
   IndexedDB data layer for FlightLog.
   Stores:
     - courses: { id, name, holes: [{ number, length, par }] }
     - rounds:  { id, courseId, courseName, date, players: [{ name, scores: [{hole, strokes}] }] }
     - discs:   { id, name, brand, category, speed, glide, turn, fade,
                  stability, pic, manual } — manual:true means it was
                  hand-entered rather than found via the DiscIt API
     - fields:  { id, name, address, lat, lng, tee: {lat, lng} } — a
                  saved Field Work location, one tee per field
     - fieldSessions: { id, fieldId, fieldName, shotType, notes,
                  discSlots, throws: [{shotType, discA, discB, teeToA,
                  teeToB, aToB, bearing, timestamp}], date } — one
                  Finish Practice session's worth of Field Work throws
     - puttingAreas: { id, name, address, lat, lng, basket: {lat, lng} }
                  — a saved Putt Practice location, one basket per area
     - puttingSpots: { id, areaId, number, lat, lng } — a PERMANENT
                  numbered throwing spot at an area, reusable across
                  future visits (temporary spots aren't stored here —
                  they only ever live in a session's own record)
     - puttingSessions: { id, areaId, areaName, date, weather,
                  rounds: [{spotId, spotNumber, isPermanent, lat, lng,
                  distanceFt, attempts, makes}] } — one Finish Practice
                  session's worth of putting results
*/

const FLIGHTLOG_DB_NAME = 'DiscTallyDB';
const FLIGHTLOG_DB_VERSION = 6;

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
      if (!db.objectStoreNames.contains('discs')) {
        db.createObjectStore('discs', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('fields')) {
        db.createObjectStore('fields', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('fieldSessions')) {
        db.createObjectStore('fieldSessions', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('puttingAreas')) {
        db.createObjectStore('puttingAreas', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('puttingSpots')) {
        const spotsStore = db.createObjectStore('puttingSpots', { keyPath: 'id', autoIncrement: true });
        spotsStore.createIndex('areaId', 'areaId', { unique: false });
      }
      if (!db.objectStoreNames.contains('puttingSessions')) {
        db.createObjectStore('puttingSessions', { keyPath: 'id', autoIncrement: true });
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

function updateCourse(db, course) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('courses', 'readwrite');
    const req = tx.objectStore('courses').put(course);
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

function addDisc(db, disc) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('discs', 'readwrite');
    const req = tx.objectStore('discs').add(disc);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getAllDiscs(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('discs', 'readonly');
    const req = tx.objectStore('discs').getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function deleteDisc(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('discs', 'readwrite');
    tx.objectStore('discs').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

function addField(db, field) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fields', 'readwrite');
    const req = tx.objectStore('fields').add(field);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getAllFields(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fields', 'readonly');
    const req = tx.objectStore('fields').getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getFieldById(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fields', 'readonly');
    const req = tx.objectStore('fields').get(id);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function updateField(db, field) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fields', 'readwrite');
    const req = tx.objectStore('fields').put(field);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function deleteField(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fields', 'readwrite');
    tx.objectStore('fields').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

function addFieldSession(db, session) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fieldSessions', 'readwrite');
    const req = tx.objectStore('fieldSessions').add(session);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getAllFieldSessions(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fieldSessions', 'readonly');
    const req = tx.objectStore('fieldSessions').getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function clearAllFieldSessions(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fieldSessions', 'readwrite');
    tx.objectStore('fieldSessions').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

function addPuttingArea(db, area) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('puttingAreas', 'readwrite');
    const req = tx.objectStore('puttingAreas').add(area);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getAllPuttingAreas(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('puttingAreas', 'readonly');
    const req = tx.objectStore('puttingAreas').getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getPuttingAreaById(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('puttingAreas', 'readonly');
    const req = tx.objectStore('puttingAreas').get(id);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function addPuttingSpot(db, spot) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('puttingSpots', 'readwrite');
    const req = tx.objectStore('puttingSpots').add(spot);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getPuttingSpotsForArea(db, areaId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('puttingSpots', 'readonly');
    const req = tx.objectStore('puttingSpots').index('areaId').getAll(areaId);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function addPuttingSession(db, session) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('puttingSessions', 'readwrite');
    const req = tx.objectStore('puttingSessions').add(session);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getAllPuttingSessions(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('puttingSessions', 'readonly');
    const req = tx.objectStore('puttingSessions').getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function clearAllPuttingSessions(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('puttingSessions', 'readwrite');
    tx.objectStore('puttingSessions').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}
