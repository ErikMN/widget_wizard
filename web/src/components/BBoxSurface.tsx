/**
 * BBoxSurface
 *
 * A unified bounding-box surface for both Widgets and Overlays.
 * Replaces the separate WidgetBBox and OverlayBBox surfaces.
 */
import React, { useRef, useEffect, useState } from 'react';
import { Dimensions } from './appInterface';
import { useAppContext } from './AppContext';
import PtzCrosshairControl from './PtzCrosshairControl';

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
  const { currentChannel, appSettings } = useAppContext();

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
  const [stableDimensions, setStableDimensions] = useState<Dimensions | null>(
    null
  );

  /* Only one bbox system should have an active bbox at any time:
   * If widget activates: deactivate overlay.
   * If overlay activates: deactivate widget.
   *
   * NOTE:
   * lastActiveRef is required to avoid flicker: without it, both systems may
   * briefly appear to be active during a state transition which causes each
   * branch to deactivate the other in the same render pass.
   */
  const lastActiveRef = useRef<'widget' | 'overlay' | null>(null);

  useEffect(() => {
    const widgetActive =
      activeDraggableWidget && activeDraggableWidget.id !== null;

    const overlayActive =
      activeDraggableOverlay && activeDraggableOverlay.id !== null;

    /* Widget activated: deactivate overlay */
    if (widgetActive && lastActiveRef.current !== 'widget') {
      setActiveDraggableOverlay({
        id: null,
        active: false,
        highlight: false
      });
      onSelectOverlay(null);
      lastActiveRef.current = 'widget';
      return;
    }

    /* Overlay activated: deactivate widget */
    if (overlayActive && lastActiveRef.current !== 'overlay') {
      setActiveDraggableWidget({
        id: null,
        active: false,
        clickBBox: false,
        highlight: false
      });
      setOpenWidgetId(null);
      lastActiveRef.current = 'overlay';
      return;
    }

    /* Neither active */
    if (!widgetActive && !overlayActive) {
      lastActiveRef.current = null;
    }
  }, [
    activeDraggableWidget,
    activeDraggableOverlay,
    setActiveDraggableWidget,
    setActiveDraggableOverlay,
    setOpenWidgetId,
    onSelectOverlay
  ]);

  const liveHasRenderArea =
    dimensions.pixelWidth > 0 && dimensions.pixelHeight > 0;
  const liveHasStreamDimensions =
    dimensions.videoWidth > 0 && dimensions.videoHeight > 0;

  /* Keep the last known-good stream dimensions so UI overlays remain stable
   * during brief invalid samples (e.g. tab visibility switches).
   */
  useEffect(() => {
    if (!liveHasRenderArea || !liveHasStreamDimensions) {
      return;
    }
    setStableDimensions(dimensions);
  }, [dimensions, liveHasRenderArea, liveHasStreamDimensions]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    /* Ignore while dragging */
    if (activeDraggableWidget?.active || activeDraggableOverlay?.active) {
      return;
    }

    /* Ignore PTZ crosshair interactions */
    const target = e.target as HTMLElement;
    if (target.closest('[data-ptz-crosshair="true"]')) {
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

  const surfaceDimensions =
    liveHasRenderArea && liveHasStreamDimensions
      ? dimensions
      : (stableDimensions ?? (liveHasRenderArea ? dimensions : null));
  const hasStreamDimensions = liveHasStreamDimensions;

  if (!surfaceDimensions) {
    return null;
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        position: 'absolute',
        top: `${surfaceDimensions.offsetY}px`,
        left: `${surfaceDimensions.offsetX}px`,
        width: `${surfaceDimensions.pixelWidth}px`,
        height: `${surfaceDimensions.pixelHeight}px`,
        zIndex: 5 /* Must be above the video player */,
        pointerEvents: 'auto'
      }}
    >
      {/* Render widget bboxes */}
      {hasStreamDimensions &&
        showWidgets &&
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
                dimensions={surfaceDimensions}
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
      {hasStreamDimensions &&
        showOverlays &&
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
              dimensions={surfaceDimensions}
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

      {/* PTZ crosshair control */}
      <PtzCrosshairControl
        currentChannel={currentChannel}
        enabled={!!appSettings.enablePtzCrosshair}
      />
    </div>
  );
};

export default BBoxSurface;
