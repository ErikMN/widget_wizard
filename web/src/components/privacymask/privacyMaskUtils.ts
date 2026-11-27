/* Privacy mask helpers: coordinate mapping, parsing and naming.
 *
 * Coordinate spaces:
 * - Reference space: full unrotated sensor resolution, used for all CGI calls.
 * - Stream space: the decoded video stream, which is the rotated reference
 *   frame, center-cropped to the stream aspect ratio and scaled.
 * Rotation is in degrees clockwise, matching Axis stream/source rotation.
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

export const normalizeRotation = (value: unknown): StreamRotation => {
  const parsed = ((parseInt(String(value), 10) % 360) + 360) % 360;
  return parsed === 90 || parsed === 180 || parsed === 270 ? parsed : 0;
};

/* Reference frame dimensions after applying the stream rotation */
export const getRotatedSize = (
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>,
  rotation: StreamRotation
): { width: number; height: number } =>
  rotation === 90 || rotation === 270
    ? { width: frame.height, height: frame.width }
    : { width: frame.width, height: frame.height };

/* Region of the rotated reference frame that is visible in the stream.
 *
 * Streams with a different aspect ratio than the sensor are a center crop of
 * the sensor image (e.g. a 4:3 stream from a 16:9 sensor drops the sides),
 * not a stretched version of it.
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
  const frameAspect = rotated.width / rotated.height;
  if (streamAspect < frameAspect) {
    const width = rotated.height * streamAspect;
    return {
      x: (rotated.width - width) / 2,
      y: 0,
      width,
      height: rotated.height
    };
  }
  if (streamAspect > frameAspect) {
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

/* Map a reference-space point to stream space */
export const referenceToStream = (
  point: MaskPoint,
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>,
  rotation: StreamRotation,
  streamWidth: number,
  streamHeight: number
): MaskPoint => {
  const { width: W, height: H } = frame;
  let u = point.x;
  let v = point.y;
  switch (rotation) {
    case 90:
      u = H - point.y;
      v = point.x;
      break;
    case 180:
      u = W - point.x;
      v = H - point.y;
      break;
    case 270:
      u = point.y;
      v = W - point.x;
      break;
  }
  const visible = getVisibleRegion(frame, rotation, streamWidth, streamHeight);
  return {
    x: ((u - visible.x) * streamWidth) / visible.width,
    y: ((v - visible.y) * streamHeight) / visible.height
  };
};

/* Map a stream-space point to reference space without rounding or clamping */
export const streamToReferenceRaw = (
  point: MaskPoint,
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>,
  rotation: StreamRotation,
  streamWidth: number,
  streamHeight: number
): MaskPoint => {
  const { width: W, height: H } = frame;
  const visible = getVisibleRegion(frame, rotation, streamWidth, streamHeight);
  const u = visible.x + (point.x * visible.width) / streamWidth;
  const v = visible.y + (point.y * visible.height) / streamHeight;
  switch (rotation) {
    case 90:
      return { x: v, y: H - u };
    case 180:
      return { x: W - u, y: H - v };
    case 270:
      return { x: W - v, y: u };
    default:
      return { x: u, y: v };
  }
};

/* Map a stream-space point to an integer reference-space point inside the image */
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

/* Serialize points to the CGI pxpolygon format: "x1,y1:x2,y2:..." */
export const toPxPolygon = (points: MaskPoint[]): string =>
  points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(':');

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

/* Largest resolution (by area) from a comma separated resolution list */
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

/* Parse the privacymask.cgi listpxjson response into masks */
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
      /* Prefer the complete polygon when the device also reports a clipped one */
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

/* Default new mask: a centered rectangle covering 20% of each dimension */
export const createDefaultPolygon = (
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>
): MaskPoint[] => {
  const w = Math.round(frame.width * 0.2);
  const h = Math.round(frame.height * 0.2);
  const x0 = Math.round((frame.width - w) / 2);
  const y0 = Math.round((frame.height - h) / 2);
  return [
    { x: x0, y: y0 },
    { x: x0 + w, y: y0 },
    { x: x0 + w, y: y0 + h },
    { x: x0, y: y0 + h }
  ];
};

/* Translate a polygon while keeping all points inside the reference frame */
export const translatePolygon = (
  points: MaskPoint[],
  dx: number,
  dy: number,
  frame: Pick<MaskReferenceFrame, 'width' | 'height'>
): MaskPoint[] => {
  if (points.length === 0) {
    return points;
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const boundedDx = clamp(
    dx,
    -Math.min(...xs),
    frame.width - 1 - Math.max(...xs)
  );
  const boundedDy = clamp(
    dy,
    -Math.min(...ys),
    frame.height - 1 - Math.max(...ys)
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
