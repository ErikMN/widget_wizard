/**
 * Helper functions for drawing bounding boxes
 */

/* Widget backend uses 1920x1080 HD resolution */
export const HD_WIDTH = 1920;
export const EPSILON = 1e-6;

export interface Dimensions {
  videoWidth: number; // Video stream width
  videoHeight: number; // Video stream height
  pixelWidth: number; // Video pixel width
  pixelHeight: number; // Video pixel height
  offsetX: number; // Offset X (left margin of the video in the container)
  offsetY: number; // Offset Y (top margin of the video in the container)
}

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
