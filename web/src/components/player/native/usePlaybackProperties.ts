import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { PlaybackProperties, PlaybackRequest } from './types';

/* Keep playback properties associated with the request that produced them.
 * The last known aspect ratio remains available while a new stream starts.
 */
export const usePlaybackProperties = (
  request: PlaybackRequest | undefined,
  onStreamEnded?: () => void
) => {
  const activeRequest = useRef<PlaybackRequest | undefined>(undefined);
  const [report, setReport] = useState<{
    request: PlaybackRequest;
    properties?: PlaybackProperties;
  }>();
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<number>();
  const [volume, setVolume] = useState<number>();

  useLayoutEffect(() => {
    activeRequest.current = request;
    setReport((previous) =>
      previous?.request === request ? previous : undefined
    );
    setVolume(undefined);

    return () => {
      activeRequest.current = undefined;
    };
  }, [request]);

  const onPlaying = useCallback(
    (properties: PlaybackProperties) => {
      if (!request || activeRequest.current !== request) {
        return;
      }

      setReport({ request, properties });
      if (properties.width > 0 && properties.height > 0) {
        setNaturalAspectRatio(properties.width / properties.height);
      }
      setVolume(properties.volume);
    },
    [request]
  );

  const onEnded = useCallback(
    (retry = true) => {
      if (!request || activeRequest.current !== request) {
        return;
      }

      activeRequest.current = undefined;
      setReport({ request });
      setVolume(undefined);
      if (retry) {
        onStreamEnded?.();
      }
    },
    [request, onStreamEnded]
  );

  const videoProperties =
    report?.request === request ? report?.properties : undefined;

  return {
    videoProperties,
    waiting: request !== undefined && report?.request !== request,
    ended:
      request !== undefined && report?.request === request && !videoProperties,
    naturalAspectRatio,
    volume: videoProperties?.volume === undefined ? undefined : volume,
    setVolume,
    onPlaying,
    onEnded
  };
};
