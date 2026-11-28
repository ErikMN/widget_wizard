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

/* Frame rate is measured in frames per second and bitrate in bits per second. */
export interface StreamMetrics {
  readonly encoding?: string;
  readonly frameRate?: number;
  readonly bitrate?: number;
}

/* Times are in seconds. The current time is relative to the range start. */
export interface PlaybackTimeline {
  readonly start?: number;
  readonly end?: number;
  readonly readCurrentTime: () => number;
}

export interface PlaybackProperties {
  readonly el: PlayerNativeElement;
  readonly width: number;
  readonly height: number;
  /* Initial volume from zero to one, when audio controls are available. */
  readonly volume?: number;
  readonly timeline?: PlaybackTimeline;
  readonly readMetrics?: () => StreamMetrics;
}

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
