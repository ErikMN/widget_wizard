import type { VideoProperties } from 'media-stream-player';
import type { PlaybackProperties, StreamMetrics } from './types';

const readLegacyStreamMetrics = (
  pipeline: NonNullable<VideoProperties['pipeline']>
): StreamMetrics => {
  if (!('tracks' in pipeline) || !pipeline.tracks) {
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

/* Translate the remaining Axis playback reports without exposing the pipeline. */
export const adaptLegacyPlaybackProperties = (
  properties: VideoProperties
): PlaybackProperties => {
  const { el, width, height, volume, pipeline, range } = properties;
  const playback = { el, width, height, volume };

  if (!pipeline) {
    return playback;
  }

  return {
    ...playback,
    timeline: {
      start: range?.[0],
      end: range?.[1],
      readCurrentTime: () => pipeline.currentTime
    },
    readMetrics: () => readLegacyStreamMetrics(pipeline)
  };
};
