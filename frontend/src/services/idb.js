let dbInstance = null;

export async function initIDB() {
  if (dbInstance) return dbInstance;
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('udaan_client_idb', 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('attempts')) {
          db.createObjectStore('attempts', { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveAttemptOffline(attempt) {
  const db = await initIDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('attempts', 'readwrite');
      tx.objectStore('attempts').put(attempt);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function getOfflineAttempts() {
  const db = await initIDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('attempts', 'readonly');
      const req = tx.objectStore('attempts').getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function removeOfflineAttempt(id) {
  const db = await initIDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('attempts', 'readwrite');
      tx.objectStore('attempts').delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
