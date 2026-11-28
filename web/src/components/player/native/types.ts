/* Format identifiers are persisted in local storage. */
export const STREAM_FORMATS = [
  'MP4_H264',
  'MP4_AV1',
  'RTP_H264',
  'RTP_JPEG',
  'MJPEG',
  'JPEG'
] as const;

export type StreamFormat = (typeof STREAM_FORMATS)[number];

export type PlayerNativeElement =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement;

export interface VapixParameters {
  readonly [key: string]: string;
}

export interface PlaybackRequest {
  readonly play: boolean;
  readonly host: string;
  readonly format: StreamFormat;
  readonly parameters: VapixParameters;
  readonly refresh: number;
  readonly offset: number;
  readonly secure?: boolean;
}

export const isStreamFormat = (value: unknown): value is StreamFormat =>
  STREAM_FORMATS.some((format) => format === value);

/* Probe AV1 Main profile, level 4.0, Main tier, 8-bit.
 * The HTTP response MIME type is checked again before playback.
 */
const AV1_TEST_MIME = 'video/mp4; codecs="av01.0.08M.08"';

export const getAvailableStreamFormats = (
  deviceFormats: string | undefined,
  mediaSource: Pick<typeof MediaSource, 'isTypeSupported'> | undefined =
    typeof MediaSource === 'undefined' ? undefined : MediaSource
): StreamFormat[] => {
  const supportsAv1 =
    (deviceFormats ?? '')
      .split(',')
      .map((format) => format.trim().toLowerCase())
      .includes('av1') &&
    mediaSource?.isTypeSupported(AV1_TEST_MIME) === true;

  return STREAM_FORMATS.filter(
    (format) => format !== 'MP4_AV1' || supportsAv1
  );
};

export const getStreamFormat = (
  value: unknown,
  fallback: StreamFormat,
  availableFormats: readonly StreamFormat[]
): StreamFormat => {
  if (isStreamFormat(value) && availableFormats.includes(value)) {
    return value;
  }

  return availableFormats.includes(fallback) ? fallback : 'MP4_H264';
};
