const STORAGE_KEY = 'overlayBackupList';

/*
 * Load all stored overlay backups
 */
export const loadOverlayBackups = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/*
 * Save a backup of any overlay
 */
export const saveOverlayBackup = (overlay: any) => {
  try {
    const list = loadOverlayBackups();

    /* NOTE: Deep clone to avoid mutation problems */
    const overlayCopy = JSON.parse(JSON.stringify(overlay));

    list.push(overlayCopy);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to save overlay backup:', err);
  }
};

/*
 * Restore a single overlay backup (by index)
 */
export const restoreOverlayBackup = (index: number) => {
  try {
    const list = loadOverlayBackups();
    return list[index] ?? null;
  } catch {
    return null;
  }
};

/*
 * Clear all overlay backups
 */
export const clearOverlayBackups = () => {
  localStorage.removeItem(STORAGE_KEY);
};

/*
 * Delete a single backup by index
 */
export const deleteOverlayBackup = (index: number) => {
  try {
    const list = loadOverlayBackups();
    list.splice(index, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to delete overlay backup:', err);
  }
};
