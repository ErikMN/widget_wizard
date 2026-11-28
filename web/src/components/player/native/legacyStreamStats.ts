import type { VideoProperties } from 'media-stream-player';
import type { StreamMetrics } from './streamStats';

/* The remaining Axis pipelines expose video track metrics through this adapter. */
export const readLegacyStreamMetrics = (
  properties: VideoProperties
): StreamMetrics => {
  const { pipeline } = properties;
  if (!pipeline || !('tracks' in pipeline) || !pipeline.tracks) {
    return {};
  }

  const index = pipeline.tracks.findIndex((track) => track.type === 'video');
  if (index < 0) {
    return {};
  }

  const codec = pipeline.tracks[index].codec;
  const encoding = codec
    ? `${codec.coding} ${codec.profile} (${codec.level})`
    : undefined;

  return {
    encoding,
    frameRate: pipeline.framerate[index],
    bitrate: pipeline.bitrate[index]
  };
};
