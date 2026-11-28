/* Video overlay geometry
 *
 * Calculate the visible image rectangle from the decoded video dimensions
 * and the element's position and size. Widgets use this rectangle instead
 * of the entire element so they stay aligned with the image when black bars
 * appear. The calculations are independent of the DOM and React.
 */
import type { Dimensions } from '../../appInterface';

const DIMENSIONS_EPSILON = 0.5;

export const dimensionsEqual = (a: Dimensions, b: Dimensions): boolean =>
  a.videoWidth === b.videoWidth &&
  a.videoHeight === b.videoHeight &&
  Math.abs(a.pixelWidth - b.pixelWidth) < DIMENSIONS_EPSILON &&
  Math.abs(a.pixelHeight - b.pixelHeight) < DIMENSIONS_EPSILON &&
  Math.abs(a.offsetX - b.offsetX) < DIMENSIONS_EPSILON &&
  Math.abs(a.offsetY - b.offsetY) < DIMENSIONS_EPSILON;

type ElementRect = Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>;

/* Calculate the visible content rectangle for centered, contained media. */
export const calculateVideoDimensions = (
  videoWidth: number,
  videoHeight: number,
  videoRect: ElementRect,
  containerRect: Pick<ElementRect, 'left' | 'top'>
): Dimensions => {
  /* Video element pixel dimensions
   *
   * We track TWO coordinate spaces:
   *
   * 1) Stream space (videoWidth/videoHeight)
   *    - The decoded media resolution provided by the stream (e.g. 1920x1080).
   *
   * 2) Screen space (pixelWidth/pixelHeight + offsetX/offsetY)
   *    - The exact on-screen rectangle where the video content
   *      is visible, in CSS pixels, relative to the container.
   *
   * Screen space explicitly excludes any black bars and defines
   * the maximum drawable area for bounding boxes and overlays.
   */
  /* Element border-box size in CSS pixels (includes any internal black bars) */
  const elementPixelWidth = videoRect.width;
  const elementPixelHeight = videoRect.height;

  /* Default assumption: content fills the element (no letterbox/pillarbox) */
  let pixelWidth = elementPixelWidth;
  let pixelHeight = elementPixelHeight;

  /* Element top-left relative to the container (CSS pixels) */
  let offsetX = videoRect.left - containerRect.left;
  let offsetY = videoRect.top - containerRect.top;

  /* If the element preserves aspect ratio, its box may include black bars.
   * Compare aspect ratios to find the visible content box:
   *
   * - element wider than stream -> pillarbox (bars left/right)
   * - element taller than stream -> letterbox (bars top/bottom)
   *
   * Update pixelWidth/pixelHeight to the visible content size and shift offsetX/offsetY
   * to the content’s top-left corner.
   */
  if (
    videoWidth > 0 &&
    videoHeight > 0 &&
    elementPixelWidth > 0 &&
    elementPixelHeight > 0
  ) {
    const streamAspect = videoWidth / videoHeight;
    const elementAspect = elementPixelWidth / elementPixelHeight;

    if (elementAspect > streamAspect) {
      /* Element is wider than stream: pillarboxing (black bars left/right) */
      pixelHeight = elementPixelHeight;
      pixelWidth = elementPixelHeight * streamAspect;
      offsetX += (elementPixelWidth - pixelWidth) / 2;
    } else if (elementAspect < streamAspect) {
      /* Element is taller than stream: letterboxing (black bars top/bottom) */
      pixelWidth = elementPixelWidth;
      pixelHeight = elementPixelWidth / streamAspect;
      offsetY += (elementPixelHeight - pixelHeight) / 2;
    }
  }
  /* Set stream and pixel dimensions
   *
   * The resulting values describe the visible video content only.
   * Any consumer of these dimensions (e.g. OverlaySurface) can rely on:
   * - pixelWidth/pixelHeight being fully visible on screen
   * - offsetX/offsetY pointing to the top-left corner of that area
   */
  return {
    videoWidth, // Stream width
    videoHeight, // Stream height
    pixelWidth, // Pixel width (visible content only)
    pixelHeight, // Pixel height (visible content only)
    offsetX, // Offset X (left margin of the video content in the container)
    offsetY // Offset Y (top margin of the video content in the container)
  };
};
