/* Privacy mask interface definitions */

export interface MaskPoint {
  x: number;
  y: number;
}

/* A privacy mask as reported by privacymask.cgi (query=listpxjson).
 * Points are stored in the reference frame (see MaskReferenceFrame).
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

/* Device limits read from root.Properties.PrivacyMask.* */
export interface PrivacyMaskCapabilities {
  supported: boolean;
  maxMasks: number;
  maxCorners: number;
}

/* Mask appearance shared by all masks on an image source */
export interface PrivacyMaskAppearance {
  color: MaskColor;
  mosaicScale: number;
  mosaicScaleMin: number;
  mosaicScaleMax: number;
}

/* Canonical coordinate frame used when talking to privacymask.cgi.
 *
 * Firmware differs in how it treats imageresolution/imagerotation: some
 * versions convert coordinates, others ignore both and always use the full
 * unrotated sensor resolution. Always requesting the full unrotated sensor
 * resolution works on both, and the client maps to the displayed stream.
 */
export interface MaskReferenceFrame {
  source: number;
  width: number;
  height: number;
}

/* Rotation (degrees clockwise) applied to the displayed stream */
export type StreamRotation = 0 | 90 | 180 | 270;
