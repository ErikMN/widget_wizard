/**
 * Stream formats offered by the player.
 *
 * The media-stream-player library's formats are extended with MP4_AV1, which
 * is played by HttpMp4CodecVideo instead of the library's player.
 */
import type { Format } from 'media-stream-player';

export const MP4_AV1 = 'MP4_AV1';

/* Same value as the library's Format.MP4_H264. Only types are imported from
 * the library so this file stays free of runtime dependencies.
 */
const MP4_H264 = 'MP4_H264' as Format;

export type StreamFormat = Format | typeof MP4_AV1;

/* A common AV1 profile (Main, 8-bit) used to ask the browser about support */
const AV1_TEST_MIME = 'video/mp4; codecs="av01.0.08M.08"';

/* True if the camera lists AV1 among its supported video formats */
export const deviceSupportsAv1 = (
  parameters: { [key: string]: string } | null
): boolean =>
  (parameters?.['root.Properties.Image.Format'] ?? '')
    .split(',')
    .map((format) => format.trim())
    .includes('av1');

/* True if this browser can decode AV1 in an MP4 stream */
export const browserSupportsAv1 = (): boolean =>
  typeof MediaSource !== 'undefined' &&
  MediaSource.isTypeSupported(AV1_TEST_MIME);

/* The format to actually play. A saved AV1 choice falls back to H.264 when
 * the current camera or browser cannot play AV1.
 */
export const getPlayableFormat = (
  format: StreamFormat,
  av1Supported: boolean
): StreamFormat => (format === MP4_AV1 && !av1Supported ? MP4_H264 : format);
