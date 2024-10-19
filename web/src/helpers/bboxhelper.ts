/**
 * Helper functions for drawing bounding boxes
 */

/* Widget backend uses 1920x1080 HD resolution */
export const HD_WIDTH = 1920;

/* Calculate widget size in pixels */
export const calculateWidgetSizeInPixels = (
  widgetWidth: number,
  widgetHeight: number,
  scaleFactor: number,
  dimensions: { pixelWidth: number; pixelHeight: number }
) => {
  let widgetWidthPx = Math.min(
    widgetWidth * scaleFactor,
    dimensions.pixelWidth
  );
  let widgetHeightPx = Math.min(
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
  const widgetX =
    ((position.x - Xmin) / (Xmax - Xmin)) *
    (dimensions.pixelWidth - widgetWidthPx);
  const widgetY =
    ((position.y - Ymin) / (Ymax - Ymin)) *
    (dimensions.pixelHeight - widgetHeightPx);

  return { x: widgetX, y: widgetY };
};
