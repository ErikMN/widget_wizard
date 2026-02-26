/**
 * PTZCrosshair
 *
 * Interactive crosshair overlay for PTZ camera control via mouse.
 * Displays a crosshair in the center of the video and allows click/drag
 * to control pan/tilt movements. The further from center, the faster the movement.
 * Mouse wheel/scroll controls zoom.
 */
import React, { useRef, useState, useEffect } from 'react';
import { Dimensions } from '../appInterface';
import { sendPtzMove, sendPtzZoom } from '../../helpers/usePTZControl';

interface PTZCrosshairProps {
  dimensions: Dimensions;
  currentChannel: string;
  /** Show crosshair (default: true) */
  visible?: boolean;
}

/* Maximum PTZ speed for pan/tilt */
const MAX_PTZ_SPEED = 100;

/* Deadzone radius in pixels (no movement within this radius from center) */
const DEADZONE_RADIUS = 30;

/**
 * Calculate PTZ speed based on distance from center
 * @param distance Distance in pixels from center
 * @param maxDistance Maximum distance (half of viewport dimension)
 * @returns Speed value between 0 and MAX_PTZ_SPEED
 */
const calculateSpeed = (distance: number, maxDistance: number): number => {
  if (distance < DEADZONE_RADIUS) {
    return 0;
  }
  /* Normalize distance to 0-1 range, accounting for deadzone */
  const normalizedDistance = Math.min(
    (distance - DEADZONE_RADIUS) / (maxDistance - DEADZONE_RADIUS),
    1
  );
  /* Apply ease-out curve for more natural control */
  const easedDistance = Math.pow(normalizedDistance, 1.5);
  return Math.round(easedDistance * MAX_PTZ_SPEED);
};

export const PTZCrosshair: React.FC<PTZCrosshairProps> = ({
  dimensions,
  currentChannel,
  visible = true
}) => {
  const [isActive, setIsActive] = useState(false);
  const [isPTZEnabled, setIsPTZEnabled] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null
  );
  const intervalRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Center point of the video */
  const centerX = dimensions.pixelWidth / 2;
  const centerY = dimensions.pixelHeight / 2;

  /* Send PTZ command based on mouse position */
  const sendPTZCommand = (mouseX: number, mouseY: number) => {
    /* Calculate distance from center */
    const deltaX = mouseX - centerX;
    const deltaY = centerY - mouseY; // Invert Y (screen coords vs camera coords)

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    /* Calculate max distance (use the smaller dimension to keep circular control) */
    const maxDistance = Math.min(centerX, centerY);

    /* Calculate speed based on distance */
    const speed = calculateSpeed(distance, maxDistance);

    if (speed === 0) {
      sendPtzMove(0, 0, currentChannel);
      return;
    }

    /* Calculate normalized direction */
    const angle = Math.atan2(deltaY, deltaX);
    const panSpeed = Math.round(Math.cos(angle) * speed);
    const tiltSpeed = Math.round(Math.sin(angle) * speed);

    sendPtzMove(panSpeed, tiltSpeed, currentChannel);
  };

  /* Handle mouse down - start PTZ control */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPTZEnabled) return;

    e.stopPropagation();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsActive(true);
    setMousePos({ x, y });

    /* Capture pointer for smooth dragging */
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    /* Send initial command */
    sendPTZCommand(x, y);

    /* Start continuous updates while holding */
    intervalRef.current = window.setInterval(() => {
      if (mousePos) {
        sendPTZCommand(mousePos.x, mousePos.y);
      }
    }, 100);
  };

  /* Handle mouse move - update PTZ direction */
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isActive || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });
    sendPTZCommand(x, y);
  };

  /* Handle mouse up - stop PTZ */
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isActive) return;

    e.stopPropagation();
    setIsActive(false);
    setMousePos(null);

    /* Release pointer capture */
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    /* Stop PTZ movement */
    sendPtzMove(0, 0, currentChannel);

    /* Clear interval */
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  /* Cleanup interval on unmount */
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      sendPtzMove(0, 0, currentChannel);
    };
  }, [currentChannel]);

  /* Track Ctrl/Cmd key for enabling PTZ control */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setIsPTZEnabled(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setIsPTZEnabled(false);
        /* If PTZ was active, stop it */
        if (isActive) {
          setIsActive(false);
          setMousePos(null);
          sendPtzMove(0, 0, currentChannel);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }
    };

    const handleBlur = () => {
      setIsPTZEnabled(false);
      if (isActive) {
        setIsActive(false);
        setMousePos(null);
        sendPtzMove(0, 0, currentChannel);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [currentChannel, isActive]);

  /* Handle mouse wheel for zoom control */
  useEffect(() => {
    if (!isPTZEnabled) return;

    const handleWheel = (e: WheelEvent) => {
      /* Only handle if mouse is over the video area */
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const isOverVideo =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (!isOverVideo) return;

      e.preventDefault();
      e.stopPropagation();

      /* Determine zoom direction based on wheel delta */
      const zoomSpeed = e.deltaY < 0 ? 4000 : -4000;

      /* Send zoom command */
      sendPtzZoom(zoomSpeed, currentChannel);

      /* Stop zoom after a short duration (simulate key release) */
      setTimeout(() => {
        sendPtzZoom(0, currentChannel);
      }, 100);
    };

    /* Listen on document to catch all wheel events when Ctrl is held */
    document.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      document.removeEventListener('wheel', handleWheel);
    };
  }, [currentChannel, isPTZEnabled]);

  if (!visible || dimensions.pixelWidth === 0 || dimensions.pixelHeight === 0) {
    return null;
  }

  /* Calculate indicator position and deadzone visualization */
  let indicatorX = centerX;
  let indicatorY = centerY;
  let showIndicator = false;

  if (isActive && mousePos) {
    indicatorX = mousePos.x;
    indicatorY = mousePos.y;
    showIndicator = true;
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        top: `${dimensions.offsetY}px`,
        left: `${dimensions.offsetX}px`,
        width: `${dimensions.pixelWidth}px`,
        height: `${dimensions.pixelHeight}px`,
        cursor: isPTZEnabled
          ? isActive
            ? 'grabbing'
            : 'crosshair'
          : 'default',
        touchAction: 'none',
        pointerEvents: isPTZEnabled ? 'auto' : 'none',
        zIndex: 10 /* Above BBoxSurface and video */
      }}
    >
      {/* Center crosshair */}
      <div
        style={{
          position: 'absolute',
          left: `${centerX}px`,
          top: `${centerY}px`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          opacity: isPTZEnabled ? 1 : 0.3,
          transition: 'opacity 0.2s ease'
        }}
      >
        {/* Horizontal line */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '40px',
            height: '2px',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            boxShadow: '0 0 4px rgba(0, 0, 0, 0.5)'
          }}
        />
        {/* Vertical line */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '2px',
            height: '40px',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            boxShadow: '0 0 4px rgba(0, 0, 0, 0.5)'
          }}
        />
        {/* Center dot */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            boxShadow: '0 0 4px rgba(0, 0, 0, 0.5)'
          }}
        />
        {/* Deadzone circle */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: `${DEADZONE_RADIUS * 2}px`,
            height: `${DEADZONE_RADIUS * 2}px`,
            borderRadius: '50%',
            border: '1px dashed rgba(255, 255, 255, 0.3)',
            pointerEvents: 'none'
          }}
        />
      </div>

      {/* Active direction indicator */}
      {showIndicator && (
        <>
          {/* Line from center to mouse */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }}
          >
            <line
              x1={centerX}
              y1={centerY}
              x2={indicatorX}
              y2={indicatorY}
              stroke="rgba(76, 175, 80, 0.6)"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          </svg>
          {/* Mouse position indicator */}
          <div
            style={{
              position: 'absolute',
              left: `${indicatorX}px`,
              top: `${indicatorY}px`,
              transform: 'translate(-50%, -50%)',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: 'rgba(76, 175, 80, 0.8)',
              border: '2px solid rgba(255, 255, 255, 0.9)',
              boxShadow: '0 0 8px rgba(76, 175, 80, 0.5)',
              pointerEvents: 'none'
            }}
          />
        </>
      )}

      {/* Instruction tooltip - show when PTZ not enabled */}
      {!isPTZEnabled && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '4px',
            fontSize: '14px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
          }}
        >
          Hold <strong>Ctrl</strong> (or <strong>⌘</strong>) for PTZ control
        </div>
      )}
    </div>
  );
};
