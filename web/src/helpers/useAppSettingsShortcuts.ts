/**
 * useAppSettingsShortcuts
 *
 * Global keyboard shortcuts for app settings.
 */
import { useEffect } from 'react';
import { useAppContext } from '../components/context/AppContext';

const isTypeableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    target.closest('[contenteditable=""], [contenteditable="true"]') !== null
  );
};

export const useAppSettingsShortcuts = () => {
  const { setAppSettings } = useAppContext();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTypeableTarget(event.target)
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'p') {
        setAppSettings((prevSettings) => ({
          ...prevSettings,
          enablePtzCrosshair: !prevSettings.enablePtzCrosshair
        }));
        return;
      }

      if (key === 'i') {
        setAppSettings((prevSettings) => ({
          ...prevSettings,
          bboxLabel: !prevSettings.bboxLabel
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setAppSettings]);
};
