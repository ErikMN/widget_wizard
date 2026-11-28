import React, {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import { startHttpMp4Stream } from './httpMp4Stream';
import type { VideoProperties } from 'media-stream-player';

interface HttpMp4VideoProps {
  readonly src?: string;
  readonly onPlaying: (properties: VideoProperties) => void;
  readonly onEnded: (retry: boolean) => void;
}

export const HttpMp4Video = forwardRef<HTMLVideoElement, HttpMp4VideoProps>(
  ({ src, onPlaying, onEnded }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    useImperativeHandle(ref, () => videoRef.current!, []);

    useLayoutEffect(() => {
      const video = videoRef.current;
      if (!video || !src) {
        return;
      }

      let playing = false;
      let width = 0;
      let height = 0;

      const reportDimensions = () => {
        if (!playing || !video.videoWidth || !video.videoHeight) {
          return;
        }
        if (width === video.videoWidth && height === video.videoHeight) {
          return;
        }

        width = video.videoWidth;
        height = video.videoHeight;
        onPlaying({
          el: video,
          width,
          height,
          formatSupportsAudio: true
        });
      };

      const handlePlaying = () => {
        playing = true;
        reportDimensions();
      };

      video.addEventListener('playing', handlePlaying);
      video.addEventListener('resize', reportDimensions);
      const stop = startHttpMp4Stream(video, src, onEnded);

      return () => {
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('resize', reportDimensions);
        stop();
      };
    }, [src, onPlaying, onEnded]);

    return (
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ maxHeight: '100%', objectFit: 'contain', width: '100%' }}
      />
    );
  }
);

HttpMp4Video.displayName = 'HttpMp4Video';
