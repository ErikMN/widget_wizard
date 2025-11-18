const STORAGE_KEY = 'widgetBackupList';

/*
 * Load all stored widget backups
 */
export const loadWidgetBackups = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/*
 * Save a backup of any widget
 * NOTE: generalParams.id is removed since IDs are unique per widget
 */
export const saveWidgetBackup = (widget: any) => {
  try {
    const list = loadWidgetBackups();

    /* NOTE: Deep clone to avoid mutation problems */
    const widgetCopy = JSON.parse(JSON.stringify(widget));

    if (widgetCopy && widgetCopy.generalParams) {
      delete widgetCopy.generalParams.id;
    }

    list.push(widgetCopy);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to save widget backup:', err);
  }
};

/*
 * Restore a single widget backup (by index)
 */
export const restoreWidgetBackup = (index: number) => {
  try {
    const list = loadWidgetBackups();
    const item = list[index];
    if (!item) {
      return null;
    }
    /* Return a cloned copy */
    return JSON.parse(JSON.stringify(item));
  } catch {
    return null;
  }
};

/*
 * Clear all widget backups
 */
export const clearWidgetBackups = () => {
  localStorage.removeItem(STORAGE_KEY);
};

/*
 * Delete a single backup by index
 */
export const deleteWidgetBackup = (index: number) => {
  try {
    const list = loadWidgetBackups();
    list.splice(index, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to delete widget backup:', err);
  }
};
