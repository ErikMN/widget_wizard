// =============================================
// VideoStage
// Stacks VideoPlayer and DrawingOverlay.
// Receives the on-screen <video> rectangle directly from VideoPlayer.
// =============================================

import React, { forwardRef, useState } from 'react';
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

const VideoStage = forwardRef<DrawingOverlayHandle, VideoStageProps>(
  ({ drawActive, strokeColor, strokeWidth, coordWidth, coordHeight }, ref) => {
    const [videoRect, setVideoRect] = useState<Rect>({
      left: 0,
      top: 0,
      width: 0,
      height: 0
    });

    return (
      <div
        style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 0 }}
      >
        <VideoPlayer
          onVideoRect={(rect) => {
            setVideoRect(rect);
          }}
        />
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
