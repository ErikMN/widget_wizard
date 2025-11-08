import React, { useMemo } from 'react';
/* MUI */
import Box from '@mui/material/Box';

interface OverlayAnchorIndicatorsProps {
  /* Which corner is anchored: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'none' */
  overlayAnchor: string;
  /* Overlay box pixel size */
  wPx: number;
  hPx: number;
  /* Color should follow the bbox color */
  bboxColor: string;
  enabled: boolean;
  dashed?: boolean;
}

const OverlayAnchorIndicators: React.FC<OverlayAnchorIndicatorsProps> = ({
  overlayAnchor,
  wPx,
  hPx,
  bboxColor,
  enabled,
  dashed = false
}) => {
  if (!enabled || overlayAnchor === 'none') {
    return null;
  }

  const squareSize = useMemo(() => 0.05 * Math.min(wPx, hPx), [wPx, hPx]);

  const opacity = 1;

  const color = dashed ? 'rgba(200, 200, 200, 1)' : bboxColor;

  type SquareStyle = {
    position: 'absolute';
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    width: number;
    height: number;
    backgroundColor: string;
    opacity: number;
    pointerEvents: 'none';
  };

  const topLeftSquare: SquareStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: squareSize,
    height: squareSize,
    backgroundColor: color,
    opacity,
    pointerEvents: 'none'
  };

  const topRightSquare: SquareStyle = {
    position: 'absolute',
    top: 0,
    right: 0,
    width: squareSize,
    height: squareSize,
    backgroundColor: color,
    opacity,
    pointerEvents: 'none'
  };

  const bottomLeftSquare: SquareStyle = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: squareSize,
    height: squareSize,
    backgroundColor: color,
    opacity,
    pointerEvents: 'none'
  };

  const bottomRightSquare: SquareStyle = {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: squareSize,
    height: squareSize,
    backgroundColor: color,
    opacity,
    pointerEvents: 'none'
  };

  const squares: SquareStyle[] = [];
  switch (overlayAnchor) {
    case 'topLeft':
      squares.push(topLeftSquare);
      break;
    case 'topRight':
      squares.push(topRightSquare);
      break;
    case 'bottomLeft':
      squares.push(bottomLeftSquare);
      break;
    case 'bottomRight':
      squares.push(bottomRightSquare);
      break;
    default:
      break;
  }

  return (
    <>
      {squares.map((style, idx) => (
        <Box key={idx} sx={{ ...style }} />
      ))}
    </>
  );
};

export default OverlayAnchorIndicators;
