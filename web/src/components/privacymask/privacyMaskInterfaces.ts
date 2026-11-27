/* Privacy mask types */

export interface MaskPoint {
  x: number;
  y: number;
}

/* A privacy mask as reported by the camera.
 * Points are in sensor coordinates (see MaskReferenceFrame).
 */
export interface PrivacyMask {
  id: number;
  name: string;
  enabled: boolean;
  zoomLowLimit: number;
  points: MaskPoint[];
}

export type MaskColor = 'black' | 'grey' | 'white' | 'red' | 'mosaic';

export const MASK_COLORS: MaskColor[] = [
  'black',
  'grey',
  'white',
  'red',
  'mosaic'
];

/* What the camera supports, read from its Properties.PrivacyMask parameters */
export interface PrivacyMaskCapabilities {
  supported: boolean;
  maxMasks: number;
  maxCorners: number;
}

/* How masks look. The camera uses one setting for all masks on a channel. */
export interface PrivacyMaskAppearance {
  color: MaskColor;
  mosaicScale: number;
  mosaicScaleMin: number;
  mosaicScaleMax: number;
}

/* The camera's full, unrotated image ("sensor coordinates").
 *
 * All mask requests use this size and no rotation. Some firmware versions
 * ignore the resolution and rotation we ask for and always use the full
 * unrotated image, so this is the only choice that works on every camera.
 * The app converts to the video being played itself.
 */
export interface MaskReferenceFrame {
  source: number;
  width: number;
  height: number;
}

/* How much the played video is rotated, in degrees clockwise */
export type StreamRotation = 0 | 90 | 180 | 270;
