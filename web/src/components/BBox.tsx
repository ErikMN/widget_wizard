/**
 * Draggable bounding boxes to be overlaid on a video surface
 */
import React, { useCallback, useMemo } from 'react';
import Draggable from 'react-draggable';
import AnchorIndicators from './AnchorIndicators';
import { Widget } from './widget/widgetInterfaces';
import { capitalizeFirstLetter } from '../helpers/utils';
import { Dimensions } from './widget/widgetInterfaces';
import {
  HD_WIDTH,
  getWidgetPixelPosition,
  calculateWidgetSizeInPixels,
  calculateNormalizedPosition,
  getNormalizedCoordinateRanges
} from '../helpers/bboxhelper';
import { useGlobalContext } from './GlobalContext';
/* MUI */
import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import Typography from '@mui/material/Typography';

/******************************************************************************/
/* One BBox with scaling logic and click handlers */

const EPSILON = 1e-6;
const MOVE_THRESHOLD = 5; /* Increase for bigger anchor move threshold */

/* Anchor snap zones: */
const CORNER_THRESHOLD = 5;
const CENTER_DISTANCE_THRESHOLD = 10;

const TOPBOTTOM_THRESHOLD_X = 20;
const TOPBOTTOM_THRESHOLD_Y = 5;

const LEFTRIGHT_THRESHOLD_X = 5;
const LEFTRIGHT_THRESHOLD_Y = 20;

interface BBoxProps {
  widget: Widget;
  dimensions: Dimensions;
}

const BBox: React.FC<BBoxProps> = React.memo(({ widget, dimensions }) => {
  /* Return null if dimensions.videoWidth or dimensions.videoHeight is 0 */
  if (dimensions.videoWidth === 0 || dimensions.videoHeight === 0) {
    return null;
  }

  /* Local state */
  const [dragStartPos, setDragStartPos] = React.useState<{
    x: number;
    y: number;
  } | null>(null);

  /* Global context */
  const {
    appSettings,
    activeWidgets,
    setActiveWidgets,
    updateWidget,
    activeDraggableWidget,
    setActiveDraggableWidget,
    openDropdownIndex,
    setOpenDropdownIndex
  } = useGlobalContext();

  /* BBox colors */
  const bboxColor = useMemo(() => {
    const colorMappings: Record<string, string> = {
      yellow: '#ffcc33',
      blue: '#00aaff',
      red: '#ff4444',
      green: '#00cc00',
      purple: '#d633ff',
      none: 'none'
    };
    return colorMappings[appSettings.bboxColor] || '#ffcc33';
  }, [appSettings.bboxColor]);

  /* BBox thickness */
  const bboxThickness = useMemo(() => {
    const thicknessMappings: Record<string, string> = {
      small: '1px',
      medium: '2px',
      large: '4px'
    };
    return thicknessMappings[appSettings.bboxThickness];
  }, [appSettings.bboxThickness]);

  /* Widget backend uses 1920x1080 HD resolution */
  const scaleFactor = dimensions.pixelWidth / HD_WIDTH || 1;

  /* Set bounding box position based on anchor */
  const getAnchoredPosition = (anchor: string, dimensions: Dimensions) => {
    switch (anchor) {
      case 'topLeft':
        return { x: -1, y: -1 };
      case 'topCenter':
        return {
          x: (dimensions.pixelWidth - widget.width * scaleFactor) / 2,
          y: -1
        };
      case 'topRight':
        return {
          x: dimensions.pixelWidth - widget.width * scaleFactor + 1,
          y: -1
        };
      case 'centerLeft':
        return {
          x: -1,
          y: (dimensions.pixelHeight - widget.height * scaleFactor) / 2
        };
      case 'center':
        return {
          x: (dimensions.pixelWidth - widget.width * scaleFactor) / 2,
          y: (dimensions.pixelHeight - widget.height * scaleFactor) / 2
        };
      case 'centerRight':
        return {
          x: dimensions.pixelWidth - widget.width * scaleFactor + 1,
          y: (dimensions.pixelHeight - widget.height * scaleFactor) / 2
        };
      case 'bottomLeft':
        return {
          x: -1,
          y: dimensions.pixelHeight - widget.height * scaleFactor + 1
        };
      case 'bottomCenter':
        return {
          x: (dimensions.pixelWidth - widget.width * scaleFactor) / 2,
          y: dimensions.pixelHeight - widget.height * scaleFactor + 1
        };
      case 'bottomRight':
        return {
          x: dimensions.pixelWidth - widget.width * scaleFactor + 1,
          y: dimensions.pixelHeight - widget.height * scaleFactor + 1
        };
      default:
        return { x: 0, y: 0 };
    }
  };

  /* Adjust position if widget is anchored */
  const anchoredPosition = useMemo(() => {
    if (widget.generalParams.anchor !== 'none') {
      return getAnchoredPosition(widget.generalParams.anchor, dimensions);
    }
    /* Fall back to normal position if no anchor is set */
    return getWidgetPixelPosition(
      dimensions,
      scaleFactor,
      widget.generalParams.position,
      widget.width,
      widget.height
    );
  }, [
    widget.generalParams.anchor,
    dimensions,
    scaleFactor,
    widget.generalParams.position,
    widget.width,
    widget.height
  ]);

  /* Handle drag start */
  const handleDragStart = useCallback(
    (widget: Widget, x: number, y: number) => {
      // console.log(
      //   `Dragging started for widget ${widget.generalParams.id} at position (${x}, ${y})`
      // );
      setDragStartPos({ x, y });
      setActiveDraggableWidget({
        id: widget.generalParams.id,
        active: true,
        clickBBox: false,
        highlight: false
      });
    },
    [setActiveDraggableWidget]
  );

  /* Handle drag stop */
  const handleDragStop = useCallback(
    (widget: Widget, newX: number, newY: number) => {
      // console.log(
      //   `handleDragStop called for widget ${widget.generalParams.id} at position (${newX}, ${newY})`
      // );
      if (!dragStartPos) {
        console.warn('dragStartPos not set!');
        return;
      }
      /* Calculate how far the user actually moved */
      const dist = Math.sqrt(
        (newX - dragStartPos.x) ** 2 + (newY - dragStartPos.y) ** 2
      );
      /* If movement < MOVE_THRESHOLD and anchored: don't move */
      if (dist < MOVE_THRESHOLD && widget.generalParams.anchor !== 'none') {
        if (appSettings.debug) {
          console.warn('Did not move anchored widget enough! Dist:', dist);
        }
        /* Do not remove anchor */
        setActiveDraggableWidget({
          id: widget.generalParams.id,
          active: false,
          clickBBox: false,
          highlight: false
        });
        setDragStartPos(null);
        return;
      }
      if (dimensions.pixelWidth <= 0 || dimensions.pixelHeight <= 0) {
        console.error('Invalid dimensions detected');
        return;
      }
      const { widgetWidthPx, widgetHeightPx } = calculateWidgetSizeInPixels(
        widget.width,
        widget.height,
        scaleFactor,
        dimensions
      );
      /* Edges for auto-anchoring */
      const minX = 0;
      const minY = 0;
      const maxX = dimensions.pixelWidth - widgetWidthPx;
      const maxY = dimensions.pixelHeight - widgetHeightPx;

      /* Check corner-based positions */
      const isNearTopLeft =
        newX < minX + CORNER_THRESHOLD && newY < minY + CORNER_THRESHOLD;
      const isNearTopRight =
        newX > maxX - CORNER_THRESHOLD && newY < minY + CORNER_THRESHOLD;
      const isNearBottomLeft =
        newX < minX + CORNER_THRESHOLD && newY > maxY - CORNER_THRESHOLD;
      const isNearBottomRight =
        newX > maxX - CORNER_THRESHOLD && newY > maxY - CORNER_THRESHOLD;

      /* Check center-based positions */
      const widgetCenterX = newX + widgetWidthPx / 2;
      const widgetCenterY = newY + widgetHeightPx / 2;
      const videoCenterX = dimensions.pixelWidth / 2;
      const videoCenterY = dimensions.pixelHeight / 2;

      const isNearTopCenter =
        Math.abs(widgetCenterX - videoCenterX) < TOPBOTTOM_THRESHOLD_X &&
        newY < minY + TOPBOTTOM_THRESHOLD_Y;
      const isNearBottomCenter =
        Math.abs(widgetCenterX - videoCenterX) < TOPBOTTOM_THRESHOLD_X &&
        newY > maxY - TOPBOTTOM_THRESHOLD_Y;
      const isNearCenterLeft =
        Math.abs(widgetCenterY - videoCenterY) < LEFTRIGHT_THRESHOLD_Y &&
        newX < minX + LEFTRIGHT_THRESHOLD_X;
      const isNearCenterRight =
        Math.abs(widgetCenterY - videoCenterY) < LEFTRIGHT_THRESHOLD_Y &&
        newX > maxX - LEFTRIGHT_THRESHOLD_X;
      /* Full center */
      const centerDist = Math.sqrt(
        (widgetCenterX - videoCenterX) ** 2 +
          (widgetCenterY - videoCenterY) ** 2
      );
      const isNearCenter = centerDist < CENTER_DISTANCE_THRESHOLD;

      /* Set anchor based on position */
      let finalAnchor = 'none';
      if (isNearTopLeft) {
        finalAnchor = 'topLeft';
      } else if (isNearTopRight) {
        finalAnchor = 'topRight';
      } else if (isNearBottomLeft) {
        finalAnchor = 'bottomLeft';
      } else if (isNearBottomRight) {
        finalAnchor = 'bottomRight';
      } else if (isNearTopCenter) {
        finalAnchor = 'topCenter';
      } else if (isNearBottomCenter) {
        finalAnchor = 'bottomCenter';
      } else if (isNearCenterLeft) {
        finalAnchor = 'centerLeft';
      } else if (isNearCenterRight) {
        finalAnchor = 'centerRight';
      } else if (isNearCenter) {
        finalAnchor = 'center';
      }

      const { Xmin, Xmax, Ymin, Ymax } = getNormalizedCoordinateRanges(
        widgetWidthPx,
        widgetHeightPx,
        dimensions
      );
      /* Calculate new normalized positions */
      let posX = calculateNormalizedPosition(
        newX,
        Xmin,
        Xmax,
        widgetWidthPx,
        dimensions.pixelWidth
      );
      let posY = calculateNormalizedPosition(
        newY,
        Ymin,
        Ymax,
        widgetHeightPx,
        dimensions.pixelHeight
      );

      /* Clamping logic */

      /* Horizontal Movement: Always allow if widgetWidthPx < dimensions.pixelWidth */
      if (widgetWidthPx < dimensions.pixelWidth) {
        posX = Math.max(Xmin, Math.min(posX, Xmax));
      } else {
        /* If the widget is as wide as the video, it can still move vertically */
        posX = Xmin;
      }

      /* Vertical Movement: Always allow if widgetHeightPx < dimensions.pixelHeight */
      if (widgetHeightPx < dimensions.pixelHeight) {
        posY = Math.max(Ymin, Math.min(posY, Ymax));
      } else {
        /* If the widget is as tall as the video, it can still move horizontally */
        posY = Ymin;
      }

      /* Compare with current position */
      const currentPosX = widget.generalParams.position.x;
      const currentPosY = widget.generalParams.position.y;

      /* Only update if the position has changed */
      if (
        Math.abs(posX - currentPosX) > EPSILON ||
        Math.abs(posY - currentPosY) > EPSILON ||
        finalAnchor !== widget.generalParams.anchor
      ) {
        const updatedWidget = {
          ...widget,
          generalParams: {
            ...widget.generalParams,
            position: { x: posX, y: posY },
            anchor: finalAnchor,
            ...(appSettings.widgetAutoBringFront ? { depth: 'front' } : {})
          }
        };
        /* Update the active widget state */
        setActiveWidgets((prevWidgets) =>
          prevWidgets.map((w) =>
            w.generalParams.id === widget.generalParams.id ? updatedWidget : w
          )
        );
        /* Update the widget */
        updateWidget(updatedWidget);
      }

      setActiveDraggableWidget({
        id: widget.generalParams.id,
        active: false,
        clickBBox: false,
        highlight: false
      });
    },
    [
      dimensions,
      scaleFactor,
      setActiveWidgets,
      setActiveDraggableWidget,
      updateWidget,
      dragStartPos,
      appSettings.widgetAutoBringFront
    ]
  );

  /* widgetAutoBringFront enabled will trigger an update call for every click on the widget */
  const setDepth = useCallback(
    (mode: string, widget: Widget) => {
      const updatedWidget = {
        ...widget,
        generalParams: {
          ...widget.generalParams,
          depth: mode
        }
      };
      updateWidget(updatedWidget);
    },
    [updateWidget]
  );

  /* Handle clicking the bbox */
  const handleBBoxClick = useCallback(
    (widget: Widget) => {
      // console.log(`clicked widget ${widget.generalParams.id}`);
      const index = activeWidgets.findIndex(
        (w) => w.generalParams.id === widget.generalParams.id
      );
      if (index !== -1) {
        const isCurrentlyOpen = openDropdownIndex === index;
        setActiveDraggableWidget({
          id: widget.generalParams.id,
          active: false,
          clickBBox: !isCurrentlyOpen,
          highlight: false
        });
        /* Toggle dropdown: close if open, open if closed */
        setOpenDropdownIndex(isCurrentlyOpen ? null : index);
      }
      if (appSettings.widgetAutoBringFront) {
        setDepth('front', widget);
      }
    },
    [
      activeWidgets,
      openDropdownIndex,
      setActiveDraggableWidget,
      setOpenDropdownIndex
    ]
  );

  const handleClick = !appSettings.widgetDoubleClick
    ? () => handleBBoxClick(widget)
    : undefined;
  const handleDoubleClick = appSettings.widgetDoubleClick
    ? () => handleBBoxClick(widget)
    : undefined;

  const { x, y } = anchoredPosition;

  const widgetIsActive = activeDraggableWidget?.id === widget.generalParams.id;

  return (
    /* Wrap Draggable in div to handle click events */
    <div
      onClick={handleClick} /* Regular click */
      onDoubleClick={handleDoubleClick} /* Double-click */
      onTouchEnd={() => handleBBoxClick(widget)} /* Touch display click */
    >
      <Fade in={true} timeout={500}>
        <div>
          <Draggable
            key={`${widget.generalParams.id}-${x}-${y}`}
            position={{ x, y }}
            bounds={{
              left: 0,
              top: 0,
              right: dimensions.pixelWidth - widget.width * scaleFactor,
              bottom: dimensions.pixelHeight - widget.height * scaleFactor
            }}
            onStart={(e, data) => handleDragStart(widget, data.x, data.y)}
            onStop={(e, data) => handleDragStop(widget, data.x, data.y)}
          >
            <Box
              sx={{
                width: `${widget.width * scaleFactor}px`,
                height: `${widget.height * scaleFactor}px`,
                border: widgetIsActive
                  ? `${bboxThickness} solid ${bboxColor}`
                  : `2px dashed rgba(200, 200, 200, 1)`,
                borderRadius: appSettings.roundedBboxCorners ? '8px' : '0px',
                position: 'absolute',
                pointerEvents: 'auto',
                cursor: 'move',
                backgroundColor:
                  widgetIsActive && activeDraggableWidget?.highlight
                    ? 'rgba(255, 255, 255, 0.3)'
                    : 'transparent',
                zIndex: widgetIsActive ? 1000 : 1,
                opacity:
                  appSettings.bboxOnlyShowActive &&
                  activeDraggableWidget?.id !== widget.generalParams.id
                    ? 0
                    : 1
              }}
            >
              {/* Anchor point indicators */}
              <AnchorIndicators
                widget={widget}
                scaleFactor={scaleFactor}
                bboxColor={
                  widgetIsActive ? bboxColor : 'rgba(200, 200, 200, 1)'
                }
                bboxAnchorIndicator={appSettings.bboxAnchorIndicator}
              />
              {/* Widget info note above the bbox */}
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
                  {capitalizeFirstLetter(widget.generalParams.type)} ID:{' '}
                  {widget.generalParams.id}
                </Typography>
              )}
            </Box>
          </Draggable>
        </div>
      </Fade>
    </div>
  );
});

/******************************************************************************/
/* Widget BBoxes for all widgets in activeWidgets */

interface WidgetBBoxProps {
  dimensions: Dimensions;
  showBoundingBoxes?: boolean;
}

const WidgetBBox: React.FC<WidgetBBoxProps> = ({
  dimensions,
  showBoundingBoxes = true
}) => {
  /* Global context */
  const { activeWidgets } = useGlobalContext();

  return (
    <div>
      {/* Widget bounding boxes */}
      {showBoundingBoxes && (
        /* BBox surface */
        <div
          style={{
            // backgroundColor: 'blue',
            position: 'absolute',
            pointerEvents: 'none',
            top: `${dimensions.offsetY}px`,
            left: `${dimensions.offsetX}px`,
            width: `${dimensions.pixelWidth}px`,
            height: `${dimensions.pixelHeight}px`,
            zIndex: 1
          }}
        >
          {activeWidgets.map((widget: Widget) => {
            if (
              /* HACK: Until channel can be selected in videoplayer don't show BBox on other channels than -1 and 1 */
              widget.generalParams.isVisible &&
              (widget.generalParams.channel === -1 ||
                widget.generalParams.channel === 1)
            ) {
              return (
                /* One BBox per active widget */
                <BBox
                  key={widget.generalParams.id}
                  widget={widget}
                  dimensions={dimensions}
                />
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
};

/******************************************************************************/
/* Exports */

export { BBox, WidgetBBox };
