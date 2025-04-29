/**
 * Helper functions for drawing bounding boxes
 */
import { Dimensions } from '../components/widget/widgetInterfaces';

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
    nearTop &&
    Math.abs(widgetCenterX - videoCenterX) < TOPBOTTOM_THRESHOLD_X &&
    Math.abs(widgetCenterY - videoCenterY) < TOPBOTTOM_THRESHOLD_Y;

  const nearBottomCenter =
    nearBottom &&
    Math.abs(widgetCenterX - videoCenterX) < TOPBOTTOM_THRESHOLD_X &&
    Math.abs(widgetCenterY - videoCenterY) < TOPBOTTOM_THRESHOLD_Y;

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
