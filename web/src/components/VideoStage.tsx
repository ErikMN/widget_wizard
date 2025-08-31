// =============================================
// VideoStage
// Stacks VideoPlayer and DrawingOverlay. Tracks the <video> element's
// on-screen rectangle and positions the overlay to match (including letterboxing).
// Feeds a fixed coord size (e.g., 1920x1080) so exports are always that size.
// =============================================

import React, { forwardRef, useEffect, useRef, useState } from 'react';
import VideoPlayer from './VideoPlayer';
import DrawingOverlay, { DrawingOverlayHandle } from './draw/DrawingOverlay';

interface VideoStageProps {
  drawActive: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  /* Fixed coordinate size for drawing/export, e.g. {width:1920, height:1080} */
  coordWidth: number;
  coordHeight: number;
}

type Rect = { left: number; top: number; width: number; height: number };

function relRect(child: DOMRect, parent: DOMRect): Rect {
  return {
    left: child.left - parent.left,
    top: child.top - parent.top,
    width: child.width,
    height: child.height
  };
}

const VideoStage = forwardRef<DrawingOverlayHandle, VideoStageProps>(
  ({ drawActive, strokeColor, strokeWidth, coordWidth, coordHeight }, ref) => {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const [videoRect, setVideoRect] = useState<Rect>({
      left: 0,
      top: 0,
      width: 0,
      height: 0
    });

    /* Measure the <video> DOM rect relative to the stage (keeps overlay aligned during resizes). */
    useEffect(() => {
      if (!stageRef.current) {
        return;
      }

      const getVideo = () =>
        (stageRef.current!.querySelector('video') as HTMLVideoElement | null) ??
        null;

      const updateVideoRect = () => {
        const v = getVideo();
        const stage = stageRef.current!;
        if (v && stage) {
          const vRect = v.getBoundingClientRect();
          const sRect = stage.getBoundingClientRect();
          setVideoRect(relRect(vRect, sRect));
        }
      };

      /* Try immediately */
      updateVideoRect();

      /* Observe layout/size changes on stage and video */
      const ro = new ResizeObserver(updateVideoRect);
      ro.observe(stageRef.current);
      const v0 = getVideo();
      if (v0) {
        ro.observe(v0);
      }

      /* Also update on window resize in case of overflow/scroll effects */
      window.addEventListener('resize', updateVideoRect);

      /* Poll briefly after mount; some players attach <video> late */
      const poll = window.setInterval(updateVideoRect, 150);
      window.setTimeout(() => window.clearInterval(poll), 2000);

      return () => {
        ro.disconnect();
        window.removeEventListener('resize', updateVideoRect);
        window.clearInterval(poll);
      };
    }, []);

    return (
      <div
        ref={stageRef}
        style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 0 }}
      >
        <VideoPlayer />
        <DrawingOverlay
          ref={ref}
          active={drawActive}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          coordWidth={coordWidth}
          coordHeight={coordHeight}
          styleRect={videoRect}
        />
      </div>
    );
  }
);

export default VideoStage;
