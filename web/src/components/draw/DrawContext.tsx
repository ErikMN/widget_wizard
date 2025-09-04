/* Centralized draw state + imperative overlay ref */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from 'react';
import type { DrawingOverlayHandle } from './DrawingOverlay';

type Coord = { width: number; height: number };

function readVapixCoord(): Coord {
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
        if (w > 0 && h > 0) return { width: w, height: h };
      }
    }
  } catch {
    /* ignore */
  }
  return { width: 1920, height: 1080 };
}

type DrawContextValue = {
  /* state */
  drawActive: boolean;
  setDrawActive: React.Dispatch<React.SetStateAction<boolean>>;
  coord: Coord;

  /* overlay ref (imperative handle) */
  overlayRef: React.RefObject<DrawingOverlayHandle | null>;

  /* controls */
  start: () => void;
  stop: () => void;
  toggle: () => void;
  undo: () => void;
  clear: () => void;
  save: () => void;
};

const DrawContext = createContext<DrawContextValue | null>(null);

export const DrawProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const overlayRef = useRef<DrawingOverlayHandle | null>(null);
  const [drawActive, setDrawActive] = useState(false);
  const coord = useMemo(readVapixCoord, []);

  const start = useCallback(() => {
    overlayRef.current?.start?.();
    setDrawActive(true);
  }, []);

  const stop = useCallback(() => {
    overlayRef.current?.stop?.();
    setDrawActive(false);
  }, []);

  const toggle = useCallback(() => {
    overlayRef.current?.toggle?.();
    setDrawActive((v) => !v);
  }, []);

  const undo = useCallback(() => overlayRef.current?.undo?.(), []);

  const clear = useCallback(() => overlayRef.current?.clear?.(), []);

  const save = useCallback(
    () => overlayRef.current?.saveSVG?.('annotation.svg'),
    []
  );

  const value: DrawContextValue = {
    drawActive,
    setDrawActive,
    coord,
    overlayRef,
    start,
    stop,
    toggle,
    undo,
    clear,
    save
  };

  return <DrawContext.Provider value={value}>{children}</DrawContext.Provider>;
};

export function useDraw() {
  const ctx = useContext(DrawContext);
  if (!ctx) {
    throw new Error('useDraw must be used within a DrawProvider');
  }
  return ctx;
}
