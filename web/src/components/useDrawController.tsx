import { useCallback, useMemo, useState } from 'react';
import type { DrawingOverlayHandle } from './DrawingOverlay';

/** Read coord size from localStorage 'vapix.resolution' => "WxH", fallback 1920x1080 */
function readVapixCoord(): { width: number; height: number } {
  try {
    const raw = window.localStorage.getItem('vapix');
    if (raw) {
      const obj = JSON.parse(raw);
      const res: string | undefined = obj?.resolution;
      if (res && /^[0-9]+x[0-9]+$/i.test(res)) {
        const [w, h] = res
          .toLowerCase()
          .split('x')
          .map((n: string) => parseInt(n, 10));
        if (w > 0 && h > 0) {
          return { width: w, height: h };
        }
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return { width: 1920, height: 1080 };
}

export function useDrawController(
  overlayRef: React.RefObject<DrawingOverlayHandle | null>
) {
  const [drawActive, setDrawActive] = useState<boolean>(false);
  const overlayCoord = useMemo(readVapixCoord, []);

  const toggleDraw = useCallback(() => {
    setDrawActive((v) => !v);
    overlayRef.current?.toggle?.();
  }, [overlayRef]);

  const undo = useCallback(() => overlayRef.current?.undo?.(), [overlayRef]);
  const clear = useCallback(() => overlayRef.current?.clear?.(), [overlayRef]);
  const save = useCallback(
    () => overlayRef.current?.saveSVG?.('annotation.svg'),
    [overlayRef]
  );

  return {
    drawActive,
    setDrawActive,
    toggleDraw,
    undo,
    clear,
    save,
    overlayCoord
  };
}
