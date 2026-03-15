/* Shared draw constants and rendering helpers.
 *
 * Keep the rendering math here so DrawCanvas and PNG export use the same rules.
 */
import { Dimensions } from '../appInterface';
import { DrawStroke } from './drawInterfaces';

export const DRAW_COLORS = [
  '#ffeb3b',
  '#ff7043',
  '#ef5350',
  '#66bb6a',
  '#29b6f6',
  '#ab47bc',
  '#ffffff',
  '#111111'
];

export const DRAW_BRUSH_SIZES = [4, 8, 14, 22];
export const DEFAULT_DRAW_COLOR = DRAW_COLORS[0];
export const DEFAULT_BRUSH_SIZE = DRAW_BRUSH_SIZES[1];

/* Convert a screen-space brush preset to native video space */
export const getNativeBrushSize = (
  brushSize: number,
  dimensions: Dimensions
): number => {
  if (dimensions.pixelWidth <= 0 || dimensions.pixelHeight <= 0) {
    return brushSize;
  }

  const scaleX = dimensions.videoWidth / dimensions.pixelWidth;
  const scaleY = dimensions.videoHeight / dimensions.pixelHeight;
  const averageScale = (scaleX + scaleY) / 2;

  return Math.max(1, brushSize * averageScale);
};

interface RenderDrawStrokesParams {
  context: CanvasRenderingContext2D;
  strokes: DrawStroke[];
  renderWidth: number;
  renderHeight: number;
  sourceWidth: number;
  sourceHeight: number;
}

/* Render the stored drawing into any canvas size while preserving proportions */
export const renderDrawStrokes = ({
  context,
  strokes,
  renderWidth,
  renderHeight,
  sourceWidth,
  sourceHeight
}: RenderDrawStrokesParams): void => {
  context.clearRect(0, 0, renderWidth, renderHeight);
  context.imageSmoothingEnabled = true;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }

  const scaleX = renderWidth / sourceWidth;
  const scaleY = renderHeight / sourceHeight;
  const averageScale = (scaleX + scaleY) / 2;

  strokes.forEach((stroke) => {
    if (stroke.points.length === 0) {
      return;
    }

    context.save();
    context.globalCompositeOperation =
      stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = Math.max(1, stroke.size * averageScale);
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;

    /* Single-point strokes need a filled circle since there is no path length to stroke */
    if (stroke.points.length === 1) {
      const [point] = stroke.points;
      context.beginPath();
      context.arc(
        point.x * scaleX,
        point.y * scaleY,
        context.lineWidth / 2,
        0,
        Math.PI * 2
      );
      context.fill();
      context.restore();
      return;
    }

    /* Multi-point strokes are replayed as a simple polyline */
    context.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * scaleX;
      const y = point.y * scaleY;

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();
    context.restore();
  });
};
