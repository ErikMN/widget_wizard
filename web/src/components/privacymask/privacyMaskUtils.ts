/* Privacy mask helpers: coordinate conversion, parsing and naming.
 *
 * Two coordinate systems are used:
 *
 * - Sensor coordinates ("reference" in the code): pixels in the camera's full,
 *   unrotated image, e.g. 3840x2160. All camera requests use these, so stored
 *   mask points never depend on the current stream settings.
 *
 * - Stream coordinates: pixels in the video being played. The stream is the
 *   sensor image rotated, then cropped around the center if its aspect ratio
 *   differs (e.g. a 4:3 stream from a 16:9 sensor loses the sides), then scaled.
 *
 * Rotation is in degrees clockwise, the same convention the camera uses.
 */
import {
  MaskPoint,
  MaskReferenceFrame,
  PrivacyMask,
  StreamRotation
} from './privacyMaskInterfaces';

export const MIN_MASK_CORNERS = 3;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/* Turn any rotation value (e.g. "270", -90) into 0, 90, 180 or 270 */
export const normalizeRotation = (value: unknown): StreamRotation => {
  const parsed = ((parseInt(String(value), 10) % 360) + 360) % 360;
  return parsed === 90 || parsed === 180 || parsed === 270 ? parsed : 0;
};

/* Size of the sensor image after rotation (90 and 270 swap width and height) */
export const getRotatedSize = (
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>,
  rotation: StreamRotation
): { width: number; height: number } =>
  rotation === 90 || rotation === 270
    ? { width: frame.height, height: frame.width }
    : { width: frame.width, height: frame.height };

/* The part of the rotated sensor image that is shown in the stream.
 *
 * If the stream is narrower than the sensor image, the left and right sides
 * are cut off equally. If it is wider, the top and bottom are cut off.
 */
export const getVisibleRegion = (
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>,
  rotation: StreamRotation,
  streamWidth: number,
  streamHeight: number
): { x: number; y: number; width: number; height: number } => {
  const rotated = getRotatedSize(frame, rotation);
  if (streamWidth <= 0 || streamHeight <= 0) {
    return { x: 0, y: 0, ...rotated };
  }
  const streamAspect = streamWidth / streamHeight;
  const sensorAspect = rotated.width / rotated.height;
  if (streamAspect < sensorAspect) {
    /* Stream is narrower: keep full height, cut the sides */
    const width = rotated.height * streamAspect;
    return {
      x: (rotated.width - width) / 2,
      y: 0,
      width,
      height: rotated.height
    };
  }
  if (streamAspect > sensorAspect) {
    /* Stream is wider: keep full width, cut top and bottom */
    const height = rotated.width / streamAspect;
    return {
      x: 0,
      y: (rotated.height - height) / 2,
      width: rotated.width,
      height
    };
  }
  return { x: 0, y: 0, ...rotated };
};

/* Convert a point from sensor coordinates to stream coordinates */
export const referenceToStream = (
  point: MaskPoint,
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>,
  rotation: StreamRotation,
  streamWidth: number,
  streamHeight: number
): MaskPoint => {
  const { width: sensorWidth, height: sensorHeight } = frame;

  /* Step 1: rotate the point clockwise together with the image */
  let rotatedX = point.x;
  let rotatedY = point.y;
  switch (rotation) {
    case 90:
      rotatedX = sensorHeight - point.y;
      rotatedY = point.x;
      break;
    case 180:
      rotatedX = sensorWidth - point.x;
      rotatedY = sensorHeight - point.y;
      break;
    case 270:
      rotatedX = point.y;
      rotatedY = sensorWidth - point.x;
      break;
  }

  /* Step 2: remove the cropped margin and scale to the stream size */
  const visible = getVisibleRegion(frame, rotation, streamWidth, streamHeight);
  return {
    x: ((rotatedX - visible.x) * streamWidth) / visible.width,
    y: ((rotatedY - visible.y) * streamHeight) / visible.height
  };
};

/* Convert a point from stream coordinates to sensor coordinates.
 * The result is not rounded and may lie outside the image, which is what
 * drag calculations need. Use streamToReference for points to save.
 */
export const streamToReferenceRaw = (
  point: MaskPoint,
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>,
  rotation: StreamRotation,
  streamWidth: number,
  streamHeight: number
): MaskPoint => {
  const { width: sensorWidth, height: sensorHeight } = frame;

  /* Step 1: undo the scaling and add back the cropped margin */
  const visible = getVisibleRegion(frame, rotation, streamWidth, streamHeight);
  const rotatedX = visible.x + (point.x * visible.width) / streamWidth;
  const rotatedY = visible.y + (point.y * visible.height) / streamHeight;

  /* Step 2: undo the rotation (the reverse of referenceToStream) */
  switch (rotation) {
    case 90:
      return { x: rotatedY, y: sensorHeight - rotatedX };
    case 180:
      return { x: sensorWidth - rotatedX, y: sensorHeight - rotatedY };
    case 270:
      return { x: sensorWidth - rotatedY, y: rotatedX };
    default:
      return { x: rotatedX, y: rotatedY };
  }
};

/* Convert a point from stream coordinates to whole sensor pixels that are
 * inside the image, as required by the camera.
 */
export const streamToReference = (
  point: MaskPoint,
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>,
  rotation: StreamRotation,
  streamWidth: number,
  streamHeight: number
): MaskPoint => {
  const raw = streamToReferenceRaw(
    point,
    frame,
    rotation,
    streamWidth,
    streamHeight
  );
  return {
    x: clamp(Math.round(raw.x), 0, frame.width - 1),
    y: clamp(Math.round(raw.y), 0, frame.height - 1)
  };
};

/* Format points the way the camera expects them: "x1,y1:x2,y2:..." */
export const toPxPolygon = (points: MaskPoint[]): string =>
  points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(':');

/* Parse a resolution string such as "1920x1080" */
export const parseResolution = (
  value: string | undefined | null
): { width: number; height: number } | null => {
  const match = /^\s*(\d+)x(\d+)\s*$/.exec(value ?? '');
  if (!match) {
    return null;
  }
  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  return width > 0 && height > 0 ? { width, height } : null;
};

/* Pick the largest resolution from a list such as "1920x1080,3840x2160" */
export const getMaxResolution = (
  list: string | undefined | null
): { width: number; height: number } | null =>
  (list ?? '')
    .split(',')
    .map(parseResolution)
    .reduce<{ width: number; height: number } | null>((best, res) => {
      if (!res) {
        return best;
      }
      if (!best || res.width * res.height > best.width * best.height) {
        return res;
      }
      return best;
    }, null);

/* Convert the camera's mask list response into masks, skipping invalid entries */
export const parseMaskList = (json: unknown): PrivacyMask[] | null => {
  const list = (json as { listpx?: unknown })?.listpx;
  if (!Array.isArray(list)) {
    return null;
  }
  return list
    .filter(
      (item) =>
        item &&
        Number.isInteger(item.id) &&
        typeof item.name === 'string' &&
        Array.isArray(item.position)
    )
    .map((item) => {
      /* PTZ cameras report both the full outline (all_position) and the part
       * currently in view (position). Use the full outline when available.
       */
      const raw = Array.isArray(item.all_position)
        ? item.all_position
        : item.position;
      return {
        id: item.id,
        name: item.name,
        enabled: item.enabled !== false,
        zoomLowLimit: Number(item.zoomlowlimit) || 0,
        points: raw
          .filter(
            (p: MaskPoint) => Number.isFinite(p?.x) && Number.isFinite(p?.y)
          )
          .map((p: MaskPoint) => ({ x: p.x, y: p.y }))
      };
    });
};

/* A rectangular area in sensor coordinates. Min and max are both inclusive. */
export interface ReferenceBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/* Default shape for a new mask: a rectangle in the middle of the given area,
 * 20% of its width and height.
 */
export const createDefaultPolygon = (bounds: ReferenceBounds): MaskPoint[] => {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const w = Math.round(width * 0.2);
  const h = Math.round(height * 0.2);
  const x0 = Math.round(bounds.minX + (width - w) / 2);
  const y0 = Math.round(bounds.minY + (height - h) / 2);
  return [
    { x: x0, y: y0 },
    { x: x0 + w, y: y0 },
    { x: x0 + w, y: y0 + h },
    { x: x0, y: y0 + h }
  ];
};

/* The whole sensor image as bounds */
export const getFrameBounds = (
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>
): ReferenceBounds => ({
  minX: 0,
  minY: 0,
  maxX: frame.width - 1,
  maxY: frame.height - 1
});

/* The part of the sensor image that is visible in the stream, as bounds */
export const getVisibleBounds = (
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>,
  rotation: StreamRotation,
  streamWidth: number,
  streamHeight: number
): ReferenceBounds => {
  if (streamWidth <= 0 || streamHeight <= 0) {
    return getFrameBounds(frame);
  }
  /* Convert the stream's top-left and bottom-right corners. The bottom-right
   * corner lies just past the last visible pixel, hence the - 1 below.
   */
  const a = streamToReferenceRaw(
    { x: 0, y: 0 },
    frame,
    rotation,
    streamWidth,
    streamHeight
  );
  const b = streamToReferenceRaw(
    { x: streamWidth, y: streamHeight },
    frame,
    rotation,
    streamWidth,
    streamHeight
  );
  return {
    minX: clamp(Math.ceil(Math.min(a.x, b.x)), 0, frame.width - 1),
    minY: clamp(Math.ceil(Math.min(a.y, b.y)), 0, frame.height - 1),
    maxX: clamp(Math.ceil(Math.max(a.x, b.x)) - 1, 0, frame.width - 1),
    maxY: clamp(Math.ceil(Math.max(a.y, b.y)) - 1, 0, frame.height - 1)
  };
};

/* Move a polygon by dx/dy, stopping at the edges of the bounds.
 * A polygon that is already partly outside (e.g. after switching to a cropped
 * stream) is not pulled inside, but it cannot be moved further out either.
 */
export const translatePolygon = (
  points: MaskPoint[],
  dx: number,
  dy: number,
  bounds: ReferenceBounds
): MaskPoint[] => {
  if (points.length === 0) {
    return points;
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const boundedDx = clamp(
    dx,
    Math.min(0, bounds.minX - Math.min(...xs)),
    Math.max(0, bounds.maxX - Math.max(...xs))
  );
  const boundedDy = clamp(
    dy,
    Math.min(0, bounds.minY - Math.min(...ys)),
    Math.max(0, bounds.maxY - Math.max(...ys))
  );
  return points.map((p) => ({
    x: Math.round(p.x + boundedDx),
    y: Math.round(p.y + boundedDy)
  }));
};

/* Next free "Mask N" name */
export const generateMaskName = (existing: string[]): string => {
  const names = new Set(existing);
  let index = existing.length + 1;
  while (names.has(`Mask ${index}`)) {
    index++;
  }
  return `Mask ${index}`;
};
