/* PrivacyMaskCanvas
 *
 * Interactive polygon editor rendered over the visible video area.
 *
 * - Click a mask to select it, drag it to move it.
 * - Drag a corner handle to move a corner.
 * - Drag an edge midpoint handle to insert a new corner.
 * - Double-click (or right-click) a corner to remove it.
 * - Click outside any mask to deselect.
 *
 * Masks are stored in the reference frame and mapped to screen space here.
 * Edits are only sent to the device when the pointer is released.
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
  translatePolygon
} from './privacyMaskUtils';

interface PrivacyMaskCanvasProps {
  dimensions: Dimensions;
}

/* Active pointer interaction.
 * start is in screen space (CSS px), origin/points in the reference frame so
 * that masks partly outside a cropped stream are bounded by the real image.
 */
interface DragState {
  kind: 'move' | 'vertex';
  id: number;
  pointerId: number;
  index: number;
  start: MaskPoint;
  moved: boolean;
  origin: MaskPoint[];
  points: MaskPoint[];
}

const SELECTION_COLORS: Record<string, string> = {
  yellow: '#ffcc33',
  blue: '#00aaff',
  red: '#ff4444',
  green: '#00cc00',
  purple: '#d633ff'
};

const PREVIEW_FILLS: Record<MaskColor, string> = {
  black: '#000000',
  grey: '#808080',
  white: '#ffffff',
  red: '#e53935',
  mosaic: 'url(#privacy-mask-mosaic)'
};

const HANDLE_RADIUS = 6;
const MIDPOINT_RADIUS = 4;
/* Pointer movement (px) before a click on a mask is treated as a drag */
const DRAG_THRESHOLD = 2;
/* Max time (ms) between two presses on a corner to count as a double-click.
 * Detected manually since pointer capture retargets native dblclick events.
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

  /* Report the stream size so the stream rotation can be re-read on change */
  useEffect(() => {
    setStreamSize({ width: videoWidth, height: videoHeight });
  }, [videoWidth, videoHeight, setStreamSize]);

  useEffect(() => () => setStreamSize(null), [setStreamSize]);

  const updateDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  /* Reference frame -> screen space */
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

  /* Screen space -> reference frame */
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

  /* Screen space -> unclamped reference frame, used for drag deltas */
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

  const screenMasks = useMemo(
    () =>
      masks.map((mask) => ({
        mask,
        points: mask.points.map(toScreen)
      })),
    [masks, toScreen]
  );

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

  /* Send the edit to the device if the polygon changed */
  const commitPoints = useCallback(
    (id: number, referencePoints: MaskPoint[]) => {
      const mask = masks.find((m) => m.id === id);
      if (mask && !pointsEqual(referencePoints, mask.points)) {
        updateMaskPoints(id, referencePoints);
      }
    },
    [masks, updateMaskPoints]
  );

  const beginDrag = (
    event: React.PointerEvent<SVGElement>,
    kind: DragState['kind'],
    id: number,
    origin: MaskPoint[],
    points: MaskPoint[],
    index: number,
    moved: boolean
  ) => {
    const position = getPointerPosition(event);
    if (!position) {
      return;
    }
    svgRef.current?.setPointerCapture(event.pointerId);
    updateDrag({
      kind,
      id,
      pointerId: event.pointerId,
      index,
      start: position,
      moved,
      origin,
      points
    });
  };

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
    beginDrag(event, 'move', id, points, points, -1, false);
  };

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
    beginDrag(event, 'vertex', id, points, points, index, false);
  };

  /* Insert a corner at an edge midpoint and start dragging it */
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
    beginDrag(event, 'vertex', id, points, inserted, afterIndex + 1, true);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = dragRef.current;
    if (!frame || !current || current.pointerId !== event.pointerId) {
      return;
    }
    const position = getPointerPosition(event);
    if (!position) {
      return;
    }
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
    /* Move the whole polygon, bounded by the full image (not the crop) */
    const from = toReferenceRaw(current.start);
    const to = toReferenceRaw(position);
    updateDrag({
      ...current,
      moved,
      points: translatePolygon(
        current.origin,
        to.x - from.x,
        to.y - from.y,
        frame
      )
    });
  };

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

  /* Click on empty video area deselects */
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

      {screenMasks.map(({ mask, points: maskPoints }) => {
        const isSelected = mask.id === selectedMaskId;
        const isDragged = drag?.id === mask.id;
        const refPoints = isDragged ? drag.points : mask.points;
        const points = isDragged ? refPoints.map(toScreen) : maskPoints;
        if (points.length === 0) {
          return null;
        }
        const pointString = points.map((p) => `${p.x},${p.y}`).join(' ');
        const labelPoint = points.reduce(
          (top, p) => (p.y < top.y || (p.y === top.y && p.x < top.x) ? p : top),
          points[0]
        );
        const canInsert = points.length < capabilities.maxCorners;
        const canRemove = points.length > MIN_MASK_CORNERS;

        return (
          <g key={mask.id} data-mask-id={mask.id}>
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
              onPointerDown={(event) => startMove(event, mask.id, refPoints)}
            >
              <title>
                {mask.name}
                {mask.enabled ? '' : ' (disabled)'}
              </title>
            </polygon>

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
                      startInsertVertex(event, mask.id, refPoints, index)
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
                    startVertexDrag(event, mask.id, refPoints, index)
                  }
                  onContextMenu={(event) =>
                    removeVertex(event, mask.id, refPoints, index)
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
