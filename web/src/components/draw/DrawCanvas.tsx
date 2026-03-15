/* DrawCanvas
 *
 * Interactive drawing surface rendered on top of the video area.
 *
 * Coordinate spaces:
 * - Pointer input is captured in CSS pixels.
 * - Strokes are stored in native video coordinates so they survive resize.
 * - Rendering scales those strokes back to the current on-screen video area.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions } from '../appInterface';
import { useDrawContext } from './DrawContext';
import { DrawPoint, DrawStroke } from './drawInterfaces';
import { getNativeBrushSize, renderDrawStrokes } from './drawUtils';

interface DrawCanvasProps {
  dimensions: Dimensions;
}

/* Keep points inside the visible video content box */
const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const DrawCanvas: React.FC<DrawCanvasProps> = ({ dimensions }) => {
  /* Local state */
  const [draftStroke, setDraftStroke] = useState<DrawStroke | null>(null);

  /* Refs */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const strokeIdRef = useRef(1);
  const draftStrokeRef = useRef<DrawStroke | null>(null);

  /* Shared draw state */
  const {
    strokes,
    activeTool,
    brushColor,
    brushSize,
    addStroke,
    registerDraftController,
    setSurfaceDimensions
  } = useDrawContext();

  const updateDraftStroke = useCallback(
    (
      valueOrFn:
        | DrawStroke
        | null
        | ((currentStroke: DrawStroke | null) => DrawStroke | null)
    ) => {
      setDraftStroke((currentStroke) => {
        const nextStroke =
          typeof valueOrFn === 'function'
            ? valueOrFn(currentStroke)
            : valueOrFn;
        draftStrokeRef.current = nextStroke;
        return nextStroke;
      });
    },
    []
  );

  /* Persisted strokes survive reload, so seed new ids from the highest existing id */
  useEffect(() => {
    strokeIdRef.current =
      strokes.reduce((highestId, stroke) => Math.max(highestId, stroke.id), 0) +
      1;
  }, [strokes]);

  /* Report the active video surface back to the context for export sizing */
  useEffect(() => {
    setSurfaceDimensions(dimensions);
  }, [dimensions, setSurfaceDimensions]);

  useEffect(() => {
    return () => {
      setSurfaceDimensions(null);
    };
  }, [setSurfaceDimensions]);

  useEffect(() => {
    registerDraftController({
      hasDraft: () => draftStrokeRef.current !== null,
      discardDraft: () => {
        pointerIdRef.current = null;
        draftStrokeRef.current = null;
        setDraftStroke(null);
      }
    });

    return () => {
      registerDraftController(null);
    };
  }, [registerDraftController]);

  /* Convert pointer coordinates from the live canvas to native video coordinates */
  const toDrawPoint = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): DrawPoint | null => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return null;
      }

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      return {
        x: clamp(
          ((event.clientX - rect.left) / rect.width) * dimensions.videoWidth,
          0,
          dimensions.videoWidth
        ),
        y: clamp(
          ((event.clientY - rect.top) / rect.height) * dimensions.videoHeight,
          0,
          dimensions.videoHeight
        )
      };
    },
    [dimensions.videoHeight, dimensions.videoWidth]
  );

  /* Commit the in-progress stroke only once the gesture has ended */
  const finalizeStroke = useCallback(() => {
    const currentStroke = draftStrokeRef.current;

    if (currentStroke) {
      addStroke(currentStroke);
    }

    draftStrokeRef.current = null;
    setDraftStroke(null);
    pointerIdRef.current = null;
  }, [addStroke]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 && event.pointerType !== 'touch') {
        return;
      }

      const point = toDrawPoint(event);
      if (!point) {
        return;
      }

      event.preventDefault();
      pointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);

      /* Brush size is normalized to native video space so resize does not distort the drawing */
      updateDraftStroke({
        id: strokeIdRef.current++,
        tool: activeTool,
        color: brushColor,
        size: getNativeBrushSize(brushSize, dimensions),
        points: [point]
      });
    },
    [
      activeTool,
      brushColor,
      brushSize,
      dimensions,
      toDrawPoint,
      updateDraftStroke
    ]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }

      const point = toDrawPoint(event);
      if (!point) {
        return;
      }

      event.preventDefault();

      updateDraftStroke((currentStroke) => {
        if (!currentStroke) {
          return currentStroke;
        }

        const lastPoint =
          currentStroke.points[currentStroke.points.length - 1] ?? null;
        if (
          lastPoint &&
          Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 0.5
        ) {
          return currentStroke;
        }

        return {
          ...currentStroke,
          points: [...currentStroke.points, point]
        };
      });
    },
    [toDrawPoint, updateDraftStroke]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      finalizeStroke();
    },
    [finalizeStroke]
  );

  /* Cancelled gestures should not produce a partial saved stroke */
  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      pointerIdRef.current = null;
      draftStrokeRef.current = null;
      setDraftStroke(null);
    },
    []
  );

  /* Redraw the full scene whenever strokes or surface dimensions change */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(
      1,
      Math.round(dimensions.pixelWidth * devicePixelRatio)
    );
    canvas.height = Math.max(
      1,
      Math.round(dimensions.pixelHeight * devicePixelRatio)
    );
    canvas.style.width = `${dimensions.pixelWidth}px`;
    canvas.style.height = `${dimensions.pixelHeight}px`;

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    renderDrawStrokes({
      context,
      strokes: draftStroke ? [...strokes, draftStroke] : strokes,
      renderWidth: dimensions.pixelWidth,
      renderHeight: dimensions.pixelHeight,
      sourceWidth: dimensions.videoWidth,
      sourceHeight: dimensions.videoHeight
    });
  }, [dimensions, draftStroke, strokes]);

  return (
    <canvas
      ref={canvasRef}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        cursor: activeTool === 'eraser' ? 'cell' : 'crosshair',
        touchAction: 'none'
      }}
    />
  );
};

export default DrawCanvas;
