import { MAX_LS_BACKUPS } from '../constants';

const STORAGE_KEY = 'overlayBackupList';

/*
 * Load all stored overlay backups
 */
export const loadOverlayBackups = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return [];
    }

    const parsed = JSON.parse(data);

    /* Enforce max backups even if storage is hacked */
    return Array.isArray(parsed) ? parsed.slice(0, MAX_LS_BACKUPS) : [];
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

    /* Do not allow more than max backups */
    if (list.length >= MAX_LS_BACKUPS) {
      return;
    }

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
