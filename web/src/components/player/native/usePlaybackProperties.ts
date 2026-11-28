import { useCallback, useLayoutEffect, useRef, useState } from 'react';

interface PlaybackProperties {
  readonly width: number;
  readonly height: number;
  readonly volume?: number;
}

/* Keep playback properties associated with the request that produced them.
 * The last known aspect ratio remains available while a new stream starts.
 */
export const usePlaybackProperties = <T extends PlaybackProperties>(
  request: object | undefined
) => {
  const activeRequest = useRef<object | undefined>(undefined);
  const [report, setReport] = useState<{ request: object; properties: T }>();
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
    (properties: T) => {
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

  const videoProperties =
    report?.request === request ? report?.properties : undefined;

  return {
    videoProperties,
    naturalAspectRatio,
    volume: videoProperties?.volume === undefined ? undefined : volume,
    setVolume,
    onPlaying
  };
};
