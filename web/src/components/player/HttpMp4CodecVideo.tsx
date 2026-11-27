/**
 * HttpMp4CodecVideo
 *
 * Plays an MP4 stream over HTTP with a chosen video codec, e.g. AV1.
 *
 * The media-stream-player library only supports H.264 for MP4 streams: its
 * player always asks the camera for videocodec=h264. This component does the
 * same as the library's MP4 player, but asks for the codec given here. It uses
 * the library's own streaming pipeline, which hands the stream to the browser
 * using the codec the camera reports, so the browser does the decoding.
 */
import React, { useEffect, useRef } from 'react';
import { MessageType, MseSink } from 'media-stream-library';
import {
  PlayerNativeElement,
  VapixParameters,
  VideoProperties
} from 'media-stream-player';

interface HttpMp4CodecVideoProps {
  readonly forwardedRef?: React.Ref<PlayerNativeElement>;
  /* Camera address, empty to stop the stream */
  readonly host: string;
  /* Video codec to ask the camera for, e.g. "av1" */
  readonly videocodec: string;
  /* Stream settings from the player, e.g. resolution and fps */
  readonly parameters?: VapixParameters;
  /* Whether the video should be playing */
  readonly play?: boolean;
  /* Increased by the player to restart the stream */
  readonly refresh: number;
  readonly secure?: boolean;
  /* Called when the video starts playing */
  readonly onPlaying: (properties: VideoProperties) => void;
  /* Called when the camera closes the stream */
  readonly onEnded?: () => void;
  /* Called when the stream cannot be played */
  readonly onError: () => void;
}

/* Build the stream address, the same way the library does for H.264 */
const buildStreamUrl = (
  host: string,
  secure: boolean,
  videocodec: string,
  parameters: VapixParameters,
  refresh: number
): string => {
  if (!host) {
    return '';
  }
  const query = new URLSearchParams({
    ...parameters,
    /* A changing value makes every refresh open a new stream */
    timestamp: String(refresh),
    videocodec,
    container: 'mp4'
  });
  return `${secure ? 'https' : 'http'}://${host}/axis-cgi/media.cgi?${query.toString()}`;
};

export const HttpMp4CodecVideo: React.FC<HttpMp4CodecVideoProps> = ({
  forwardedRef,
  host,
  videocodec,
  parameters = {},
  play = false,
  refresh,
  secure = window.location.protocol === 'https:',
  onPlaying,
  onEnded,
  onError
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /* Keep the latest callbacks without restarting the stream when they change */
  const onPlayingRef = useRef(onPlaying);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onPlayingRef.current = onPlaying;
    onEndedRef.current = onEnded;
    onErrorRef.current = onError;
  }, [onPlaying, onEnded, onError]);

  /* Share the video element with the player, like the library's players do */
  const setVideoRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (typeof forwardedRef === 'function') {
      forwardedRef(el);
    } else if (forwardedRef) {
      (
        forwardedRef as React.MutableRefObject<PlayerNativeElement | null>
      ).current = el;
    }
  };

  const src = buildStreamUrl(host, secure, videocodec, parameters, refresh);

  /* Open the stream when there is an address and playback is requested */
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!src || !play || videoEl === null) {
      return;
    }

    const sink = new MseSink(videoEl);
    const controller = new AbortController();
    const { signal } = controller;
    let hasPlayed = false;

    const close = () => {
      if (signal.aborted) {
        return;
      }
      controller.abort();
      sink.incoming.destroy();
      if (videoEl.hasAttribute('src')) {
        URL.revokeObjectURL(videoEl.src);
        videoEl.removeAttribute('src');
        videoEl.load();
      }
    };

    const handleError = (error: unknown) => {
      if (signal.aborted) {
        return;
      }
      close();
      console.error('MP4 stream error:', error);
      onErrorRef.current();
    };

    const endStream = () => {
      if (signal.aborted) {
        return;
      }
      if (!hasPlayed) {
        handleError(new Error('The stream ended before playback started'));
        return;
      }
      sink.incoming.end();
      onEndedRef.current?.();
    };

    /* Start playing as soon as the browser has enough data */
    const handleCanPlay = () => {
      void videoEl.play().catch(handleError);
    };

    /* Report the video size to the player once it is playing */
    const handlePlaying = () => {
      hasPlayed = true;
      onPlayingRef.current({
        el: videoEl,
        width: videoEl.videoWidth,
        height: videoEl.videoHeight,
        formatSupportsAudio: true
      });
    };

    videoEl.addEventListener('canplay', handleCanPlay, { signal });
    videoEl.addEventListener('playing', handlePlaying, { signal });
    videoEl.addEventListener('error', () => handleError(videoEl.error), {
      signal
    });
    sink.incoming.on('error', handleError);

    /* Fetch directly so connection failures reach the player */
    const startStream = async () => {
      const response = await fetch(src, { credentials: 'include', signal });
      if (signal.aborted) {
        return;
      }
      if (!response.ok || response.body === null) {
        throw new Error(`Invalid stream response (${response.status})`);
      }
      let mime = response.headers.get('Content-Type') ?? undefined;
      if (!mime) {
        throw new Error('Missing stream Content-Type');
      }

      const reader = response.body.getReader();
      const readNext = async () => {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (error) {
          if (hasPlayed) {
            endStream();
          } else {
            handleError(error);
          }
          return;
        }
        if (signal.aborted) {
          return;
        }
        if (chunk.done) {
          reader.releaseLock();
          endStream();
          return;
        }

        const message = { type: MessageType.ISOM, data: chunk.value, mime };
        mime = undefined;
        sink.incoming.write(message, (error?: Error | null) => {
          if (error) {
            handleError(error);
          } else if (!signal.aborted) {
            void readNext().catch(handleError);
          }
        });
      };
      await readNext();
    };
    void startStream().catch(handleError);

    return close;
  }, [src, play]);

  return (
    <video
      ref={setVideoRef}
      autoPlay
      muted
      playsInline
      style={{ maxHeight: '100%', objectFit: 'contain', width: '100%' }}
    />
  );
};
