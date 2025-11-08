/**
 * WidgetAnchorIndicators
 * Renders corner squares on the bounding box based on the widget's anchor position.
 */
import React, { useMemo } from 'react';
import { Widget } from './widgetInterfaces';
/* MUI */
import Box from '@mui/material/Box';

interface WidgetAnchorIndicatorProps {
  widget: Widget;
  scaleFactor: number;
  bboxColor: string;
  bboxAnchorIndicator: boolean;
}

const WidgetAnchorIndicators: React.FC<WidgetAnchorIndicatorProps> = ({
  widget,
  scaleFactor,
  bboxColor,
  bboxAnchorIndicator
}) => {
  /* Return null if the anchor indicator is disabled or no anchor point is set */
  if (!bboxAnchorIndicator || widget.generalParams.anchor === 'none') {
    return null;
  }

  const squareSize = 0.05 * Math.min(widget.width, widget.height) * scaleFactor;

  const opacity = 1;

  interface SquareStyle {
    position: 'absolute';
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    width: number;
    height: number;
    backgroundColor: string;
    opacity: number;
  }

  interface AnchorSquareStyles {
    topLeft?: SquareStyle;
    topRight?: SquareStyle;
    bottomLeft?: SquareStyle;
    bottomRight?: SquareStyle;
  }

  const isAnchorSquareStyles = (
    styles: SquareStyle | AnchorSquareStyles
  ): styles is AnchorSquareStyles => {
    return (
      'topLeft' in styles ||
      'topRight' in styles ||
      'bottomLeft' in styles ||
      'bottomRight' in styles
    );
  };

  const anchorSquareStyles: SquareStyle | AnchorSquareStyles = useMemo(() => {
    const topLeftSquare: SquareStyle = {
      position: 'absolute',
      top: 0,
      left: 0,
      width: squareSize,
      height: squareSize,
      backgroundColor: bboxColor,
      opacity
    };

    const topRightSquare: SquareStyle = {
      position: 'absolute',
      top: 0,
      right: 0,
      width: squareSize,
      height: squareSize,
      backgroundColor: bboxColor,
      opacity
    };

    const bottomLeftSquare: SquareStyle = {
      position: 'absolute',
      bottom: 0,
      left: 0,
      width: squareSize,
      height: squareSize,
      backgroundColor: bboxColor,
      opacity
    };

    const bottomRightSquare: SquareStyle = {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: squareSize,
      height: squareSize,
      backgroundColor: bboxColor,
      opacity
    };

    /* Define each anchor style based on position */
    switch (widget.generalParams.anchor) {
      case 'topLeft':
        return topLeftSquare;
      case 'topRight':
        return topRightSquare;
      case 'bottomLeft':
        return bottomLeftSquare;
      case 'bottomRight':
        return bottomRightSquare;
      case 'centerLeft':
        return { topLeft: topLeftSquare, bottomLeft: bottomLeftSquare };
      case 'centerRight':
        return {
          topRight: topRightSquare,
          bottomRight: bottomRightSquare
        };
      case 'topCenter':
        return { topLeft: topLeftSquare, topRight: topRightSquare };
      case 'bottomCenter':
        return {
          bottomLeft: bottomLeftSquare,
          bottomRight: bottomRightSquare
        };
      case 'center':
        return {
          topLeft: topLeftSquare,
          topRight: topRightSquare,
          bottomLeft: bottomLeftSquare,
          bottomRight: bottomRightSquare
        };
      default:
        return {};
    }
  }, [bboxColor, squareSize, widget.generalParams.anchor]);

  return (
    <>
      {isAnchorSquareStyles(anchorSquareStyles) ? (
        <>
          {anchorSquareStyles.topLeft && (
            <Box
              sx={{
                ...anchorSquareStyles.topLeft
              }}
            />
          )}
          {anchorSquareStyles.topRight && (
            <Box
              sx={{
                ...anchorSquareStyles.topRight
              }}
            />
          )}
          {anchorSquareStyles.bottomLeft && (
            <Box
              sx={{
                ...anchorSquareStyles.bottomLeft
              }}
            />
          )}
          {anchorSquareStyles.bottomRight && (
            <Box
              sx={{
                ...anchorSquareStyles.bottomRight
              }}
            />
          )}
        </>
      ) : (
        <Box sx={{ ...anchorSquareStyles }} />
      )}
    </>
  );
};

export default WidgetAnchorIndicators;
