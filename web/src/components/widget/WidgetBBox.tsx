import React from 'react';
import BBox from '../BBox';
import { Widget, Dimensions } from '../../widgetInterfaces';
import { useGlobalContext } from '../GlobalContext';

interface WidgetBBoxProps {
  dimensions: Dimensions;
  showBoundingBoxes?: boolean;
}

const WidgetBBox: React.FC<WidgetBBoxProps> = ({
  dimensions,
  showBoundingBoxes = true
}) => {
  /* Global context */
  const { activeWidgets } = useGlobalContext();

  return (
    <div>
      {/* Widget bounding boxes */}
      {showBoundingBoxes && (
        /* BBox surface */
        <div
          style={{
            // backgroundColor: 'blue',
            position: 'absolute',
            pointerEvents: 'none',
            top: `${dimensions.offsetY}px`,
            left: `${dimensions.offsetX}px`,
            width: `${dimensions.pixelWidth}px`,
            height: `${dimensions.pixelHeight}px`,
            zIndex: 1
          }}
        >
          {activeWidgets.map((widget: Widget) => {
            if (widget.generalParams.isVisible) {
              return (
                /* One BBox per active widget */
                <BBox
                  key={widget.generalParams.id}
                  widget={widget}
                  dimensions={dimensions}
                />
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
};

export default WidgetBBox;
