import type { StreamFormat } from './types';

export interface StreamMetrics {
  readonly encoding?: string;
  readonly frameRate?: number;
  readonly bitrate?: number;
}

interface StreamStat {
  readonly name: string;
  readonly value: string | number;
  readonly unit?: string;
}

const streamTypes: Record<StreamFormat, string> = {
  JPEG: 'Still image',
  MJPEG: 'MJPEG',
  RTP_JPEG: 'MJPEG',
  RTP_H264: 'RTSP (WebSocket)',
  MP4_H264: 'MP4 (HTTP)'
};

/* Bitrate is supplied in bits per second and frame rate in frames per second. */
export const getStreamStats = (
  format: StreamFormat,
  width: number,
  height: number,
  refresh: number,
  volume: number | undefined,
  metrics: StreamMetrics = {}
): StreamStat[] => {
  const stats: StreamStat[] = [
    { name: 'Stream type', value: streamTypes[format] },
    { name: 'Resolution', value: `${width}x${height}` },
    { name: 'Refreshed', value: refresh, unit: refresh > 1 ? 'times' : 'time' }
  ];

  if (metrics.encoding !== undefined) {
    stats.push({ name: 'Encoding', value: metrics.encoding });
  }
  if (metrics.frameRate !== undefined && Number.isFinite(metrics.frameRate)) {
    stats.push({
      name: 'Frame rate',
      value: Number(metrics.frameRate.toFixed(2)),
      unit: 'fps'
    });
  }
  if (metrics.bitrate !== undefined && Number.isFinite(metrics.bitrate)) {
    stats.push({
      name: 'Bitrate',
      value: Math.round(metrics.bitrate / 1000),
      unit: 'kbit/s'
    });
  }
  if (volume !== undefined) {
    stats.push({ name: 'Volume', value: Math.floor(volume * 100), unit: '%' });
  }

  return stats;
};
