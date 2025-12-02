/**
 * BBoxSurface
 *
 * A unified bounding-box surface for both Widgets and Overlays.
 * Replaces the separate WidgetBBox and OverlayBBox surfaces.
 */
import React, { useRef } from 'react';
import { Dimensions } from './appInterface';
import { useAppContext } from './AppContext';

/* Widget bbox */
import { useWidgetContext } from './widget/WidgetContext';
import { WidgetBox } from './widget/WidgetBBox';

/* Overlay bbox */
import { useOverlayContext } from './overlay/OverlayContext';
import { OverlayBox } from './overlay/OverlayBBox';

interface BBoxSurfaceProps {
  dimensions: Dimensions;
  showWidgets: boolean;
  showOverlays: boolean;
}

const BBoxSurface: React.FC<BBoxSurfaceProps> = ({
  dimensions,
  showWidgets,
  showOverlays
}) => {
  /* App context */
  const { currentChannel } = useAppContext();

  /* Widget context */
  const {
    activeWidgets,
    activeDraggableWidget,
    setActiveDraggableWidget,
    setOpenWidgetId
  } = useWidgetContext();

  /* Overlay context */
  const {
    activeOverlays,
    activeDraggableOverlay,
    onSelectOverlay,
    setActiveDraggableOverlay
  } = useOverlayContext();

  /* Refs */
  const widgetRefs = useRef<Map<number, HTMLElement>>(new Map());
  const overlayRefs = useRef<Map<number, HTMLElement>>(new Map());

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    /* Ignore while dragging */
    if (activeDraggableWidget?.active || activeDraggableOverlay?.active) {
      return;
    }

    /* Click inside any widget bbox? */
    for (const [, el] of widgetRefs.current) {
      if (el.contains(e.target as Node)) {
        return;
      }
    }

    /* Click inside any overlay bbox? */
    for (const [, el] of overlayRefs.current) {
      if (el.contains(e.target as Node)) {
        return;
      }
    }

    /* Click outside any bbox */
    setActiveDraggableWidget({
      id: null,
      active: false,
      clickBBox: false,
      highlight: false
    });
    setOpenWidgetId(null);

    setActiveDraggableOverlay({
      id: null,
      active: false,
      highlight: false
    });
    onSelectOverlay(null);
  };

  if (dimensions.videoWidth === 0 || dimensions.videoHeight === 0) {
    return null;
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        position: 'absolute',
        top: `${dimensions.offsetY}px`,
        left: `${dimensions.offsetX}px`,
        width: `${dimensions.pixelWidth}px`,
        height: `${dimensions.pixelHeight}px`,
        zIndex: 5 /* Must be above the video player */,
        pointerEvents: 'auto'
      }}
    >
      {/* Render widget bboxes */}
      {showWidgets &&
        activeWidgets.map((widget) => {
          if (
            widget.generalParams.isVisible &&
            (widget.generalParams.channel === -1 ||
              String(widget.generalParams.channel) === currentChannel)
          ) {
            const widgetId = widget.generalParams.id;
            return (
              <WidgetBox
                key={widgetId}
                widget={widget}
                dimensions={dimensions}
                registerRef={(el) => {
                  if (el) {
                    widgetRefs.current.set(widgetId, el);
                  } else {
                    widgetRefs.current.delete(widgetId);
                  }
                }}
              />
            );
          }
          return null;
        })}

      {/* Render overlay bboxes */}
      {showOverlays &&
        activeOverlays
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
              onSelect={onSelectOverlay}
              registerRef={(el) => {
                if (el) {
                  overlayRefs.current.set(overlay.identity, el);
                } else {
                  overlayRefs.current.delete(overlay.identity);
                }
              }}
            />
          ))}
    </div>
  );
};

export default BBoxSurface;
