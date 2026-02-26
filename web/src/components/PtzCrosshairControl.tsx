/**
 * PtzCrosshairControl
 *
 * Optional PTZ control overlay for drag-to-steer and wheel-to-zoom.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { sendPtzMove, sendPtzZoom } from '../helpers/usePTZControl';

interface PtzCrosshairControlProps {
  currentChannel: string;
  enabled: boolean;
}

const PTZ_CROSSHAIR_RADIUS_PX = 72;
const PTZ_MAX_DRAG_DISTANCE_PX = 220;
const PTZ_CONTROL_SIZE_PX = PTZ_MAX_DRAG_DISTANCE_PX * 2 + 44;
const PTZ_MAX_SPEED = 100;
const PTZ_WHEEL_SPEED = 4000;
const PTZ_ZOOM_STOP_DELAY_MS = 140;
const PTZ_ZOOM_RESEND_INTERVAL_MS = 90;
const PTZ_MOVE_DEAD_ZONE_PX = 6;
const PTZ_SEND_INTERVAL_MS = 80;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const PtzCrosshairControl: React.FC<PtzCrosshairControlProps> = ({
  currentChannel,
  enabled
}) => {
  const hasChannel = currentChannel.trim() !== '';

  const controlRootRef = useRef<HTMLDivElement | null>(null);
  const ptzHandleRef = useRef<HTMLDivElement | null>(null);
  const ptzPointerIdRef = useRef<number | null>(null);
  const zoomStopTimerRef = useRef<number | null>(null);
  const activeZoomSpeedRef = useRef<number>(0);
  const lastZoomSentAtRef = useRef<number>(0);
  const moveSendTimerRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ pan: number; tilt: number } | null>(null);
  const lastSentMoveRef = useRef<{ pan: number; tilt: number }>({
    pan: 0,
    tilt: 0
  });

  const [ptzVector, setPtzVector] = useState({ x: 0, y: 0 });
  const [ptzDragging, setPtzDragging] = useState(false);

  const sendPtzPanTiltNow = useCallback(
    (pan: number, tilt: number) => {
      if (!hasChannel) {
        return;
      }

      if (
        pan === lastSentMoveRef.current.pan &&
        tilt === lastSentMoveRef.current.tilt
      ) {
        return;
      }

      lastSentMoveRef.current = { pan, tilt };
      sendPtzMove(pan, tilt, currentChannel);
    },
    [currentChannel, hasChannel]
  );

  const queuePtzPanTilt = useCallback(
    (pan: number, tilt: number) => {
      pendingMoveRef.current = { pan, tilt };

      if (moveSendTimerRef.current !== null) {
        return;
      }

      const flush = () => {
        moveSendTimerRef.current = null;
        const nextMove = pendingMoveRef.current;
        pendingMoveRef.current = null;
        if (!nextMove) {
          return;
        }

        sendPtzPanTiltNow(nextMove.pan, nextMove.tilt);
        moveSendTimerRef.current = window.setTimeout(
          flush,
          PTZ_SEND_INTERVAL_MS
        );
      };

      flush();
    },
    [sendPtzPanTiltNow]
  );

  const clearQueuedPtzPanTilt = useCallback(() => {
    if (moveSendTimerRef.current !== null) {
      clearTimeout(moveSendTimerRef.current);
      moveSendTimerRef.current = null;
    }
    pendingMoveRef.current = null;
  }, []);

  const stopPanTilt = useCallback(() => {
    ptzPointerIdRef.current = null;
    setPtzDragging(false);
    setPtzVector({ x: 0, y: 0 });
    clearQueuedPtzPanTilt();
    sendPtzPanTiltNow(0, 0);
  }, [clearQueuedPtzPanTilt, sendPtzPanTiltNow]);

  const updatePtzVector = useCallback(
    (clientX: number, clientY: number) => {
      const root = controlRootRef.current;
      if (!root) {
        return;
      }

      const rect = root.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const distance = Math.hypot(dx, dy);
      const clampedDistance = clamp(distance, 0, PTZ_MAX_DRAG_DISTANCE_PX);
      const scale = distance > 0 ? clampedDistance / distance : 0;

      const x = dx * scale;
      const y = dy * scale;
      setPtzVector({ x, y });

      if (clampedDistance < PTZ_MOVE_DEAD_ZONE_PX) {
        queuePtzPanTilt(0, 0);
        return;
      }

      const pan = Math.round((x / PTZ_MAX_DRAG_DISTANCE_PX) * PTZ_MAX_SPEED);
      const tilt = Math.round((-y / PTZ_MAX_DRAG_DISTANCE_PX) * PTZ_MAX_SPEED);
      queuePtzPanTilt(pan, tilt);
    },
    [queuePtzPanTilt]
  );

  const handlePtzPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!hasChannel || !enabled) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      ptzPointerIdRef.current = e.pointerId;
      setPtzDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      updatePtzVector(e.clientX, e.clientY);
    },
    [enabled, hasChannel, updatePtzVector]
  );

  const handlePtzPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (ptzPointerIdRef.current !== e.pointerId) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      updatePtzVector(e.clientX, e.clientY);
    },
    [updatePtzVector]
  );

  const handlePtzPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (ptzPointerIdRef.current !== e.pointerId) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      stopPanTilt();
    },
    [stopPanTilt]
  );

  const handlePtzLostPointerCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (ptzPointerIdRef.current === e.pointerId) {
        stopPanTilt();
      }
    },
    [stopPanTilt]
  );

  const handlePtzWheel = useCallback(
    (event: WheelEvent) => {
      if (!hasChannel || !enabled) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const zoomSpeed = event.deltaY < 0 ? PTZ_WHEEL_SPEED : -PTZ_WHEEL_SPEED;
      const now = Date.now();
      const zoomChanged = activeZoomSpeedRef.current !== zoomSpeed;
      const shouldResend =
        now - lastZoomSentAtRef.current >= PTZ_ZOOM_RESEND_INTERVAL_MS;

      if (zoomChanged || shouldResend) {
        activeZoomSpeedRef.current = zoomSpeed;
        lastZoomSentAtRef.current = now;
        sendPtzZoom(zoomSpeed, currentChannel);
      }

      if (zoomStopTimerRef.current !== null) {
        clearTimeout(zoomStopTimerRef.current);
      }
      zoomStopTimerRef.current = window.setTimeout(() => {
        zoomStopTimerRef.current = null;
        if (activeZoomSpeedRef.current !== 0) {
          activeZoomSpeedRef.current = 0;
          lastZoomSentAtRef.current = Date.now();
          sendPtzZoom(0, currentChannel);
        }
      }, PTZ_ZOOM_STOP_DELAY_MS);
    },
    [currentChannel, enabled, hasChannel]
  );

  const isInsideReticle = useCallback((clientX: number, clientY: number) => {
    const root = controlRootRef.current;
    if (!root) {
      return false;
    }

    const rect = root.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return (
      Math.hypot(clientX - centerX, clientY - centerY) <=
      PTZ_CROSSHAIR_RADIUS_PX
    );
  }, []);

  /* Use a non-passive global wheel listener so zoom works across
   * the whole reticle area, not only on the center knob.
   */
  useEffect(() => {
    const onWindowWheel = (event: WheelEvent) => {
      if (!isInsideReticle(event.clientX, event.clientY)) {
        return;
      }
      handlePtzWheel(event);
    };

    window.addEventListener('wheel', onWindowWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWindowWheel);
    };
  }, [handlePtzWheel, isInsideReticle]);

  /* Stop active PTZ actions if the control gets disabled. */
  useEffect(() => {
    if (enabled) {
      return;
    }

    if (zoomStopTimerRef.current !== null) {
      clearTimeout(zoomStopTimerRef.current);
      zoomStopTimerRef.current = null;
    }
    activeZoomSpeedRef.current = 0;
    lastZoomSentAtRef.current = 0;
    clearQueuedPtzPanTilt();

    stopPanTilt();
    if (hasChannel) {
      sendPtzZoom(0, currentChannel);
    }
  }, [enabled, currentChannel, hasChannel, clearQueuedPtzPanTilt, stopPanTilt]);

  /* Cleanup PTZ movement/zoom state on unmount and channel changes. */
  useEffect(() => {
    return () => {
      if (zoomStopTimerRef.current !== null) {
        clearTimeout(zoomStopTimerRef.current);
        zoomStopTimerRef.current = null;
      }
      activeZoomSpeedRef.current = 0;
      lastZoomSentAtRef.current = 0;
      clearQueuedPtzPanTilt();

      if (hasChannel) {
        sendPtzMove(0, 0, currentChannel);
        sendPtzZoom(0, currentChannel);
      }
    };
  }, [currentChannel, hasChannel, clearQueuedPtzPanTilt]);

  if (!enabled) {
    return null;
  }

  return (
    <div
      ref={controlRootRef}
      data-ptz-crosshair="true"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: `${PTZ_CONTROL_SIZE_PX}px`,
        height: `${PTZ_CONTROL_SIZE_PX}px`,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 0,
        userSelect: 'none'
      }}
    >
      <svg
        width={PTZ_CONTROL_SIZE_PX}
        height={PTZ_CONTROL_SIZE_PX}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none'
        }}
      >
        <circle
          cx={PTZ_CONTROL_SIZE_PX / 2}
          cy={PTZ_CONTROL_SIZE_PX / 2}
          r={PTZ_CROSSHAIR_RADIUS_PX}
          fill="rgba(0, 0, 0, 0.15)"
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth={1}
        />
        <line
          x1={PTZ_CONTROL_SIZE_PX / 2 - PTZ_CROSSHAIR_RADIUS_PX}
          y1={PTZ_CONTROL_SIZE_PX / 2}
          x2={PTZ_CONTROL_SIZE_PX / 2 + PTZ_CROSSHAIR_RADIUS_PX}
          y2={PTZ_CONTROL_SIZE_PX / 2}
          stroke="rgba(255, 255, 255, 0.22)"
          strokeWidth={1}
        />
        <line
          x1={PTZ_CONTROL_SIZE_PX / 2}
          y1={PTZ_CONTROL_SIZE_PX / 2 - PTZ_CROSSHAIR_RADIUS_PX}
          x2={PTZ_CONTROL_SIZE_PX / 2}
          y2={PTZ_CONTROL_SIZE_PX / 2 + PTZ_CROSSHAIR_RADIUS_PX}
          stroke="rgba(255, 255, 255, 0.22)"
          strokeWidth={1}
        />
        {(Math.abs(ptzVector.x) > 0 || Math.abs(ptzVector.y) > 0) && (
          <>
            <line
              x1={PTZ_CONTROL_SIZE_PX / 2}
              y1={PTZ_CONTROL_SIZE_PX / 2}
              x2={PTZ_CONTROL_SIZE_PX / 2 + ptzVector.x}
              y2={PTZ_CONTROL_SIZE_PX / 2 + ptzVector.y}
              stroke="rgba(60, 240, 255, 0.95)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle
              cx={PTZ_CONTROL_SIZE_PX / 2 + ptzVector.x}
              cy={PTZ_CONTROL_SIZE_PX / 2 + ptzVector.y}
              r={3}
              fill="rgba(60, 240, 255, 1)"
            />
          </>
        )}
      </svg>

      <div
        ref={ptzHandleRef}
        data-ptz-crosshair="true"
        title="Drag to steer PTZ. Scroll to zoom."
        onPointerDown={handlePtzPointerDown}
        onPointerMove={handlePtzPointerMove}
        onPointerUp={handlePtzPointerUp}
        onPointerCancel={handlePtzPointerUp}
        onLostPointerCapture={handlePtzLostPointerCapture}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          border: '2px solid rgba(255, 255, 255, 0.82)',
          background: 'rgba(8, 14, 18, 0.64)',
          boxShadow: ptzDragging
            ? '0 0 0 4px rgba(60, 240, 255, 0.24)'
            : '0 2px 10px rgba(0,0,0,0.35)',
          transform: `translate(calc(-50% + ${ptzVector.x}px), calc(-50% + ${ptzVector.y}px))`,
          cursor: hasChannel
            ? ptzDragging
              ? 'grabbing'
              : 'grab'
            : 'not-allowed',
          pointerEvents: hasChannel ? 'auto' : 'none',
          opacity: hasChannel ? 1 : 0.55,
          touchAction: 'none'
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '18px',
            height: '2px',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: '2px'
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '2px',
            height: '18px',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: '2px'
          }}
        />
      </div>
    </div>
  );
};

export default PtzCrosshairControl;
