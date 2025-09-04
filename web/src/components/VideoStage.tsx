/* =============================================
   VideoStage
   Stacks VideoPlayer and DrawingOverlay.
   - Receives the on-screen <video> rectangle directly from VideoPlayer via onVideoRect.
   - coord size comes from DrawContext (e.g., 1920x1080) so exports are always that size.
   - drawActive and overlay ref also come from DrawContext so App stays draw-agnostic.
   ============================================= */

import React, { useState } from 'react';
import VideoPlayer from './VideoPlayer';
import DrawingOverlay from './draw/DrawingOverlay';
import { useDraw } from './draw/DrawContext';

interface VideoStageProps {
  strokeColor?: string;
  strokeWidth?: number;
}

type Rect = { left: number; top: number; width: number; height: number };

const VideoStage: React.FC<VideoStageProps> = ({
  strokeColor,
  strokeWidth
}) => {
  /* Pull draw state + overlay ref + coord size from context */
  const { drawActive, overlayRef, coord } = useDraw();

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
      {/* VideoPlayer reports the actual on-screen <video> rect */}
      <VideoPlayer
        onVideoRect={(rect: Rect) => {
          setVideoRect(rect);
        }}
      />
      <DrawingOverlay
        ref={overlayRef}
        active={drawActive}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        coordWidth={coord.width}
        coordHeight={coord.height}
        styleRect={videoRect}
      />
    </div>
  );
};

export default VideoStage;
