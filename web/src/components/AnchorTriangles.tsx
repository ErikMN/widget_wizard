/**
 * AnchorTriangles Component
 * Renders corner triangles on the bounding box based on the widget's anchor position.
 */
import React, { useMemo } from 'react';
import { Widget } from '../widgetInterfaces';
/* MUI */
import Box from '@mui/material/Box';

interface AnchorTriangleProps {
  widget: Widget;
  scaleFactor: number;
  bboxColor: string;
  bboxAnchorIndicator: boolean;
}

const AnchorTriangles: React.FC<AnchorTriangleProps> = ({
  widget,
  scaleFactor,
  bboxColor,
  bboxAnchorIndicator
}) => {
  /* Return null if the anchor indicator is disabled or no anchor is set */
  if (!bboxAnchorIndicator || widget.generalParams.anchor === 'none') {
    return null;
  }

  const triangleSize =
    0.1 * Math.min(widget.width, widget.height) * scaleFactor;

  const opacity = 1;

  interface TriangleStyle {
    position: 'absolute';
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    borderTop?: string;
    borderBottom?: string;
    borderLeft?: string;
    borderRight?: string;
    opacity: number;
  }

  interface AnchorTriangleStyles {
    topLeft?: TriangleStyle;
    topRight?: TriangleStyle;
    bottomLeft?: TriangleStyle;
    bottomRight?: TriangleStyle;
  }

  const isAnchorTriangleStyles = (
    styles: TriangleStyle | AnchorTriangleStyles
  ): styles is AnchorTriangleStyles => {
    return (
      'topLeft' in styles ||
      'topRight' in styles ||
      'bottomLeft' in styles ||
      'bottomRight' in styles
    );
  };

  const anchorTriangleStyles: TriangleStyle | AnchorTriangleStyles =
    useMemo(() => {
      /* Individual corner styles for reuse */
      const topLeftTriangle: TriangleStyle = {
        position: 'absolute',
        top: 0,
        left: 0,
        borderTop: `${triangleSize}px solid ${bboxColor}`,
        borderRight: `${triangleSize}px solid transparent`,
        opacity
      };

      const topRightTriangle: TriangleStyle = {
        position: 'absolute',
        top: 0,
        right: 0,
        borderTop: `${triangleSize}px solid ${bboxColor}`,
        borderLeft: `${triangleSize}px solid transparent`,
        opacity
      };

      const bottomLeftTriangle: TriangleStyle = {
        position: 'absolute',
        bottom: 0,
        left: 0,
        borderBottom: `${triangleSize}px solid ${bboxColor}`,
        borderRight: `${triangleSize}px solid transparent`,
        opacity
      };

      const bottomRightTriangle: TriangleStyle = {
        position: 'absolute',
        bottom: 0,
        right: 0,
        borderBottom: `${triangleSize}px solid ${bboxColor}`,
        borderLeft: `${triangleSize}px solid transparent`,
        opacity
      };

      /* Define each anchor style based on position */
      switch (widget.generalParams.anchor) {
        case 'topLeft':
          return topLeftTriangle;
        case 'topRight':
          return topRightTriangle;
        case 'bottomLeft':
          return bottomLeftTriangle;
        case 'bottomRight':
          return bottomRightTriangle;
        case 'centerLeft':
          return { topLeft: topLeftTriangle, bottomLeft: bottomLeftTriangle };
        case 'centerRight':
          return {
            topRight: topRightTriangle,
            bottomRight: bottomRightTriangle
          };
        case 'topCenter':
          return { topLeft: topLeftTriangle, topRight: topRightTriangle };
        case 'bottomCenter':
          return {
            bottomLeft: bottomLeftTriangle,
            bottomRight: bottomRightTriangle
          };
        case 'center':
          return {
            topLeft: topLeftTriangle,
            topRight: topRightTriangle,
            bottomLeft: bottomLeftTriangle,
            bottomRight: bottomRightTriangle
          };
        default:
          return {};
      }
    }, [bboxColor, triangleSize, widget.generalParams.anchor]);

  return (
    <>
      {isAnchorTriangleStyles(anchorTriangleStyles) ? (
        <>
          {anchorTriangleStyles.topLeft && (
            <Box
              sx={{
                width: 0,
                height: 0,
                ...anchorTriangleStyles.topLeft
              }}
            />
          )}
          {anchorTriangleStyles.topRight && (
            <Box
              sx={{
                width: 0,
                height: 0,
                ...anchorTriangleStyles.topRight
              }}
            />
          )}
          {anchorTriangleStyles.bottomLeft && (
            <Box
              sx={{
                width: 0,
                height: 0,
                ...anchorTriangleStyles.bottomLeft
              }}
            />
          )}
          {anchorTriangleStyles.bottomRight && (
            <Box
              sx={{
                width: 0,
                height: 0,
                ...anchorTriangleStyles.bottomRight
              }}
            />
          )}
        </>
      ) : (
        /* Render a single triangle for standard anchor positions */
        <Box
          sx={{
            width: 0,
            height: 0,
            ...anchorTriangleStyles
          }}
        />
      )}
    </>
  );
};

export default AnchorTriangles;
