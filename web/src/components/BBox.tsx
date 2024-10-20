/**
 * Draggable bounding boxes
 */
import React from 'react';
import Draggable from 'react-draggable';
import { Widget } from '../widgetInterfaces';
import { getWidgetPixelPosition } from '../helpers/bboxhelper';
import { capitalizeFirstLetter } from '../helpers/utils';
import { Dimensions } from '../helpers/bboxhelper';
import { useWidgetContext } from './WidgetContext';
/* MUI */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface BBoxProps {
  widget: Widget;
  dimensions: Dimensions;
  scaleFactor: number;
  isActive: boolean;
  onDragStart: (widget: Widget, x: number, y: number) => void;
  onDragStop: (widget: Widget, x: number, y: number) => void;
  onDoubleClick: (widget: Widget) => void;
}

const BBox: React.FC<BBoxProps> = ({
  widget,
  dimensions,
  scaleFactor,
  isActive,
  onDragStart,
  onDragStop,
  onDoubleClick
}) => {
  const { x, y } = getWidgetPixelPosition(
    dimensions,
    scaleFactor,
    widget.generalParams.position,
    widget.width,
    widget.height
  );

  /* Global context */
  const { appSettings } = useWidgetContext();

  /* BBox colors */
  const colorMappings: { [key: string]: string } = {
    yellow: '#ffcc33',
    blue: '#00aaff',
    red: '#ff4444',
    green: '#00cc00',
    purple: '#d633ff',
    none: 'none'
  };
  const defaultColor = '#ffcc33';
  const bboxColor = colorMappings[appSettings.bboxColor] || defaultColor;

  /* BBox thickness */
  const thicknessMappings: { [key: string]: string } = {
    small: '1px',
    medium: '2px',
    large: '4px'
  };

  const bboxThickness = thicknessMappings[appSettings.bboxThickness];

  return (
    /* Wrap Draggable in div to handle double-click events */
    <div onDoubleClick={() => onDoubleClick(widget)}>
      <Draggable
        key={`${widget.generalParams.id}-${x}-${y}`}
        position={{ x, y }}
        bounds={{
          left: 0,
          top: 0,
          right: dimensions.pixelWidth - widget.width * scaleFactor,
          bottom: dimensions.pixelHeight - widget.height * scaleFactor
        }}
        onStart={(e, data) => onDragStart(widget, data.x, data.y)}
        onStop={(e, data) => onDragStop(widget, data.x, data.y)}
      >
        <Box
          sx={{
            width: `${widget.width * scaleFactor}px`,
            height: `${widget.height * scaleFactor}px`,
            border: `${bboxThickness} solid ${bboxColor}`,
            borderRadius: appSettings.roundedBboxCorners ? '8px' : '0px',
            position: 'absolute',
            pointerEvents: 'auto',
            cursor: 'move',
            zIndex: isActive ? 1000 : 1
          }}
        >
          {/* Widget info note above the bbox */}
          {appSettings.bboxLabel && (
            <Typography
              sx={{
                position: 'absolute',
                top: '-20px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                padding: '2px 4px',
                borderRadius: '4px',
                fontSize: '10px',
                color: '#333',
                pointerEvents: 'none'
              }}
            >
              {capitalizeFirstLetter(widget.generalParams.type)} ID:{' '}
              {widget.generalParams.id}
            </Typography>
          )}
        </Box>
      </Draggable>
    </div>
  );
};

export default BBox;
