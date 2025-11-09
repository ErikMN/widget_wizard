/**
 * OverlayBBox:
 * Draggable bounding boxes for image/text overlays.
 * Operates in normalized coordinates [-1..1] relative to the video frame.
 * Position and size scale according to the current video dimensions.
 */
import React, {
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useState
} from 'react';
import Draggable from 'react-draggable';
import { useOverlayContext } from './OverlayContext';
import { ImageOverlay, TextOverlay } from './overlayInterfaces';
import { Dimensions } from '../appInterface';
import { useGlobalContext } from '../GlobalContext';
import { capitalizeFirstLetter } from '../../helpers/utils';
import { useParameters } from '../ParametersContext';
import { playSound } from '../../helpers/utils';
import lockSoundUrl from '../../assets/audio/lock.oga';
import unlockSoundUrl from '../../assets/audio/unlock.oga';
import OverlayAnchorIndicators from './OverlayAnchorIndicators';
/* MUI */
import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import Typography from '@mui/material/Typography';

/**
 * Map normalized top-left coords [-1..1] to pixel coords, with size-aware range.
 * Xmin = -1
 * Xmax = 1 - 2*(wPx/pixelW)
 * Same for Y.
 */
function normalizedToPixel(
  [nx, ny]: [number, number],
  dims: Dimensions,
  wPx: number,
  hPx: number
) {
  const pixelW = Math.max(1, dims.pixelWidth);
  const pixelH = Math.max(1, dims.pixelHeight);

  const safeW = Math.min(wPx, pixelW);
  const safeH = Math.min(hPx, pixelH);

  const Xmin = -1.0;
  const Xmax = Math.max(Xmin + 0.0001, 1.0 - 2 * (safeW / pixelW));
  const Ymin = -1.0;
  const Ymax = Math.max(Ymin + 0.0001, 1.0 - 2 * (safeH / pixelH));

  const pw = Math.max(1, pixelW - safeW);
  const ph = Math.max(1, pixelH - safeH);

  let x = ((nx - Xmin) / (Xmax - Xmin)) * pw;
  let y = ((ny - Ymin) / (Ymax - Ymin)) * ph;

  /* Clamp into the video rect */
  x = Math.max(0, Math.min(x, pixelW - safeW));
  y = Math.max(0, Math.min(y, pixelH - safeH));

  return { x, y };
}

/* NOTE: Inverse: pixel top-left -> normalized top-left [-1..1], size-aware. */
function pixelToNormalized(
  x: number,
  y: number,
  dims: Dimensions,
  wPx: number,
  hPx: number
) {
  const pixelW = Math.max(1, dims.pixelWidth);
  const pixelH = Math.max(1, dims.pixelHeight);

  const safeW = Math.min(wPx, pixelW);
  const safeH = Math.min(hPx, pixelH);

  const Xmin = -1.0;
  const Xmax = Math.max(Xmin + 0.0001, 1.0 - 2 * (safeW / pixelW));
  const Ymin = -1.0;
  const Ymax = Math.max(Ymin + 0.0001, 1.0 - 2 * (safeH / pixelH));

  const pw = Math.max(1, pixelW - safeW);
  const ph = Math.max(1, pixelH - safeH);

  const clampedX = Math.max(0, Math.min(x, pixelW - safeW));
  const clampedY = Math.max(0, Math.min(y, pixelH - safeH));

  let nx = (clampedX / pw) * (Xmax - Xmin) + Xmin;
  let ny = (clampedY / ph) * (Ymax - Ymin) + Ymin;

  /* Ensure finite numbers, never null/NaN (NOTE: remove this?) */
  if (!Number.isFinite(nx)) {
    nx = 0;
  }
  if (!Number.isFinite(ny)) {
    ny = 0;
  }

  return { nx, ny };
}

/******************************************************************************/
/* One draggable overlay box */

const EPSILON = 1e-6;
const MOVE_THRESHOLD = 5;

/* Anchor snap zones in percent: */
const TOPBOTTOM_THRESHOLD_Y_PERCENT = 0.005;
const LEFTRIGHT_THRESHOLD_X_PERCENT = 0.005;

interface OverlayBoxProps {
  overlay: ImageOverlay | TextOverlay;
  dimensions: Dimensions;
  isActive: boolean;
  onSelect: (id: number) => void;
  registerRef?: (el: HTMLElement | null) => void;
}

const OverlayBox: React.FC<OverlayBoxProps> = ({
  overlay,
  dimensions,
  isActive,
  onSelect,
  registerRef
}) => {
  /* Global context */
  const {
    updateImageOverlay,
    updateTextOverlay,
    activeDraggableOverlay,
    setActiveDraggableOverlay
  } = useOverlayContext();
  const { appSettings, activeDraggableWidget } = useGlobalContext();

  /* Local state */
  const [showIndicators, setShowIndicators] = React.useState<boolean>(true);
  const [rotation, setRotation] = useState<number>(
    'rotation' in overlay ? (overlay.rotation ?? 0) : 0
  );
  const [isRotating, setIsRotating] = useState(false);

  /* Global parameter list */
  const { parameters } = useParameters();
  const Resolution = parameters?.['root.Image.I0.Appearance.Resolution'];

  // console.log(Resolution);

  /* Refs */
  const nodeRef = useRef<HTMLElement | null>(null);
  const suppressClickRef = useRef(false);
  const rotationStartRef = useRef<{
    angleStart: number;
    mouseStart: { x: number; y: number };
  } | null>(null);

  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const baseWidth = useMemo(() => {
    if (typeof Resolution === 'string') {
      const m = Resolution.match(/^(\d+)\s*x\s*(\d+)/i);
      if (m && m[1]) {
        const parsed = parseInt(m[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
    /* Fallback */
    return 1920;
  }, [Resolution]);

  /* Same bboxColor + thickness as widgets */
  const bboxColor = useMemo(() => {
    const colorMappings: Record<string, string> = {
      yellow: '#ffcc33',
      blue: '#00aaff',
      red: '#ff4444',
      green: '#00cc00',
      purple: '#d633ff'
    };
    return colorMappings[appSettings.bboxColor] || '#ffcc33';
  }, [appSettings.bboxColor]);

  const bboxThickness = useMemo(() => {
    const thicknessMappings: Record<string, string> = {
      small: '1px',
      medium: '2px',
      large: '4px'
    };
    return thicknessMappings[appSettings.bboxThickness];
  }, [appSettings.bboxThickness]);

  /* Scale overlay.size (stream px) to display px */
  const { wPx, hPx } = useMemo(() => {
    const [wStream, hStream] = Array.isArray(overlay.size)
      ? overlay.size
      : [100, 50];

    const videoW = Math.max(1, dimensions.videoWidth);
    const videoH = Math.max(1, dimensions.videoHeight);

    const scaleX = dimensions.pixelWidth / videoW;
    const scaleY = dimensions.pixelHeight / videoH;

    let wPx = 0;
    let hPx = 0;

    /* HACK: filter out image overlays */
    const isImageOverlay = 'overlayPath' in overlay;
    const isTextOverlay = !isImageOverlay;

    if (isImageOverlay && overlay.scalable) {
      /* Scalable image overlays */
      const scaleFactor = dimensions.pixelWidth / baseWidth;
      wPx = wStream * scaleFactor;
      hPx = hStream * scaleFactor;
    } else if (isTextOverlay) {
      /* Text overlays scale better when tied to the vertical resolution
       * FIXME: This is not 100% correct but quite close, it will work on common resolutions.
       */
      const scaleFactor = dimensions.pixelHeight / 1080;
      wPx = wStream * scaleFactor;
      hPx = hStream * scaleFactor;
    } else {
      /* Non-scalable image overlays */
      wPx = wStream * scaleX;
      hPx = hStream * scaleY;
    }

    /* Cap bbox so it can never be larger than the visible frame */
    const maxW = dimensions.pixelWidth;
    const maxH = dimensions.pixelHeight;
    wPx = Math.min(wPx, maxW);
    hPx = Math.min(hPx, maxH);

    return { wPx, hPx };
  }, [
    overlay.size,
    overlay.scalable,
    dimensions.pixelWidth,
    dimensions.pixelHeight,
    dimensions.videoWidth,
    dimensions.videoHeight
  ]);

  /* Compute pixel position */
  const { x, y } = useMemo(() => {
    let px = 0;
    let py = 0;

    if (typeof overlay.position === 'string') {
      switch (overlay.position) {
        case 'topLeft':
          px = 0;
          py = 0;
          break;
        case 'topRight':
          px = dimensions.pixelWidth - wPx;
          py = 0;
          break;
        case 'bottomLeft':
          px = 0;
          py = dimensions.pixelHeight - hPx;
          break;
        case 'bottomRight':
          px = dimensions.pixelWidth - wPx;
          py = dimensions.pixelHeight - hPx;
          break;
        case 'center':
          px = (dimensions.pixelWidth - wPx) / 2;
          py = (dimensions.pixelHeight - hPx) / 2;
          break;
        default:
          px = 0;
          py = 0;
          break;
      }
    } else if (Array.isArray(overlay.position)) {
      ({ x: px, y: py } = normalizedToPixel(
        overlay.position,
        dimensions,
        wPx,
        hPx
      ));
    }

    px = Math.max(0, Math.min(px, dimensions.pixelWidth - wPx));
    py = Math.max(0, Math.min(py, dimensions.pixelHeight - hPx));

    return { x: px, y: py };
  }, [
    overlay.position,
    dimensions.pixelWidth,
    dimensions.pixelHeight,
    wPx,
    hPx
  ]);

  /* Alignment guides (shown while dragging) */
  const [alignmentGuides, setAlignmentGuides] = useState<{
    showVerticalCenter: boolean;
    showHorizontalCenter: boolean;
    showTop: boolean;
    showBottom: boolean;
    showLeft: boolean;
    showRight: boolean;
  }>({
    showVerticalCenter: false,
    showHorizontalCenter: false,
    showTop: false,
    showBottom: false,
    showLeft: false,
    showRight: false
  });

  /* On drag start: make this overlay the active draggable */
  const handleDragStart = useCallback(
    (_: any, data: any) => {
      suppressClickRef.current = false;
      setDragStartPos({ x: data.x, y: data.y });
      setActiveDraggableOverlay({
        id: overlay.identity,
        active: true,
        highlight: false
      });
    },
    [overlay.identity, setActiveDraggableOverlay]
  );

  /* Handle drag stop */
  const handleDragStop = useCallback(
    (_: any, data: any) => {
      setShowIndicators(true);
      // console.log(
      //   `handleDragStop called for overlay ${overlay.identity} at position (${data.x}, ${data.y})`
      // );
      if (!dragStartPos) {
        console.warn('dragStartPos not set!');
        return;
      }

      /* Calculate how far the user actually moved */
      const dist = Math.hypot(data.x - dragStartPos.x, data.y - dragStartPos.y);
      /* If it actually moved, ignore the next click that follows mouse-up */
      if (dist >= MOVE_THRESHOLD) {
        suppressClickRef.current = true;
      }
      /* If movement < MOVE_THRESHOLD and anchored: don't move */
      if (dist < MOVE_THRESHOLD) {
        if (appSettings.debug) {
          console.warn(
            `Overlay ${overlay.identity}: movement below threshold (${dist.toFixed(
              2
            )})`
          );
        }

        /* Do not remove anchor */
        setActiveDraggableOverlay({
          id: overlay.identity,
          active: false,
          highlight: false
        });

        setDragStartPos(null);
        setAlignmentGuides({
          showVerticalCenter: false,
          showHorizontalCenter: false,
          showTop: false,
          showBottom: false,
          showLeft: false,
          showRight: false
        });
        return;
      }
      if (dimensions.pixelWidth <= 0 || dimensions.pixelHeight <= 0) {
        console.error('Invalid dimensions detected');
        return;
      }
      /* Compute snapping thresholds */
      const thresholdX = LEFTRIGHT_THRESHOLD_X_PERCENT * dimensions.pixelWidth;
      const thresholdY = TOPBOTTOM_THRESHOLD_Y_PERCENT * dimensions.pixelHeight;

      /* Determine proximity to corners */
      const nearLeft = data.x < thresholdX;
      const nearRight =
        Math.abs(data.x + wPx - dimensions.pixelWidth) < thresholdX;
      const nearTop = data.y < thresholdY;
      const nearBottom =
        Math.abs(data.y + hPx - dimensions.pixelHeight) < thresholdY;

      /* Set anchor based on position */
      let finalAnchor = 'none';
      if (nearTop && nearLeft) {
        finalAnchor = 'topLeft';
      } else if (nearTop && nearRight) {
        finalAnchor = 'topRight';
      } else if (nearBottom && nearLeft) {
        finalAnchor = 'bottomLeft';
      } else if (nearBottom && nearRight) {
        finalAnchor = 'bottomRight';
      }
      /* Don't use auto anchor if alignment guide is disabled */
      if (!appSettings.snapToAnchor) {
        finalAnchor = 'none';
      }
      /* Play sound if auto anchored */
      const prevAnchor =
        typeof overlay.position === 'string' ? overlay.position : 'none';

      if (prevAnchor !== finalAnchor) {
        if (prevAnchor !== 'none' && finalAnchor === 'none') {
          playSound(unlockSoundUrl);
        } else {
          playSound(lockSoundUrl);
        }
      }
      /* Snap to anchor coordinates */
      let snappedX = data.x;
      let snappedY = data.y;
      if (finalAnchor === 'topLeft') {
        snappedX = 0;
        snappedY = 0;
      } else if (finalAnchor === 'topRight') {
        snappedX = dimensions.pixelWidth - wPx;
        snappedY = 0;
      } else if (finalAnchor === 'bottomLeft') {
        snappedX = 0;
        snappedY = dimensions.pixelHeight - hPx;
      } else if (finalAnchor === 'bottomRight') {
        snappedX = dimensions.pixelWidth - wPx;
        snappedY = dimensions.pixelHeight - hPx;
      }

      /* Convert to normalized coordinates */
      const { nx, ny } = pixelToNormalized(
        snappedX,
        snappedY,
        dimensions,
        wPx,
        hPx
      );

      /* Build updated overlay object */
      const updated =
        finalAnchor !== 'none'
          ? { ...overlay, position: finalAnchor }
          : { ...overlay, position: [nx, ny] as [number, number] };

      /* Only update if the position has changed */
      const oldPos =
        Array.isArray(overlay.position) && overlay.position.length === 2
          ? overlay.position
          : [0, 0];

      const [oldX, oldY] = oldPos;

      const changed =
        finalAnchor !== 'none' ||
        Math.abs(nx - oldX) > EPSILON ||
        Math.abs(ny - oldY) > EPSILON;

      if (changed) {
        if ('overlayPath' in overlay) {
          updateImageOverlay(updated as ImageOverlay);
        } else {
          updateTextOverlay(updated as TextOverlay);
        }
      }

      /* Reset draggable state */
      setActiveDraggableOverlay({
        id: overlay.identity,
        active: false,
        highlight: false
      });

      setAlignmentGuides({
        showVerticalCenter: false,
        showHorizontalCenter: false,
        showTop: false,
        showBottom: false,
        showLeft: false,
        showRight: false
      });
      /* Reset drag start */
      setDragStartPos(null);
    },
    [
      overlay,
      dimensions,
      wPx,
      hPx,
      updateImageOverlay,
      updateTextOverlay,
      setActiveDraggableOverlay,
      dragStartPos,
      showIndicators,
      appSettings.snapToAnchor,
      appSettings.debug
    ]
  );

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      /* Consume the suppressed click */
      suppressClickRef.current = false;
      return;
    }
    onSelect(overlay.identity);
  }, [onSelect, overlay.identity]);

  const overlayType = 'overlayPath' in overlay ? 'Image' : 'Text';

  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x, y });

  useEffect(() => {
    setDragPos({ x, y });
  }, [x, y]);

  /* Handle dragging: show guides */
  const handleDrag = useCallback(
    (_: any, data: any) => {
      setShowIndicators(false);

      if (!appSettings.snapToAnchor) {
        setAlignmentGuides({
          showVerticalCenter: false,
          showHorizontalCenter: false,
          showTop: false,
          showBottom: false,
          showLeft: false,
          showRight: false
        });
        return;
      }

      const nearVerticalCenter =
        Math.abs(data.x + wPx / 2 - dimensions.pixelWidth / 2) <
        dimensions.pixelWidth * 0.005;
      const nearHorizontalCenter =
        Math.abs(data.y + hPx / 2 - dimensions.pixelHeight / 2) <
        dimensions.pixelHeight * 0.005;
      const nearTop = data.y < dimensions.pixelHeight * 0.005;
      const nearBottom =
        Math.abs(data.y + hPx - dimensions.pixelHeight) <
        dimensions.pixelHeight * 0.005;
      const nearLeft = data.x < dimensions.pixelWidth * 0.005;
      const nearRight =
        Math.abs(data.x + wPx - dimensions.pixelWidth) <
        dimensions.pixelWidth * 0.005;

      setAlignmentGuides({
        showVerticalCenter: nearVerticalCenter,
        showHorizontalCenter: nearHorizontalCenter,
        showTop: nearTop,
        showBottom: nearBottom,
        showLeft: nearLeft,
        showRight: nearRight
      });
    },
    [appSettings.snapToAnchor, dimensions, wPx, hPx]
  );

  /* Sync rotation from context when overlay.rotation changes */
  useEffect(() => {
    if ('rotation' in overlay && typeof overlay.rotation === 'number') {
      setRotation(overlay.rotation);
    }
  }, [overlay]);

  /* Rotation handler */
  useEffect(() => {
    /* Exit if no rotation is in progress */
    if (!isRotating) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      /* Skip unless a rotation is in progress and the bbox element is mounted */
      if (!rotationStartRef.current || !nodeRef.current) {
        return;
      }

      const rect = nodeRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      /* Compute mouse angles in screen space */
      const start = rotationStartRef.current.mouseStart;
      const startAngle = Math.atan2(start.y - cy, start.x - cx);
      const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);

      /* Positive delta means clockwise rotation */
      const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI;
      const newRotation = rotationStartRef.current.angleStart + deltaDeg;

      setRotation(newRotation);
    };

    const handleMouseUp = () => {
      setIsRotating(false);
      rotationStartRef.current = null;

      /* Apply final rotation when the mouse is released */
      if ('rotation' in overlay) {
        const rounded = Math.round(rotation);
        const updated: TextOverlay = { ...overlay, rotation: rounded };
        updateTextOverlay(updated);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isRotating, rotation, overlay, updateTextOverlay]);

  /****************************************************************************/

  return (
    <>
      <Fade in={true} timeout={500}>
        <div>
          <Draggable
            nodeRef={nodeRef as React.RefObject<HTMLElement>}
            position={dragPos}
            bounds={{
              left: 0,
              top: 0,
              right: Math.max(0, dimensions.pixelWidth - wPx),
              bottom: Math.max(0, dimensions.pixelHeight - hPx)
            }}
            onStart={handleDragStart}
            onDrag={(e, data) => {
              setDragPos({ x: data.x, y: data.y });
              handleDrag(e, data);
            }}
            onStop={(e, data) => {
              handleDragStop(e, data);
              setDragPos({ x: data.x, y: data.y });
            }}
          >
            <Box
              ref={(el) => {
                nodeRef.current = el as HTMLElement | null;
                registerRef?.(el as HTMLElement | null);
              }}
              onClick={handleClick}
              sx={{
                width: `${wPx}px`,
                height: `${hPx}px`,
                position: 'absolute',
                pointerEvents: 'auto',
                cursor: isRotating ? 'grabbing' : 'move',
                zIndex: isActive ? 1000 : 1,
                opacity: appSettings.bboxOnlyShowActive && !isActive ? 0 : 1
              }}
            >
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  border:
                    activeDraggableOverlay?.id === overlay.identity
                      ? `${bboxThickness} solid ${bboxColor}`
                      : `2px dashed rgba(200, 200, 200, 1)`,
                  borderRadius: appSettings.roundedBboxCorners ? '8px' : '0px',
                  backgroundColor:
                    (isActive && activeDraggableWidget?.highlight) ||
                    (activeDraggableOverlay?.highlight &&
                      activeDraggableOverlay?.id === overlay.identity)
                      ? `${bboxColor}4D`
                      : 'transparent',
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  transition: isRotating ? 'none' : 'transform 0.05s linear',
                  position: 'relative'
                }}
              >
                {/* FIXME: Overlay anchor indicators (only for image overlays) */}
                {/* {'overlayPath' in overlay && (
                <OverlayAnchorIndicators
                  overlayAnchor={
                    typeof overlay.position === 'string'
                      ? overlay.position
                      : 'none'
                  }
                  wPx={wPx}
                  hPx={hPx}
                  bboxColor={bboxColor}
                  enabled={!!appSettings.bboxAnchorIndicator && showIndicators}
                  dashed={activeDraggableOverlay?.id !== overlay.identity}
                />
              )} */}
                {/* Overlay info note above the bbox */}
                {appSettings.bboxLabel && (
                  <Typography
                    sx={{
                      position: 'absolute',
                      top: '-20px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'rgba(255, 255, 255, 0.7)',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      color: '#333',
                      pointerEvents: 'none'
                    }}
                  >
                    {capitalizeFirstLetter(overlayType)} ID: {overlay.identity}
                  </Typography>
                )}
                {/* Show rotation handle if rotation is supported */}
                {'rotation' in overlay && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setIsRotating(true);
                      rotationStartRef.current = {
                        angleStart: rotation,
                        mouseStart: { x: e.clientX, y: e.clientY }
                      };
                    }}
                    /* Rotation handle style */
                    style={{
                      position: 'absolute',
                      bottom: '-10px',
                      right: '-10px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: bboxColor,
                      cursor: 'grab',
                      border: '1px solid #fff'
                    }}
                  />
                )}
              </Box>
            </Box>
          </Draggable>
        </div>
      </Fade>

      {/* Alignment guide */}
      {appSettings.snapToAnchor && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${dimensions.pixelWidth}px`,
            height: `${dimensions.pixelHeight}px`,
            pointerEvents: 'none',
            zIndex: 9999
          }}
        >
          {alignmentGuides.showVerticalCenter && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${dimensions.pixelWidth / 2}px`,
                width: '1px',
                backgroundColor: '#ffcc33'
              }}
            />
          )}
          {alignmentGuides.showHorizontalCenter && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${dimensions.pixelHeight / 2}px`,
                height: '1px',
                backgroundColor: '#ffcc33'
              }}
            />
          )}
          {alignmentGuides.showTop && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: '1px',
                backgroundColor: '#ffcc33'
              }}
            />
          )}
          {alignmentGuides.showBottom && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: '1px',
                backgroundColor: '#ffcc33'
              }}
            />
          )}
          {alignmentGuides.showLeft && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: '1px',
                backgroundColor: '#ffcc33'
              }}
            />
          )}
          {alignmentGuides.showRight && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: '1px',
                backgroundColor: '#ffcc33'
              }}
            />
          )}
        </div>
      )}
    </>
  );
};

/******************************************************************************/
/* Inner consumer of OverlayContext */

interface OverlayBBoxInnerProps {
  dimensions: Dimensions;
}

const OverlayBBoxInner: React.FC<OverlayBBoxInnerProps> = ({ dimensions }) => {
  /* Global context */
  const { currentChannel } = useGlobalContext();
  const {
    activeOverlays,
    activeOverlayId,
    onSelectOverlay,
    activeDraggableOverlay,
    setActiveDraggableOverlay
  } = useOverlayContext();

  /* Refs: keep live refs to all overlay bbox elements */
  const bboxRefs = useRef<Map<number, HTMLElement>>(new Map());

  /* Pointer-down handler: deactivate overlay if click is not inside any bbox */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    /* Ignore while dragging */
    if (activeDraggableOverlay?.active) {
      return;
    }
    /* Check all bbox refs */
    for (const [, el] of bboxRefs.current) {
      if (el.contains(e.target as Node)) {
        /* Click inside a bbox: return */
        return;
      }
    }
    /* Click outside any bbox: deactivate overlay */
    setActiveDraggableOverlay({ id: null, active: false, highlight: false });
    onSelectOverlay(null);
  };

  if (dimensions.videoWidth === 0 || dimensions.videoHeight === 0) {
    return null;
  }

  return (
    /* Overlay bounding boxes */
    <div
      onPointerDown={handlePointerDown}
      style={{
        // backgroundColor: 'purple',
        position: 'absolute',
        top: `${dimensions.offsetY}px`,
        left: `${dimensions.offsetX}px`,
        width: `${dimensions.pixelWidth}px`,
        height: `${dimensions.pixelHeight}px`,
        zIndex: 3
      }}
    >
      {activeOverlays
        .filter(
          (overlay) =>
            !('camera' in overlay) ||
            overlay.camera === -1 ||
            String(overlay.camera) === currentChannel
        )
        .map((overlay) => (
          /* One BBox per active overlay */
          <OverlayBox
            key={overlay.identity}
            overlay={overlay}
            dimensions={dimensions}
            isActive={overlay.identity === activeOverlayId}
            onSelect={onSelectOverlay}
            /* Each bbox has its own ref */
            registerRef={(el) => {
              if (el) {
                /* Mount: store the bbox element reference using overlay ID */
                bboxRefs.current.set(overlay.identity, el);
              } else {
                /* Unmount: remove the bbox reference by overlay ID */
                bboxRefs.current.delete(overlay.identity);
              }
            }}
          />
        ))}
    </div>
  );
};

/******************************************************************************/
/* Public wrapper (consumes shared OverlayProvider) */
interface OverlayBBoxProps {
  dimensions: Dimensions;
}

const OverlayBBox: React.FC<OverlayBBoxProps> = ({ dimensions }) => {
  return <OverlayBBoxInner dimensions={dimensions} />;
};

/******************************************************************************/
/* Exports */

export default OverlayBBox;
