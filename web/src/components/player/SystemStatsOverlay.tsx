/* SystemStatsOverlay
 *
 * Wraps the player image area and renders SystemStats as a draggable,
 * resizable overlay inside the same bounds.
 */
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Rnd, type Position } from 'react-rnd';
import SystemStats, {
  type SystemStatsDisplayMode
} from '../backend/SystemStats';

const SYSTEM_STATS_MIN_WIDTH = 280;
const SYSTEM_STATS_MIN_HEIGHT = 180;
const SYSTEM_STATS_DEFAULT_WIDTH = 540;
const SYSTEM_STATS_DEFAULT_HEIGHT = 360;
const SYSTEM_STATS_MARGIN = 20;
/* Controls should use their own mouse and touch handling instead of dragging. */
const SYSTEM_STATS_DRAG_CANCEL_SELECTOR =
  'input, textarea, select, button, .process-row, .MuiChip-root, .selectable-text';

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

/* Let scrollbars handle mouse down while open panel space remains draggable. */
const isScrollbarMouseDown = (event: React.MouseEvent<HTMLElement>) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const scrollArea = target.closest<HTMLElement>('.system-stats-scroll-area');

  if (scrollArea === null) {
    return false;
  }

  const rect = scrollArea.getBoundingClientRect();
  const hasVerticalScrollbar =
    scrollArea.scrollHeight > scrollArea.clientHeight;
  const hasHorizontalScrollbar =
    scrollArea.scrollWidth > scrollArea.clientWidth;
  const verticalScrollbarWidth =
    scrollArea.offsetWidth - scrollArea.clientWidth;
  const horizontalScrollbarHeight =
    scrollArea.offsetHeight - scrollArea.clientHeight;
  const isVerticalScrollbar =
    hasVerticalScrollbar &&
    verticalScrollbarWidth > 0 &&
    event.clientX >= rect.right - verticalScrollbarWidth;
  const isHorizontalScrollbar =
    hasHorizontalScrollbar &&
    horizontalScrollbarHeight > 0 &&
    event.clientY >= rect.bottom - horizontalScrollbarHeight;

  return isVerticalScrollbar || isHorizontalScrollbar;
};

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

const getSystemStatsMessageBounds = (
  parent: HTMLDivElement,
  element: HTMLElement | null,
  position: Position | null
): SystemStatsBounds => {
  const availableWidth = Math.max(
    1,
    parent.clientWidth - SYSTEM_STATS_MARGIN * 2
  );
  const availableHeight = Math.max(
    1,
    parent.clientHeight - SYSTEM_STATS_MARGIN * 2
  );
  const measuredRect = element?.getBoundingClientRect();
  const width = clamp(measuredRect?.width ?? 1, 1, availableWidth);
  const height = clamp(measuredRect?.height ?? 1, 1, availableHeight);
  const x = position?.x ?? SYSTEM_STATS_MARGIN;
  const y =
    position?.y ??
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
  const rndRef = useRef<Rnd | null>(null);
  /* Keep the user's chosen size while the visible bounds are clamped on smaller screens. */
  const preferredBoundsRef = useRef<SystemStatsBounds | null>(null);
  const messagePositionRef = useRef<Position | null>(null);
  const [displayMode, setDisplayMode] =
    useState<SystemStatsDisplayMode>('message');
  const [bounds, setBounds] = useState<SystemStatsBounds | null>(null);
  const hasBounds = bounds !== null;

  useLayoutEffect(() => {
    const parent = playerAreaRef.current;

    if (!visible) {
      preferredBoundsRef.current = null;
      messagePositionRef.current = null;
      setDisplayMode('message');
      setBounds(null);
      return;
    }

    if (parent === null) {
      return;
    }

    const resizePanel = () => {
      const nextBounds =
        displayMode === 'message'
          ? getSystemStatsMessageBounds(
              parent,
              rndRef.current?.resizableElement.current ?? null,
              messagePositionRef.current
            )
          : getSystemStatsBounds(parent, preferredBoundsRef.current);

      /* First open starts at the bottom left with the default size. */
      if (displayMode === 'stats' && preferredBoundsRef.current === null) {
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
    const element = rndRef.current?.resizableElement.current;
    if (element !== undefined && element !== null) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [displayMode, hasBounds, visible]);

  const handleDragStop = useCallback(
    (_event: unknown, data: Position) => {
      const parent = playerAreaRef.current;

      if (parent === null) {
        return;
      }

      setBounds((current) => {
        if (current === null) {
          return current;
        }

        if (displayMode === 'message') {
          const nextBounds = getSystemStatsMessageBounds(
            parent,
            rndRef.current?.resizableElement.current ?? null,
            {
              x: data.x,
              y: data.y
            }
          );
          messagePositionRef.current = {
            x: data.x,
            y: data.y
          };

          return sameSystemStatsBounds(current, nextBounds)
            ? current
            : nextBounds;
        }

        /* Dragging changes position but keeps the preferred size. */
        const preferredBounds = {
          ...(preferredBoundsRef.current ?? current),
          x: data.x,
          y: data.y
        };
        const nextBounds = getSystemStatsBounds(parent, preferredBounds);

        preferredBoundsRef.current = preferredBounds;

        return sameSystemStatsBounds(current, nextBounds)
          ? current
          : nextBounds;
      });
    },
    [displayMode]
  );

  const handleResizeStop = useCallback(
    (
      _event: unknown,
      _direction: unknown,
      element: HTMLElement,
      _delta: unknown,
      position: Position
    ) => {
      const parent = playerAreaRef.current;

      if (parent === null || displayMode === 'message') {
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
    [displayMode]
  );

  const handleDisplayModeChange = useCallback(
    (nextDisplayMode: SystemStatsDisplayMode) => {
      setDisplayMode(nextDisplayMode);
    },
    []
  );

  const handleMouseDownCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (isScrollbarMouseDown(event)) {
        event.stopPropagation();
      }
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
          ref={rndRef}
          bounds="parent"
          position={{ x: bounds.x, y: bounds.y }}
          size={{
            width: displayMode === 'message' ? 'auto' : bounds.width,
            height: displayMode === 'message' ? 'auto' : bounds.height
          }}
          minWidth={
            displayMode === 'message'
              ? 1
              : Math.min(SYSTEM_STATS_MIN_WIDTH, bounds.width)
          }
          minHeight={
            displayMode === 'message'
              ? 1
              : Math.min(SYSTEM_STATS_MIN_HEIGHT, bounds.height)
          }
          enableResizing={displayMode === 'stats'}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
          onMouseDownCapture={handleMouseDownCapture}
          /* NOTE: We need this for the inputs to work on touch screens: */
          cancel={SYSTEM_STATS_DRAG_CANCEL_SELECTOR}
          style={{
            zIndex: 10,
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '8px',
            borderRadius: '4px',
            boxSizing: 'border-box',
            cursor: 'move',
            overflow: displayMode === 'message' ? 'auto' : 'hidden',
            maxWidth:
              displayMode === 'message'
                ? `calc(100% - ${SYSTEM_STATS_MARGIN * 2}px)`
                : undefined,
            maxHeight:
              displayMode === 'message'
                ? `calc(100% - ${SYSTEM_STATS_MARGIN * 2}px)`
                : undefined
          }}
        >
          <SystemStats onDisplayModeChange={handleDisplayModeChange} />
        </Rnd>
      )}
      {children}
    </div>
  );
};
