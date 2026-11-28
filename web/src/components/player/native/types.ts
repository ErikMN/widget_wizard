/* Format identifiers are persisted in local storage. */
export const STREAM_FORMATS = [
  'MP4_H264',
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

export const isStreamFormat = (value: unknown): value is StreamFormat =>
  STREAM_FORMATS.some((format) => format === value);

export const getStreamFormat = (
  value: unknown,
  fallback: StreamFormat
): StreamFormat => (isStreamFormat(value) ? value : fallback);
