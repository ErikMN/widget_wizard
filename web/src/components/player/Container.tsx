import React, { PropsWithChildren } from 'react';

/**
 * Aspect ratio
 *
 * The aspect ratio will determine how much padding-top
 * is necessary to fit the video in the container.
 *
 *          +---- 100% -----+
 *          |               |
 *   video  |               |
 *   height |               | (100 / (AR))%
 *          |               |
 *          +---------------+
 *             video width
 *
 * AR = width / height
 * width = 100%
 * height = (video-height / video-width) * 100%
 *  => padding-top = (1 / AR) * 100%
 */

// Default aspect ratio is fixed to 16:9, but can be modified by changing the
// aspectRatio property on the Container component.
const DEFAULT_ASPECT_RATIO = 16 / 9;

interface ContainerProps {
  readonly aspectRatio?: number;
}

export const Layer = ({ children }: PropsWithChildren) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: '0',
        left: '0',
        bottom: '0',
        right: '0'
      }}
    >
      {children}
    </div>
  );
};

export const Container = ({
  aspectRatio = DEFAULT_ASPECT_RATIO,
  children
}: PropsWithChildren<ContainerProps>) => (
  <div
    style={{
      background: 'black',
      position: 'relative',
      width: '100%',
      /**
       * Native CSS aspect-ratio controls the height of the container based
       * on its width. This ensures the video area keeps the expected shape
       * regardless of layout or screen size.
       */
      aspectRatio: `${aspectRatio}`
    }}
  >
    {children}
  </div>
);
