/* PrivacyMaskCanvas
 *
 * Mask editor drawn on top of the video.
 *
 * - Click a mask to select it, drag it to move it.
 * - Drag a corner handle to move a corner.
 * - Drag the small handle in the middle of an edge to add a corner.
 * - Double-click (or right-click) a corner to remove it.
 * - Click outside any mask to deselect.
 *
 * Masks are stored in sensor coordinates (see privacyMaskUtils.ts) and are
 * converted to screen pixels here. Changes are sent to the camera when the
 * mouse button is released, not while dragging.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Dimensions } from '../appInterface';
import { useAppSettingsContext } from '../context/AppContext';
import { usePrivacyMaskContext } from './PrivacyMaskContext';
import { MaskColor, MaskPoint } from './privacyMaskInterfaces';
import {
  MIN_MASK_CORNERS,
  clamp,
  referenceToStream,
  streamToReference,
  streamToReferenceRaw,
  getVisibleBounds,
  translatePolygon
} from './privacyMaskUtils';

interface PrivacyMaskCanvasProps {
  dimensions: Dimensions;
}

/* The drag in progress */
interface DragState {
  /* Moving the whole mask, or a single corner */
  kind: 'move' | 'vertex';
  /* The mask being dragged */
  id: number;
  /* Which mouse/finger is dragging */
  pointerId: number;
  /* The corner being dragged (only for 'vertex') */
  index: number;
  /* Where the drag started, in screen pixels */
  start: MaskPoint;
  /* Whether the pointer has moved enough to count as a drag (not a click) */
  moved: boolean;
  /* The mask's corners before the drag, in sensor coordinates */
  origin: MaskPoint[];
  /* The mask's corners during the drag, in sensor coordinates */
  points: MaskPoint[];
}

/* The fields a drag starts with; the pointer and start position are added */
type DragStart = Omit<DragState, 'pointerId' | 'start'>;

/* Outline color of the selected mask, from the app's bounding box setting */
const SELECTION_COLORS: Record<string, string> = {
  yellow: '#ffcc33',
  blue: '#00aaff',
  red: '#ff4444',
  green: '#00cc00',
  purple: '#d633ff'
};

/* Fill used to preview each camera mask color (mosaic uses a pattern) */
const PREVIEW_FILLS: Record<MaskColor, string> = {
  black: '#000000',
  grey: '#808080',
  white: '#ffffff',
  red: '#e53935',
  mosaic: 'url(#privacy-mask-mosaic)'
};

const HANDLE_RADIUS = 6;
const MIDPOINT_RADIUS = 4;
/* How far (px) the pointer must move before a click becomes a drag */
const DRAG_THRESHOLD = 2;
/* Max time (ms) between two presses on a corner to count as a double-click.
 * The browser's own double-click event does not reach the corner while a drag
 * is active, so double-clicks are detected by hand.
 */
const DOUBLE_PRESS_MS = 400;

const pointsEqual = (a: MaskPoint[], b: MaskPoint[]): boolean =>
  a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);

const PrivacyMaskCanvas: React.FC<PrivacyMaskCanvasProps> = ({
  dimensions
}) => {
  /* Global context */
  const { appSettings } = useAppSettingsContext();
  const {
    frame,
    rotation,
    appearance,
    masks,
    selectedMaskId,
    setSelectedMaskId,
    setStreamSize,
    updateMaskPoints,
    capabilities
  } = usePrivacyMaskContext();

  /* Local state */
  const [drag, setDrag] = useState<DragState | null>(null);

  /* Refs */
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const lastVertexPressRef = useRef<{
    id: number;
    index: number;
    time: number;
  } | null>(null);

  const { videoWidth, videoHeight, pixelWidth, pixelHeight } = dimensions;
  const selectionColor =
    SELECTION_COLORS[appSettings.bboxColor] ?? SELECTION_COLORS.yellow;

  /* Tell the context the video size. A new size means a new stream, and the
   * context then reads the camera's rotation again.
   */
  useEffect(() => {
    setStreamSize({ width: videoWidth, height: videoHeight });
  }, [videoWidth, videoHeight, setStreamSize]);

  useEffect(() => () => setStreamSize(null), [setStreamSize]);

  /* Keep the drag in a ref as well, so pointer handlers always see the latest
   * value without waiting for a re-render.
   */
  const updateDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  /* Sensor coordinates -> screen pixels */
  const toScreen = useCallback(
    (point: MaskPoint): MaskPoint => {
      if (!frame) {
        return point;
      }
      const stream = referenceToStream(
        point,
        frame,
        rotation,
        videoWidth,
        videoHeight
      );
      return {
        x: (stream.x * pixelWidth) / videoWidth,
        y: (stream.y * pixelHeight) / videoHeight
      };
    },
    [frame, rotation, videoWidth, videoHeight, pixelWidth, pixelHeight]
  );

  /* Screen pixels -> sensor coordinates (whole pixels inside the image) */
  const toReference = useCallback(
    (point: MaskPoint): MaskPoint => {
      if (!frame) {
        return point;
      }
      return streamToReference(
        {
          x: (point.x * videoWidth) / pixelWidth,
          y: (point.y * videoHeight) / pixelHeight
        },
        frame,
        rotation,
        videoWidth,
        videoHeight
      );
    },
    [frame, rotation, videoWidth, videoHeight, pixelWidth, pixelHeight]
  );

  /* Screen pixels -> sensor coordinates without rounding or limits, used to
   * measure how far a mask was dragged
   */
  const toReferenceRaw = useCallback(
    (point: MaskPoint): MaskPoint => {
      if (!frame) {
        return point;
      }
      return streamToReferenceRaw(
        {
          x: (point.x * videoWidth) / pixelWidth,
          y: (point.y * videoHeight) / pixelHeight
        },
        frame,
        rotation,
        videoWidth,
        videoHeight
      );
    },
    [frame, rotation, videoWidth, videoHeight, pixelWidth, pixelHeight]
  );

  /* Masks can only be dragged within the part of the image that is visible */
  const visibleBounds = useMemo(
    () =>
      frame ? getVisibleBounds(frame, rotation, videoWidth, videoHeight) : null,
    [frame, rotation, videoWidth, videoHeight]
  );

  const screenMasks = useMemo(
    () =>
      masks.map((mask) => ({
        mask,
        points: mask.points.map(toScreen)
      })),
    [masks, toScreen]
  );

  /* Pointer position in screen pixels, relative to the video's top-left corner */
  const getPointerPosition = useCallback(
    (event: React.PointerEvent | PointerEvent): MaskPoint | null => {
      const svg = svgRef.current;
      if (!svg) {
        return null;
      }
      const rect = svg.getBoundingClientRect();
      return {
        x: clamp(event.clientX - rect.left, 0, rect.width),
        y: clamp(event.clientY - rect.top, 0, rect.height)
      };
    },
    []
  );

  /* Send the new shape to the camera if it changed */
  const commitPoints = useCallback(
    (id: number, referencePoints: MaskPoint[]) => {
      const mask = masks.find((m) => m.id === id);
      if (mask && !pointsEqual(referencePoints, mask.points)) {
        updateMaskPoints(id, referencePoints);
      }
    },
    [masks, updateMaskPoints]
  );

  /* Start a drag. Pointer capture keeps the drag going even if the pointer
   * leaves the mask or the video.
   */
  const beginDrag = (
    event: React.PointerEvent<SVGElement>,
    dragStart: DragStart
  ) => {
    const position = getPointerPosition(event);
    if (!position) {
      return;
    }
    svgRef.current?.setPointerCapture(event.pointerId);
    updateDrag({ ...dragStart, pointerId: event.pointerId, start: position });
  };

  /* Left mouse button on a mask: select it and start moving it */
  const startMove = (
    event: React.PointerEvent<SVGElement>,
    id: number,
    points: MaskPoint[]
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    setSelectedMaskId(id);
    beginDrag(event, {
      kind: 'move',
      id,
      index: -1,
      moved: false,
      origin: points,
      points
    });
  };

  /* Remove a corner. A mask always keeps at least three corners. */
  const removeVertex = (
    event: React.SyntheticEvent,
    id: number,
    points: MaskPoint[],
    index: number
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (points.length <= MIN_MASK_CORNERS) {
      return;
    }
    commitPoints(
      id,
      points.filter((_, i) => i !== index)
    );
  };

  /* Left mouse button on a corner: start moving it, or remove it if this is
   * the second press of a double-click
   */
  const startVertexDrag = (
    event: React.PointerEvent<SVGElement>,
    id: number,
    points: MaskPoint[],
    index: number
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    const last = lastVertexPressRef.current;
    const now = event.timeStamp;
    if (
      last &&
      last.id === id &&
      last.index === index &&
      now - last.time < DOUBLE_PRESS_MS
    ) {
      lastVertexPressRef.current = null;
      removeVertex(event, id, points, index);
      return;
    }
    lastVertexPressRef.current = { id, index, time: now };
    beginDrag(event, {
      kind: 'vertex',
      id,
      index,
      moved: false,
      origin: points,
      points
    });
  };

  /* Add a corner in the middle of an edge and start dragging it */
  const startInsertVertex = (
    event: React.PointerEvent<SVGElement>,
    id: number,
    points: MaskPoint[],
    afterIndex: number
  ) => {
    if (event.button !== 0 || points.length >= capabilities.maxCorners) {
      return;
    }
    event.stopPropagation();
    const a = points[afterIndex];
    const b = points[(afterIndex + 1) % points.length];
    const inserted = [
      ...points.slice(0, afterIndex + 1),
      { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) },
      ...points.slice(afterIndex + 1)
    ];
    /* Counts as moved right away, so the new corner is saved even without
     * dragging it further
     */
    beginDrag(event, {
      kind: 'vertex',
      id,
      index: afterIndex + 1,
      moved: true,
      origin: points,
      points: inserted
    });
  };

  /* Update the mask shape while dragging (only on screen, nothing is sent) */
  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = dragRef.current;
    if (!visibleBounds || !current || current.pointerId !== event.pointerId) {
      return;
    }
    const position = getPointerPosition(event);
    if (!position) {
      return;
    }
    /* Ignore tiny movements so a plain click does not change the mask */
    const moved =
      current.moved ||
      Math.abs(position.x - current.start.x) > DRAG_THRESHOLD ||
      Math.abs(position.y - current.start.y) > DRAG_THRESHOLD;
    if (!moved) {
      return;
    }
    if (current.kind === 'vertex') {
      const points = current.points.slice();
      points[current.index] = toReference(position);
      updateDrag({ ...current, moved, points });
      return;
    }
    /* Move the whole mask by the distance dragged, within the visible image */
    const from = toReferenceRaw(current.start);
    const to = toReferenceRaw(position);
    updateDrag({
      ...current,
      moved,
      points: translatePolygon(
        current.origin,
        to.x - from.x,
        to.y - from.y,
        visibleBounds
      )
    });
  };

  /* Mouse button released: end the drag and save the new shape.
   * A cancelled pointer (e.g. the browser took over a touch) saves nothing.
   */
  const finishDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
    updateDrag(null);
    if (event.type !== 'pointercancel' && current.moved) {
      commitPoints(current.id, current.points);
    }
  };

  /* Clicking on the video outside any mask deselects */
  const handleBackgroundPointerDown = (
    event: React.PointerEvent<SVGSVGElement>
  ) => {
    if (event.target === svgRef.current && event.button === 0) {
      setSelectedMaskId(null);
    }
  };

  if (!frame || videoWidth <= 0 || videoHeight <= 0) {
    return null;
  }

  /* Outline thickness follows the app's bounding box setting */
  const strokeWidth =
    appSettings.bboxThickness === 'small'
      ? 1
      : appSettings.bboxThickness === 'large'
        ? 3
        : 2;

  return (
    <svg
      ref={svgRef}
      width={pixelWidth}
      height={pixelHeight}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        cursor: drag?.kind === 'move' ? 'grabbing' : 'default'
      }}
    >
      <defs>
        {/* Checkered pattern to preview the mosaic mask color */}
        <pattern
          id="privacy-mask-mosaic"
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
        >
          <rect width="12" height="12" fill="#777" />
          <rect width="6" height="6" fill="#444" />
          <rect x="6" y="6" width="6" height="6" fill="#aaa" />
        </pattern>
      </defs>

      {screenMasks.map(({ mask, points: savedScreenPoints }) => {
        const isSelected = mask.id === selectedMaskId;
        /* While dragging, show the shape being dragged instead of the saved one */
        const isDragged = drag?.id === mask.id;
        const sensorPoints = isDragged ? drag.points : mask.points;
        const points = isDragged
          ? sensorPoints.map(toScreen)
          : savedScreenPoints;
        if (points.length === 0) {
          return null;
        }
        const pointString = points.map((p) => `${p.x},${p.y}`).join(' ');
        /* The name label is placed above the top-most corner */
        const labelPoint = points.reduce(
          (top, p) => (p.y < top.y || (p.y === top.y && p.x < top.x) ? p : top),
          points[0]
        );
        const canInsert = points.length < capabilities.maxCorners;
        const canRemove = points.length > MIN_MASK_CORNERS;

        return (
          <g key={mask.id} data-mask-id={mask.id}>
            {/* Semi-transparent so the video stays visible. Disabled masks
             * are faint with a dashed outline.
             */}
            <polygon
              points={pointString}
              fill={PREVIEW_FILLS[appearance.color]}
              fillOpacity={mask.enabled ? (isSelected ? 0.45 : 0.3) : 0.1}
              stroke={isSelected ? selectionColor : '#ffffff'}
              strokeOpacity={isSelected ? 1 : 0.8}
              strokeWidth={strokeWidth}
              strokeDasharray={mask.enabled ? undefined : '6 4'}
              strokeLinejoin="round"
              style={{ cursor: isSelected ? 'move' : 'pointer' }}
              onPointerDown={(event) => startMove(event, mask.id, sensorPoints)}
            >
              <title>
                {mask.name}
                {mask.enabled ? '' : ' (disabled)'}
              </title>
            </polygon>

            {/* Kept inside the video even if the corner is cropped out */}
            {appSettings.bboxLabel && (
              <text
                x={clamp(labelPoint.x, 2, Math.max(2, pixelWidth - 40))}
                y={clamp(labelPoint.y - 6, 12, pixelHeight - 4)}
                fill={isSelected ? selectionColor : '#ffffff'}
                fontSize={12}
                fontWeight="bold"
                paintOrder="stroke"
                stroke="rgba(0,0,0,0.8)"
                strokeWidth={3}
                style={{ pointerEvents: 'none' }}
              >
                {mask.name}
              </text>
            )}

            {/* Edge midpoint handles: drag to insert a corner */}
            {isSelected &&
              canInsert &&
              !drag &&
              points.map((a, index) => {
                const b = points[(index + 1) % points.length];
                return (
                  <circle
                    key={`mid-${index}`}
                    cx={(a.x + b.x) / 2}
                    cy={(a.y + b.y) / 2}
                    r={MIDPOINT_RADIUS}
                    fill={selectionColor}
                    fillOpacity={0.5}
                    stroke="#000"
                    strokeOpacity={0.6}
                    style={{ cursor: 'copy' }}
                    onPointerDown={(event) =>
                      startInsertVertex(event, mask.id, sensorPoints, index)
                    }
                  >
                    <title>Drag to add a corner</title>
                  </circle>
                );
              })}

            {/* Corner handles */}
            {isSelected &&
              points.map((p, index) => (
                <circle
                  key={`vertex-${index}`}
                  cx={p.x}
                  cy={p.y}
                  r={HANDLE_RADIUS}
                  fill="#ffffff"
                  stroke={selectionColor}
                  strokeWidth={2}
                  style={{ cursor: 'crosshair' }}
                  onPointerDown={(event) =>
                    startVertexDrag(event, mask.id, sensorPoints, index)
                  }
                  onContextMenu={(event) =>
                    removeVertex(event, mask.id, sensorPoints, index)
                  }
                >
                  <title>
                    {canRemove
                      ? 'Drag to move, double-click to remove corner'
                      : 'Drag to move corner'}
                  </title>
                </circle>
              ))}
          </g>
        );
      })}
    </svg>
  );
};

export default PrivacyMaskCanvas;
