/* Draw IndexedDB storage helpers.
 */
const DRAW_DB_NAME = 'widgetWizardDraw';
const DRAW_DB_VERSION = 1;
const DRAW_STORE_NAME = 'drawState';
const DRAW_RECORD_KEY = 'current';

const openDrawDatabase = async (): Promise<IDBDatabase> => {
  return await new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }

    const request = window.indexedDB.open(DRAW_DB_NAME, DRAW_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(DRAW_STORE_NAME)) {
        database.createObjectStore(DRAW_STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open draw database'));
    };
  });
};

const getStoredValue = async (database: IDBDatabase): Promise<unknown> => {
  return await new Promise((resolve, reject) => {
    const transaction = database.transaction(DRAW_STORE_NAME, 'readonly');
    const store = transaction.objectStore(DRAW_STORE_NAME);
    const request = store.get(DRAW_RECORD_KEY);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to read draw state'));
    };
  });
};

const putStoredValue = async (
  database: IDBDatabase,
  value: unknown
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DRAW_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DRAW_STORE_NAME);
    const request = store.put(value, DRAW_RECORD_KEY);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to write draw state'));
    };
  });
};

export const loadIndexedDbDrawState = async (): Promise<unknown | null> => {
  const database = await openDrawDatabase();

  try {
    const storedValue = await getStoredValue(database);
    return storedValue !== undefined ? (storedValue ?? null) : null;
  } finally {
    database.close();
  }
};

export const saveIndexedDbDrawState = async (value: unknown): Promise<void> => {
  const database = await openDrawDatabase();

  try {
    await putStoredValue(database, value);
  } finally {
    database.close();
  }
};
