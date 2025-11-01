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
import { Dimensions } from '../widget/widgetInterfaces';
import { useGlobalContext } from '../GlobalContext';
import { capitalizeFirstLetter } from '../../helpers/utils';
/* MUI */
import Box from '@mui/material/Box';
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
  const Xmin = -1.0;
  const Xmax = 1.0 - 2 * (wPx / Math.max(1, dims.pixelWidth));
  const Ymin = -1.0;
  const Ymax = 1.0 - 2 * (hPx / Math.max(1, dims.pixelHeight));

  const pw = Math.max(1, dims.pixelWidth - wPx);
  const ph = Math.max(1, dims.pixelHeight - hPx);

  let x = ((nx - Xmin) / (Xmax - Xmin)) * pw;
  let y = ((ny - Ymin) / (Ymax - Ymin)) * ph;

  /* Clamp into the video rect */
  x = Math.max(0, Math.min(x, pw));
  y = Math.max(0, Math.min(y, ph));

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
  const Xmin = -1.0;
  const Xmax = 1.0 - 2 * (wPx / Math.max(1, dims.pixelWidth));
  const Ymin = -1.0;
  const Ymax = 1.0 - 2 * (hPx / Math.max(1, dims.pixelHeight));

  const pw = Math.max(1, dims.pixelWidth - wPx);
  const ph = Math.max(1, dims.pixelHeight - hPx);

  const nx = (x / pw) * (Xmax - Xmin) + Xmin;
  const ny = (y / ph) * (Ymax - Ymin) + Ymin;

  return { nx, ny };
}

/******************************************************************************/
/* One draggable overlay box */

const MOVE_THRESHOLD = 5;

interface OverlayBoxProps {
  overlay: ImageOverlay | TextOverlay;
  dimensions: Dimensions;
  isActive: boolean;
  onSelect: (id: number) => void;
}

const OverlayBox: React.FC<OverlayBoxProps> = ({
  overlay,
  dimensions,
  isActive,
  onSelect
}) => {
  /* Global context */
  const {
    updateImageOverlay,
    updateTextOverlay,
    activeDraggableOverlay,
    setActiveDraggableOverlay
  } = useOverlayContext();
  const { appSettings, activeDraggableWidget } = useGlobalContext();

  /* Refs */
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);

  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

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
    return { wPx: wStream * scaleX, hPx: hStream * scaleY };
  }, [
    overlay.size,
    dimensions.pixelWidth,
    dimensions.pixelHeight,
    dimensions.videoWidth,
    dimensions.videoHeight
  ]);

  /* Compute pixel position */
  const { x, y } = useMemo(() => {
    if (typeof overlay.position === 'string') {
      switch (overlay.position) {
        case 'topLeft':
          return { x: 0, y: 0 };
        case 'topRight':
          return { x: dimensions.pixelWidth - wPx, y: 0 };
        case 'bottomLeft':
          return { x: 0, y: dimensions.pixelHeight - hPx };
        case 'bottomRight':
          return {
            x: dimensions.pixelWidth - wPx,
            y: dimensions.pixelHeight - hPx
          };
        case 'center':
          return {
            x: (dimensions.pixelWidth - wPx) / 2,
            y: (dimensions.pixelHeight - hPx) / 2
          };
        default:
          return { x: 0, y: 0 };
      }
    }
    if (Array.isArray(overlay.position)) {
      return normalizedToPixel(overlay.position, dimensions, wPx, hPx);
    }
    return { x: 0, y: 0 };
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
  const handleStart = useCallback(
    (_: any, data: any) => {
      suppressClickRef.current = false;
      setDragStartPos({ x: data.x, y: data.y });
      setActiveDraggableOverlay({ id: overlay.identity, active: true });
    },
    [overlay.identity, setActiveDraggableOverlay]
  );

  /* On drag stop: update backend position */
  const handleStop = useCallback(
    (_: any, data: any) => {
      setAlignmentGuides({
        showVerticalCenter: false,
        showHorizontalCenter: false,
        showTop: false,
        showBottom: false,
        showLeft: false,
        showRight: false
      });

      if (dragStartPos) {
        const dist = Math.hypot(
          data.x - dragStartPos.x,
          data.y - dragStartPos.y
        );
        if (dist >= MOVE_THRESHOLD) {
          /* ignore the click following this drag */
          suppressClickRef.current = true;
        }
      }
      setDragStartPos(null);

      const { nx, ny } = pixelToNormalized(
        data.x,
        data.y,
        dimensions,
        wPx,
        hPx
      );

      const updated = { ...overlay, position: [nx, ny] as [number, number] };

      if ('overlayPath' in overlay) {
        updateImageOverlay(updated as ImageOverlay);
      } else {
        updateTextOverlay(updated as TextOverlay);
      }

      /* Reset draggable state */
      setActiveDraggableOverlay({ id: overlay.identity, active: false });
    },
    [
      overlay,
      dimensions,
      wPx,
      hPx,
      updateImageOverlay,
      updateTextOverlay,
      setActiveDraggableOverlay,
      dragStartPos
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

  /****************************************************************************/

  return (
    <>
      <Draggable
        nodeRef={nodeRef as React.RefObject<HTMLElement>}
        position={dragPos}
        bounds={{
          left: 0,
          top: 0,
          right: Math.max(0, dimensions.pixelWidth - wPx),
          bottom: Math.max(0, dimensions.pixelHeight - hPx)
        }}
        onStart={handleStart}
        onDrag={(e, data) => {
          setDragPos({ x: data.x, y: data.y });
          handleDrag(e, data);
        }}
        onStop={(e, data) => {
          handleStop(e, data);
          setDragPos({ x: data.x, y: data.y });
        }}
      >
        <Box
          ref={nodeRef}
          onClick={handleClick}
          sx={{
            width: `${wPx}px`,
            height: `${hPx}px`,
            border: activeDraggableOverlay?.active
              ? activeDraggableOverlay.id === overlay.identity
                ? `${bboxThickness} solid ${bboxColor}` /* only the dragged one solid */
                : `2px dashed rgba(200, 200, 200, 1)` /* everyone else dashed during drag */
              : isActive
                ? `${bboxThickness} solid ${bboxColor}` /* normal: selected solid */
                : `2px dashed rgba(200, 200, 200, 1)` /* others dashed */,

            borderRadius: appSettings.roundedBboxCorners ? '8px' : '0px',
            position: 'absolute',
            pointerEvents: 'auto',
            cursor: 'move',
            backgroundColor:
              isActive && activeDraggableWidget?.highlight
                ? `${bboxColor}4D`
                : 'transparent',
            zIndex: isActive ? 1000 : 1,
            opacity: appSettings.bboxOnlyShowActive && !isActive ? 0 : 1
          }}
        >
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
        </Box>
      </Draggable>

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
  const { activeOverlays, activeOverlayId, onSelectOverlay, listOverlays } =
    useOverlayContext();
  const { currentChannel } = useGlobalContext();

  /* List overlays once on mount */
  useEffect(() => {
    listOverlays();
  }, []);

  if (dimensions.videoWidth === 0 || dimensions.videoHeight === 0) {
    return null;
  }

  return (
    /* Overlay bounding boxes */
    <div
      style={{
        // backgroundColor: 'purple',
        position: 'absolute',
        top: `${dimensions.offsetY}px`,
        left: `${dimensions.offsetX}px`,
        width: `${dimensions.pixelWidth}px`,
        height: `${dimensions.pixelHeight}px`,
        pointerEvents: 'none',
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
          <OverlayBox
            key={overlay.identity}
            overlay={overlay}
            dimensions={dimensions}
            isActive={overlay.identity === activeOverlayId}
            onSelect={onSelectOverlay}
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
