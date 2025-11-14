/**
 * Helper functions for drawing bounding boxes
 */
import { Dimensions } from '../components/appInterface';

/* Widget backend uses 1920x1080 HD resolution */
export const HD_WIDTH = 1920;

export interface Position {
  x: number;
  y: number;
}

/* Calculate widget size in pixels */
export const calculateWidgetSizeInPixels = (
  widgetWidth: number,
  widgetHeight: number,
  scaleFactor: number,
  dimensions: { pixelWidth: number; pixelHeight: number }
) => {
  /* Limit widget size so it does not exceed video dimensions */
  const widgetWidthPx = Math.min(
    widgetWidth * scaleFactor,
    dimensions.pixelWidth
  );
  const widgetHeightPx = Math.min(
    widgetHeight * scaleFactor,
    dimensions.pixelHeight
  );

  return { widgetWidthPx, widgetHeightPx };
};

/* Get normalized min/max coordinate ranges */
export const getNormalizedCoordinateRanges = (
  widgetWidthPx: number,
  widgetHeightPx: number,
  dimensions: { pixelWidth: number; pixelHeight: number }
) => {
  const Xmin = -1.0;
  const Xmax = 1.0 - 2 * (widgetWidthPx / dimensions.pixelWidth);
  const Ymin = -1.0;
  const Ymax = 1.0 - 2 * (widgetHeightPx / dimensions.pixelHeight);

  return { Xmin, Xmax, Ymin, Ymax };
};

/* Convert widget position to pixel position */
export const calculateWidgetPosition = (
  position: Position,
  widgetWidthPx: number,
  widgetHeightPx: number,
  dimensions: { pixelWidth: number; pixelHeight: number },
  Xmin: number,
  Xmax: number,
  Ymin: number,
  Ymax: number
) => {
  let widgetX =
    ((position.x - Xmin) / (Xmax - Xmin)) *
    (dimensions.pixelWidth - widgetWidthPx);
  let widgetY =
    ((position.y - Ymin) / (Ymax - Ymin)) *
    (dimensions.pixelHeight - widgetHeightPx);

  /* Horizontal Clamping (X-axis) */
  if (widgetWidthPx < dimensions.pixelWidth) {
    widgetX = Math.max(
      0,
      Math.min(widgetX, dimensions.pixelWidth - widgetWidthPx)
    );
  } else {
    /* If the widget is as wide as the video, allow vertical movement */
    widgetX = 0;
  }

  /* Vertical Clamping (Y-axis) */
  if (widgetHeightPx < dimensions.pixelHeight) {
    widgetY = Math.max(
      0,
      Math.min(widgetY, dimensions.pixelHeight - widgetHeightPx)
    );
  } else {
    /* If the widget is as tall as the video, allow horizontal movement */
    widgetY = 0;
  }

  return { x: widgetX, y: widgetY };
};

export const calculateNormalizedPosition = (
  newPos: number,
  min: number,
  max: number,
  sizePx: number,
  totalSize: number
) => {
  return (newPos / (totalSize - sizePx)) * (max - min) + min;
};

export const getWidgetPixelPosition = (
  dimensions: Dimensions,
  scaleFactor: number,
  position: { x: number; y: number },
  widgetWidth: number,
  widgetHeight: number
) => {
  const { widgetWidthPx, widgetHeightPx } = calculateWidgetSizeInPixels(
    widgetWidth,
    widgetHeight,
    scaleFactor,
    dimensions
  );
  const { Xmin, Xmax, Ymin, Ymax } = getNormalizedCoordinateRanges(
    widgetWidthPx,
    widgetHeightPx,
    dimensions
  );

  return calculateWidgetPosition(
    position,
    widgetWidthPx,
    widgetHeightPx,
    dimensions,
    Xmin,
    Xmax,
    Ymin,
    Ymax
  );
};

export interface AlignmentFlags {
  nearTop: boolean;
  nearBottom: boolean;
  nearLeft: boolean;
  nearRight: boolean;
  nearVerticalCenter: boolean;
  nearHorizontalCenter: boolean;
  nearTopCenter: boolean;
  nearBottomCenter: boolean;
  nearCenterLeft: boolean;
  nearCenterRight: boolean;
  isNearCenter: boolean;
}

/* Computes all proximity/guide flags for the current drag position */
export const getAlignmentFlags = (
  newX: number,
  newY: number,
  widgetWidthPx: number,
  widgetHeightPx: number,
  dimensions: Dimensions,
  thresholds: {
    CORNER_THRESHOLD: number;
    CENTER_DISTANCE_THRESHOLD: number;
    TOPBOTTOM_THRESHOLD_X: number;
    TOPBOTTOM_THRESHOLD_Y: number;
    LEFTRIGHT_THRESHOLD_X: number;
    LEFTRIGHT_THRESHOLD_Y: number;
  }
): AlignmentFlags => {
  const {
    CORNER_THRESHOLD,
    CENTER_DISTANCE_THRESHOLD,
    TOPBOTTOM_THRESHOLD_X,
    TOPBOTTOM_THRESHOLD_Y,
    LEFTRIGHT_THRESHOLD_X,
    LEFTRIGHT_THRESHOLD_Y
  } = thresholds;

  /* Widget and video centres */
  const widgetCenterX = newX + widgetWidthPx / 2;
  const widgetCenterY = newY + widgetHeightPx / 2;
  const videoCenterX = dimensions.pixelWidth / 2;
  const videoCenterY = dimensions.pixelHeight / 2;

  /* Edges */
  const nearTop = newY < CORNER_THRESHOLD;
  const nearBottom =
    Math.abs(newY + widgetHeightPx - dimensions.pixelHeight) < CORNER_THRESHOLD;
  const nearLeft = newX < CORNER_THRESHOLD;
  const nearRight =
    Math.abs(newX + widgetWidthPx - dimensions.pixelWidth) < CORNER_THRESHOLD;

  /* Centres */
  const nearVerticalCenter =
    Math.abs(widgetCenterX - videoCenterX) < CENTER_DISTANCE_THRESHOLD;
  const nearHorizontalCenter =
    Math.abs(widgetCenterY - videoCenterY) < CENTER_DISTANCE_THRESHOLD;

  /* Combinations */
  const nearTopCenter =
    nearTop && Math.abs(widgetCenterX - videoCenterX) < TOPBOTTOM_THRESHOLD_X;

  const nearBottomCenter =
    nearBottom &&
    Math.abs(widgetCenterX - videoCenterX) < TOPBOTTOM_THRESHOLD_X;

  const nearCenterLeft =
    Math.abs(widgetCenterY - videoCenterY) < LEFTRIGHT_THRESHOLD_Y &&
    Math.abs(newX - 0) < LEFTRIGHT_THRESHOLD_X;

  const nearCenterRight =
    Math.abs(widgetCenterY - videoCenterY) < LEFTRIGHT_THRESHOLD_Y &&
    Math.abs(newX + widgetWidthPx - dimensions.pixelWidth) <
      LEFTRIGHT_THRESHOLD_X;

  const isNearCenter = nearVerticalCenter && nearHorizontalCenter;

  return {
    nearTop,
    nearBottom,
    nearLeft,
    nearRight,
    nearVerticalCenter,
    nearHorizontalCenter,
    nearTopCenter,
    nearBottomCenter,
    nearCenterLeft,
    nearCenterRight,
    isNearCenter
  };
};

/**
 * Map normalized top-left coords [-1..1] to pixel coords, with size-aware range.
 * Xmin = -1
 * Xmax = 1 - 2*(wPx/pixelW)
 * Same for Y.
 */
export const normalizedToPixel = (
  [nx, ny]: [number, number],
  dims: Dimensions,
  wPx: number,
  hPx: number
) => {
  const pixelW = Math.max(1, dims.pixelWidth);
  const pixelH = Math.max(1, dims.pixelHeight);

  const safeW = Math.min(wPx, pixelW);
  const safeH = Math.min(hPx, pixelH);

  const Xmin = -1.0;
  const Xmax = Math.max(Xmin + 0.0001, 1.0 - 2 * (safeW / pixelW));
  const Ymin = -1.0;
  const Ymax = Math.max(Ymin + 0.0001, 1.0 - 2 * (safeH / pixelH));

  const pw = Math.max(1, pixelW - safeW);
  const ph = Math.max(1, pixelH - safeH);

  let x = ((nx - Xmin) / (Xmax - Xmin)) * pw;
  let y = ((ny - Ymin) / (Ymax - Ymin)) * ph;

  /* Clamp into the video rect */
  x = Math.max(0, Math.min(x, pixelW - safeW));
  y = Math.max(0, Math.min(y, pixelH - safeH));

  return { x, y };
};

/* NOTE: Inverse: pixel top-left -> normalized top-left [-1..1], size-aware. */
export const pixelToNormalized = (
  x: number,
  y: number,
  dims: Dimensions,
  wPx: number,
  hPx: number
) => {
  const pixelW = Math.max(1, dims.pixelWidth);
  const pixelH = Math.max(1, dims.pixelHeight);

  const safeW = Math.min(wPx, pixelW);
  const safeH = Math.min(hPx, pixelH);

  const Xmin = -1.0;
  const Xmax = Math.max(Xmin + 0.0001, 1.0 - 2 * (safeW / pixelW));
  const Ymin = -1.0;
  const Ymax = Math.max(Ymin + 0.0001, 1.0 - 2 * (safeH / pixelH));

  const pw = Math.max(1, pixelW - safeW);
  const ph = Math.max(1, pixelH - safeH);

  const clampedX = Math.max(0, Math.min(x, pixelW - safeW));
  const clampedY = Math.max(0, Math.min(y, pixelH - safeH));

  let nx = (clampedX / pw) * (Xmax - Xmin) + Xmin;
  let ny = (clampedY / ph) * (Ymax - Ymin) + Ymin;

  /* Ensure finite numbers, never null/NaN (NOTE: remove this?) */
  if (!Number.isFinite(nx)) {
    nx = 0;
  }
  if (!Number.isFinite(ny)) {
    ny = 0;
  }

  return { nx, ny };
};
