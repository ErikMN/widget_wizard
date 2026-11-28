import React, { forwardRef } from 'react';
import {
  PlaybackArea as LegacyPlaybackArea,
  Format,
  type VideoProperties
} from 'media-stream-player';
import { HttpImage } from './HttpImage';
import { getStreamUrls } from './streamUrls';
import type { PlaybackRequest, PlayerNativeElement } from './types';

interface PlaybackAreaProps {
  readonly request: PlaybackRequest;
  readonly offset: number;
  readonly onPlaying: (properties: VideoProperties) => void;
  readonly onEnded: () => void;
  readonly autoRetry: boolean;
}

/* Select the playback component without exposing transport details to the UI. */
export const PlaybackArea = forwardRef<PlayerNativeElement, PlaybackAreaProps>(
  ({ request, offset, onPlaying, onEnded, autoRetry }, ref) => {
    const { play, host, format, parameters, refresh, secure } = request;

    if (format === 'JPEG' || format === 'MJPEG') {
      const src = play
        ? getStreamUrls(
            host,
            secure ?? (window.location.protocol === 'https:'),
            format,
            parameters,
            refresh
          )?.url
        : undefined;

      return (
        <HttpImage
          key={src ?? format}
          ref={ref as React.Ref<HTMLImageElement>}
          src={src}
          onPlaying={onPlaying}
        />
      );
    }

    /* The remaining formats still use the upstream playback implementation. */
    return (
      <LegacyPlaybackArea
        key={play && host ? JSON.stringify(request) : undefined}
        forwardedRef={ref}
        refresh={refresh}
        play={play}
        offset={offset}
        host={host}
        format={Format[format]}
        parameters={parameters}
        onPlaying={onPlaying}
        onEnded={onEnded}
        secure={secure}
        autoRetry={autoRetry}
      />
    );
  }
);

PlaybackArea.displayName = 'PlaybackArea';
