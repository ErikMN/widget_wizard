import React, {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import { startImageStream, type ImageStreamProperties } from './imageStream';

interface HttpImageProps {
  readonly src?: string;
  readonly onPlaying: (properties: ImageStreamProperties) => void;
  readonly onEnded: (retry: boolean) => void;
}

/* Both still JPEG and motion JPEG use the browser's image decoder. */
export const HttpImage = forwardRef<HTMLImageElement, HttpImageProps>(
  ({ src, onPlaying, onEnded }, ref) => {
    const imageRef = useRef<HTMLImageElement>(null);
    useImperativeHandle(ref, () => imageRef.current!, []);

    useLayoutEffect(() => {
      const image = imageRef.current;
      if (!image || !src) {
        return;
      }

      return startImageStream(image, src, onPlaying, () => onEnded(false));
    }, [src, onPlaying, onEnded]);

    return (
      <img
        ref={imageRef}
        style={{ maxHeight: '100%', objectFit: 'contain', width: '100%' }}
      />
    );
  }
);

HttpImage.displayName = 'HttpImage';
