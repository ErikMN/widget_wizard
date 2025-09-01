// =============================================
// DrawingOverlay
// SVG drawing overlay positioned exactly over the <video> box.
// - Draw coordinates live in a fixed viewBox (coordWidth x coordHeight), e.g. 1920x1080.
// - The overlay's DOM rect (styleRect) always matches the video element's on-screen box.
// - Exported SVG is exactly coordWidth x coordHeight.
// =============================================

import React, {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef
} from 'react';

type Tool = 'freehand' | 'rect';

export type SVGShape =
  | {
      kind: 'path';
      d: string;
      stroke: string;
      strokeWidth: number;
      opacity?: number;
    }
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      stroke: string;
      strokeWidth: number;
      opacity?: number;
    };

export interface DrawingOverlayHandle {
  start: () => void;
  stop: () => void;
  toggle: () => void;
  undo: () => void;
  clear: () => void;
  saveSVG: (filename?: string) => void;
  isActive: () => boolean;
  /* Optional: returns a PNG blob of the current overlay at coord size */
  exportPNG?: () => Promise<Blob | null>;
}

interface DrawingOverlayProps {
  /* Whether drawing mode is active. While inactive, overlay is click-through. */
  active?: boolean;
  /* Fallback stroke color for new shapes (used if CSS var is missing) */
  strokeColor?: string;
  /* Fallback stroke width for new shapes (used if CSS var is missing) */
  strokeWidth?: number;
  /* Callback on active change (only used when using imperative API) */
  onActiveChange?: (active: boolean) => void;

  /* Fixed coordinate system for the drawing (e.g. 1920x1080) */
  coordWidth: number;
  coordHeight: number;

  /**
   * CSS rect to position the overlay right on top of the actual <video> box.
   * Must be relative to the stage container.
   */
  styleRect: {
    left: number;
    top: number;
    width: number;
    height: number;
    zIndex?: number;
  };
}

function triggerDownload(filename: string, data: Blob) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(data);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 0);
}

/* Smooth polyline -> path with quadratic commands */
function pointsToPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return '';
  }
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x} ${p.y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    d += ` Q ${p0.x} ${p0.y}, ${cx} ${cy}`;
  }
  const last = points[points.length - 1];
  d += ` T ${last.x} ${last.y}`;
  return d;
}

/* Read live brush + tool from CSS variables with sensible fallbacks. */
function readBrushAndToolFromCSS(
  fallbackColor: string,
  fallbackWidth: number
): { color: string; width: number; tool: Tool } {
  try {
    const styles = getComputedStyle(document.documentElement);
    const color =
      (styles.getPropertyValue('--draw-stroke') || '').trim() || fallbackColor;
    const widthStr = (styles.getPropertyValue('--draw-width') || '').trim();
    const wParsed = parseFloat(widthStr);
    const width =
      Number.isFinite(wParsed) && wParsed > 0 ? wParsed : fallbackWidth;
    const toolStr = (styles.getPropertyValue('--draw-tool') || '').trim();
    const tool: Tool = toolStr === 'rect' ? 'rect' : 'freehand';
    return { color, width, tool };
  } catch {
    return { color: fallbackColor, width: fallbackWidth, tool: 'freehand' };
  }
}

export const DrawingOverlay = forwardRef<
  DrawingOverlayHandle,
  DrawingOverlayProps
>(
  (
    {
      active: controlledActive,
      strokeColor = '#00E5FF',
      strokeWidth = 3,
      onActiveChange,
      coordWidth,
      coordHeight,
      styleRect
    },
    ref
  ) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [internalActive, setInternalActive] =
      useState<boolean>(!!controlledActive);
    const active =
      controlledActive !== undefined ? !!controlledActive : internalActive;

    const [shapes, setShapes] = useState<SVGShape[]>([]);
    const [previewPath, setPreviewPath] = useState<string>('');
    const [previewRect, setPreviewRect] = useState<{
      x: number;
      y: number;
      width: number;
      height: number;
      stroke: string;
      strokeWidth: number;
    } | null>(null);

    const drawing = useRef<
      | {
          mode: 'freehand';
          points: Array<{ x: number; y: number }>;
          stroke: string;
          strokeWidth: number;
        }
      | {
          mode: 'rect';
          start: { x: number; y: number };
          last: { x: number; y: number };
          stroke: string;
          strokeWidth: number;
        }
      | null
    >(null);

    /* Convert pointer to SVG user space (fixed coord system). */
    const toLocal = useCallback(
      (evt: PointerEvent): { x: number; y: number } => {
        const svg = svgRef.current;
        if (!svg) {
          return { x: 0, y: 0 };
        }
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX;
        pt.y = evt.clientY;
        const screenCTM = svg.getScreenCTM();
        if (!screenCTM) {
          return { x: 0, y: 0 };
        }
        const loc = pt.matrixTransform(screenCTM.inverse());
        return { x: loc.x, y: loc.y };
      },
      []
    );

    const onPointerDown = useCallback(
      (e: React.PointerEvent) => {
        if (!active) {
          return;
        }
        (e.target as Element).setPointerCapture?.(e.pointerId);

        const { color, width, tool } = readBrushAndToolFromCSS(
          strokeColor,
          strokeWidth
        );
        const loc = toLocal(e.nativeEvent);

        if (tool === 'rect') {
          drawing.current = {
            mode: 'rect',
            start: loc,
            last: loc,
            stroke: color,
            strokeWidth: width
          };
          setPreviewPath('');
          setPreviewRect({
            x: loc.x,
            y: loc.y,
            width: 0,
            height: 0,
            stroke: color,
            strokeWidth: width
          });
        } else {
          drawing.current = {
            mode: 'freehand',
            points: [loc],
            stroke: color,
            strokeWidth: width
          };
          setPreviewRect(null);
        }
      },
      [active, strokeColor, strokeWidth, toLocal]
    );

    const onPointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (!active || !drawing.current) {
          return;
        }
        const loc = toLocal(e.nativeEvent);
        const curr = drawing.current;

        if (curr.mode === 'rect') {
          curr.last = loc;
          const x = Math.min(curr.start.x, curr.last.x);
          const y = Math.min(curr.start.y, curr.last.y);
          const w = Math.abs(curr.last.x - curr.start.x);
          const h = Math.abs(curr.last.y - curr.start.y);
          setPreviewRect({
            x,
            y,
            width: w,
            height: h,
            stroke: curr.stroke,
            strokeWidth: curr.strokeWidth
          });
        } else {
          curr.points.push(loc);
          setPreviewPath(pointsToPath(curr.points));
        }
      },
      [active, toLocal]
    );

    const finishStroke = useCallback(() => {
      if (!active || !drawing.current) {
        return;
      }
      const curr = drawing.current;

      if (curr.mode === 'rect') {
        const x = Math.min(curr.start.x, curr.last.x);
        const y = Math.min(curr.start.y, curr.last.y);
        const w = Math.abs(curr.last.x - curr.start.x);
        const h = Math.abs(curr.last.y - curr.start.y);
        if (w > 0 || h > 0) {
          setShapes((prev) => [
            ...prev,
            {
              kind: 'rect',
              x,
              y,
              width: w,
              height: h,
              stroke: curr.stroke,
              strokeWidth: curr.strokeWidth
            }
          ]);
        }
        setPreviewRect(null);
      } else {
        const d = pointsToPath(curr.points);
        setShapes((prev) => [
          ...prev,
          {
            kind: 'path',
            d,
            stroke: curr.stroke,
            strokeWidth: curr.strokeWidth
          }
        ]);
        setPreviewPath('');
      }
      drawing.current = null;
    }, [active]);

    /* Serialize current SVG content (used by saveSVG and exportPNG) */
    const serializeSVG = useCallback((): string | null => {
      const svg = svgRef.current;
      if (!svg) {
        return null;
      }

      /* Create a fresh SVG with current shapes (no preview) */
      const doc = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      doc.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      doc.setAttribute('width', String(coordWidth));
      doc.setAttribute('height', String(coordHeight));
      doc.setAttribute('viewBox', `0 0 ${coordWidth} ${coordHeight}`);

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('fill', 'none');
      g.setAttribute('stroke-linecap', 'round');
      g.setAttribute('stroke-linejoin', 'round');

      shapes.forEach((s) => {
        if (s.kind === 'path') {
          const p = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path'
          );
          p.setAttribute('d', s.d);
          p.setAttribute('stroke', s.stroke);
          p.setAttribute('stroke-width', String(s.strokeWidth));
          g.appendChild(p);
        } else {
          const r = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'rect'
          );
          r.setAttribute('x', String(s.x));
          r.setAttribute('y', String(s.y));
          r.setAttribute('width', String(s.width));
          r.setAttribute('height', String(s.height));
          r.setAttribute('fill', 'none');
          r.setAttribute('stroke', s.stroke);
          r.setAttribute('stroke-width', String(s.strokeWidth));
          g.appendChild(r);
        }
      });
      doc.appendChild(g);
      const serializer = new XMLSerializer();
      const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
      return xmlHeader + serializer.serializeToString(doc);
    }, [coordWidth, coordHeight, shapes]);

    /* Rasterize serialized SVG to PNG blob */
    const svgToPNG = useCallback(
      async (svgXml: string): Promise<Blob | null> => {
        const svgBlob = new Blob([svgXml], {
          type: 'image/svg+xml;charset=utf-8'
        });
        const url = URL.createObjectURL(svgBlob);
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const load = () =>
            new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = (e) => reject(e);
            });
          img.src = url;
          await load();

          const canvas = document.createElement('canvas');
          canvas.width = coordWidth;
          canvas.height = coordHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return null;
          }
          ctx.clearRect(0, 0, coordWidth, coordHeight);
          ctx.drawImage(img, 0, 0, coordWidth, coordHeight);

          const png: Blob | null = await new Promise((resolve) =>
            canvas.toBlob((b) => resolve(b), 'image/png')
          );

          return png;
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      [coordWidth, coordHeight]
    );

    useImperativeHandle(
      ref,
      (): DrawingOverlayHandle => ({
        start: () => {
          setInternalActive(true);
          onActiveChange?.(true);
        },
        stop: () => {
          setInternalActive(false);
          onActiveChange?.(false);
        },
        toggle: () => {
          setInternalActive((v) => {
            onActiveChange?.(!v);
            return !v;
          });
        },
        undo: () => setShapes((prev) => prev.slice(0, -1)),
        clear: () => setShapes([]),
        saveSVG: (filename = 'drawing.svg') => {
          const xml = serializeSVG();
          if (!xml) {
            return;
          }
          const blob = new Blob([xml], {
            type: 'image/svg+xml;charset=utf-8'
          });
          triggerDownload(filename, blob);
        },
        isActive: () => active,
        exportPNG: async () => {
          const xml = serializeSVG();
          if (!xml) {
            return null;
          }
          return await svgToPNG(xml);
        }
      }),
      [active, onActiveChange, serializeSVG, svgToPNG]
    );

    return (
      <div
        style={{
          position: 'absolute',
          left: styleRect.left,
          top: styleRect.top,
          width: styleRect.width,
          height: styleRect.height,
          zIndex: styleRect.zIndex ?? 9999,
          pointerEvents: active ? 'auto' : 'none',
          touchAction: 'none',
          cursor: active ? 'crosshair' : 'default'
        }}
      >
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
          viewBox={`0 0 ${coordWidth} ${coordHeight}`}
          style={{ display: 'block', cursor: active ? 'crosshair' : 'default' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        >
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {shapes.map((s, i) =>
              s.kind === 'path' ? (
                <path
                  key={i}
                  d={s.d}
                  stroke={s.stroke}
                  strokeWidth={s.strokeWidth}
                />
              ) : (
                <rect
                  key={i}
                  x={s.x}
                  y={s.y}
                  width={s.width}
                  height={s.height}
                  fill="none"
                  stroke={s.stroke}
                  strokeWidth={s.strokeWidth}
                />
              )
            )}

            {/* Live previews */}
            {previewPath && (
              <path
                d={previewPath}
                stroke={(drawing.current as any)?.stroke ?? strokeColor}
                strokeWidth={
                  (drawing.current as any)?.strokeWidth ?? strokeWidth
                }
              />
            )}
            {previewRect && (
              <rect
                x={previewRect.x}
                y={previewRect.y}
                width={previewRect.width}
                height={previewRect.height}
                fill="none"
                stroke={previewRect.stroke}
                strokeWidth={previewRect.strokeWidth}
              />
            )}
          </g>
        </svg>
      </div>
    );
  }
);

export default DrawingOverlay;
