/* SystemStatsOverlay
 *
 * Wraps the player image area and renders SystemStats as a draggable,
 * resizable overlay inside the same bounds.
 */
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Rnd, type Position } from 'react-rnd';
import SystemStats from '../backend/SystemStats';

const SYSTEM_STATS_MIN_WIDTH = 280;
const SYSTEM_STATS_MIN_HEIGHT = 180;
const SYSTEM_STATS_DEFAULT_WIDTH = 520;
const SYSTEM_STATS_DEFAULT_HEIGHT = 420;
const SYSTEM_STATS_MARGIN = 20;

interface SystemStatsBounds {
  /* Position and size in player-area pixels. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface SystemStatsOverlayProps {
  readonly children: React.ReactNode;
  readonly visible: boolean;
}

const clamp = (value: number, min: number, max: number) => {
  const safeMax = Math.max(min, max);
  return Math.min(Math.max(value, min), safeMax);
};

const sameSystemStatsBounds = (
  a: SystemStatsBounds | null,
  b: SystemStatsBounds
) =>
  a?.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/* Clamp overlay bounds so the panel stays visible inside the player area. */
const getSystemStatsBounds = (
  parent: HTMLDivElement,
  current: SystemStatsBounds | null
): SystemStatsBounds => {
  const availableWidth = Math.max(
    0,
    parent.clientWidth - SYSTEM_STATS_MARGIN * 2
  );
  const availableHeight = Math.max(
    0,
    parent.clientHeight - SYSTEM_STATS_MARGIN * 2
  );
  const minWidth = Math.min(SYSTEM_STATS_MIN_WIDTH, parent.clientWidth);
  const minHeight = Math.min(SYSTEM_STATS_MIN_HEIGHT, parent.clientHeight);
  const width = clamp(
    current?.width ?? SYSTEM_STATS_DEFAULT_WIDTH,
    minWidth,
    availableWidth
  );
  const height = clamp(
    current?.height ?? SYSTEM_STATS_DEFAULT_HEIGHT,
    minHeight,
    availableHeight
  );
  const x = current?.x ?? SYSTEM_STATS_MARGIN;
  const y =
    current?.y ??
    Math.max(
      SYSTEM_STATS_MARGIN,
      parent.clientHeight - height - SYSTEM_STATS_MARGIN
    );

  return {
    x: clamp(x, 0, parent.clientWidth - width),
    y: clamp(y, 0, parent.clientHeight - height),
    width,
    height
  };
};

export const SystemStatsOverlay: React.FC<SystemStatsOverlayProps> = ({
  children,
  visible
}) => {
  const playerAreaRef = useRef<HTMLDivElement>(null);
  /* Keep the user's chosen size while the visible bounds are clamped on smaller screens. */
  const preferredBoundsRef = useRef<SystemStatsBounds | null>(null);
  const [bounds, setBounds] = useState<SystemStatsBounds | null>(null);

  useLayoutEffect(() => {
    const parent = playerAreaRef.current;

    if (!visible) {
      preferredBoundsRef.current = null;
      setBounds(null);
      return;
    }

    if (parent === null) {
      return;
    }

    const resizePanel = () => {
      const nextBounds = getSystemStatsBounds(
        parent,
        preferredBoundsRef.current
      );

      /* First open starts at the bottom left with the default size. */
      if (preferredBoundsRef.current === null) {
        preferredBoundsRef.current = {
          ...nextBounds,
          width: SYSTEM_STATS_DEFAULT_WIDTH,
          height: SYSTEM_STATS_DEFAULT_HEIGHT
        };
      }

      setBounds((current) =>
        sameSystemStatsBounds(current, nextBounds) ? current : nextBounds
      );
    };

    resizePanel();

    const observer = new window.ResizeObserver(resizePanel);
    observer.observe(parent);

    return () => observer.disconnect();
  }, [visible]);

  const handleDragStop = useCallback((_event: unknown, data: Position) => {
    const parent = playerAreaRef.current;

    if (parent === null) {
      return;
    }

    setBounds((current) => {
      if (current === null) {
        return current;
      }

      /* Dragging changes position but keeps the preferred size. */
      const preferredBounds = {
        ...(preferredBoundsRef.current ?? current),
        x: data.x,
        y: data.y
      };
      const nextBounds = getSystemStatsBounds(parent, preferredBounds);

      preferredBoundsRef.current = preferredBounds;

      return sameSystemStatsBounds(current, nextBounds) ? current : nextBounds;
    });
  }, []);

  const handleResizeStop = useCallback(
    (
      _event: unknown,
      _direction: unknown,
      element: HTMLElement,
      _delta: unknown,
      position: Position
    ) => {
      const parent = playerAreaRef.current;

      if (parent === null) {
        return;
      }

      const preferredBounds = {
        x: position.x,
        y: position.y,
        width: element.offsetWidth,
        height: element.offsetHeight
      };
      const nextBounds = getSystemStatsBounds(parent, preferredBounds);

      preferredBoundsRef.current = preferredBounds;
      setBounds((current) =>
        sameSystemStatsBounds(current, nextBounds) ? current : nextBounds
      );
    },
    []
  );

  return (
    <div
      ref={playerAreaRef}
      style={{ flex: '1 1 auto', position: 'relative', margin: '3px' }}
    >
      {/* Draggable system stats overlay (bound to player area) */}
      {visible && bounds !== null && (
        <Rnd
          bounds="parent"
          position={{ x: bounds.x, y: bounds.y }}
          size={{
            width: bounds.width,
            height: bounds.height
          }}
          minWidth={Math.min(SYSTEM_STATS_MIN_WIDTH, bounds.width)}
          minHeight={Math.min(SYSTEM_STATS_MIN_HEIGHT, bounds.height)}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
          /* NOTE: We need this for the inputs to work on touch screens: */
          cancel="input, textarea, select, button, .process-row, .MuiChip-root, .selectable-text"
          style={{
            zIndex: 10,
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '8px',
            borderRadius: '4px',
            boxSizing: 'border-box',
            cursor: 'move',
            overflow: 'hidden'
          }}
        >
          <SystemStats />
        </Rnd>
      )}
      {children}
    </div>
  );
};
