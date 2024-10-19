/**
 * Helper functions for drawing bounding boxes
 */

/* Widget backend uses 1920x1080 HD resolution */
export const HD_WIDTH = 1920;

export interface Dimensions {
  videoWidth: number; // Video stream width
  videoHeight: number; // Video stream height
  pixelWidth: number; // Video pixel width
  pixelHeight: number; // Video pixel height
  offsetX: number; // Offset X (left margin of the video in the container)
  offsetY: number; // Offset Y (top margin of the video in the container)
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
  position: { x: number; y: number },
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

  /* Clamp the position to ensure the widget doesn't go outside the bounds */
  widgetX = Math.max(
    0,
    Math.min(widgetX, dimensions.pixelWidth - widgetWidthPx)
  );
  widgetY = Math.max(
    0,
    Math.min(widgetY, dimensions.pixelHeight - widgetHeightPx)
  );

  return { x: widgetX, y: widgetY };
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
