import React, {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import { startJpegStream } from './rtsp/jpeg/jpegStream';
import type { PlaybackProperties } from './types';
import type { StreamUrls } from './streamUrls';

interface RtpJpegCanvasProps {
  readonly urls?: Extract<StreamUrls, { transport: 'rtsp' }>;
  readonly offset: number;
  readonly onPlaying: (properties: PlaybackProperties) => void;
  readonly onEnded: (retry: boolean) => void;
}

/* The canvas belongs to one playback request, just like the HTTP elements. */
export const RtpJpegCanvas = forwardRef<HTMLCanvasElement, RtpJpegCanvasProps>(
  ({ urls, offset, onPlaying, onEnded }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useImperativeHandle(ref, () => canvasRef.current!, []);
    const url = urls?.url;
    const websocketUrl = urls?.websocketUrl;
    const tokenUrl = urls?.tokenUrl;

    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !url || !websocketUrl || !tokenUrl) {
        return;
      }
      return startJpegStream(
        canvas,
        { url, websocketUrl, tokenUrl },
        offset,
        onPlaying,
        onEnded
      );
    }, [url, websocketUrl, tokenUrl, offset, onPlaying, onEnded]);

    return (
      <canvas
        ref={canvasRef}
        style={{ maxHeight: '100%', objectFit: 'contain', width: '100%' }}
      />
    );
  }
);

RtpJpegCanvas.displayName = 'RtpJpegCanvas';
