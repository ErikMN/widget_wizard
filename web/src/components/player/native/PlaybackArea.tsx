import React, { forwardRef, useCallback } from 'react';
import {
  PlaybackArea as LegacyPlaybackArea,
  Format,
  type VideoProperties
} from 'media-stream-player';
import { HttpImage } from './HttpImage';
import { HttpMp4Video } from './HttpMp4Video';
import { getStreamUrls } from './streamUrls';
import { adaptLegacyPlaybackProperties } from './legacyPlaybackProperties';
import type {
  PlaybackProperties,
  PlaybackRequest,
  PlayerNativeElement
} from './types';

interface PlaybackAreaProps {
  readonly request: PlaybackRequest;
  readonly onPlaying: (properties: PlaybackProperties) => void;
  readonly onEnded: (retry?: boolean) => void;
  readonly autoRetry: boolean;
}

/* Select the playback component without exposing transport details to the UI. */
export const PlaybackArea = forwardRef<PlayerNativeElement, PlaybackAreaProps>(
  ({ request, onPlaying, onEnded, autoRetry }, ref) => {
    const { play, host, format, parameters, refresh, offset, secure } = request;
    const onLegacyPlaying = useCallback(
      (properties: VideoProperties) =>
        onPlaying(adaptLegacyPlaybackProperties(properties)),
      [onPlaying]
    );

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
          onEnded={onEnded}
        />
      );
    }

    if (format === 'MP4_H264' || format === 'MP4_AV1') {
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
        <HttpMp4Video
          key={src ?? format}
          ref={ref as React.Ref<HTMLVideoElement>}
          src={src}
          onPlaying={onPlaying}
          onEnded={onEnded}
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
        onPlaying={onLegacyPlaying}
        onEnded={onEnded}
        secure={secure}
        autoRetry={autoRetry}
      />
    );
  }
);

PlaybackArea.displayName = 'PlaybackArea';
