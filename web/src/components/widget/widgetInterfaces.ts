/*
 * Structure returned from listWidgets
 * widgetParams and generalParams is used for updateWidget
 */
export interface Widget {
  height: number;
  width: number;
  /* Common widget parameters */
  generalParams: {
    anchor: string;
    channel: number;
    datasource: string;
    id: number;
    isVisible: boolean;
    position: {
      x: number;
      y: number;
    };
    size: string;
    transparency: number;
    type: string;
    updateTime: number;
    depth: string;
  };
  /* Will change depending on widget */
  widgetParams: object;
}

/* Structure returned from listCapabilities */
export interface WidgetCapabilities {
  apiVersion: string;
  method: string;
  /* On success */
  data: {
    anchor: {
      type: string;
      enum: string[];
    };
    channel: {
      type: 'integer';
    };
    datasource: {
      type: string;
    };
    depth: {
      type: string;
      enum: string[];
    };
    isVisible: {
      type: 'bool';
    };
    position: {
      x: {
        type: 'float';
      };
      y: {
        type: 'float';
      };
    };
    size: {
      type: string;
      enum: string[];
    };
    transparency: {
      type: 'float';
      minimum: number;
      maximum: number;
    };
    type: {
      type: string;
    };
    updateTime: {
      type: 'float';
      minimum: number;
    };
    widgets: Array<{
      type: string;
      /* Will change depending on widget */
      widgetParams: object;
    }>;
  };
  /* On error */
  error: {
    code: number;
    message: string;
  };
}

/* FIXME: Common response for listWidgets and updateWidget */
export interface ApiResponse {
  apiVersion: string;
  method: string;
  /* On success */
  data: {
    widgets: Widget[]; // listWidgets
    generalParams: Widget['generalParams']; // updateWidget
    widgetParams: Widget['widgetParams']; // updateWidget
    height: number; // updateWidget
    width: number; // updateWidget
  };
  /* On error */
  error: {
    code: number;
    message: string;
  };
}

/* JSON response from listWidgets and updateWidget
{
    "apiVersion": "2.0",
    "method": "listWidgets",
    "data": {
        "widgets": [
            {
                "generalParams": {...},
                "width": 490,
                "height": 294,
                "widgetParams": {...}
            },
            {
                "generalParams": {...},
                "width": 490,
                "height": 294,
                "widgetParams": {...}
            },
            ...
        ]
    }
}

{
    "apiVersion": "2.0",
    "method": "updateWidget",
    "data": {
        "generalParams": {...},
        "width": 280,
        "height": 600,
        "widgetParams": {...}
    }
}

generalParams": {
    "id": 44,
    "type": "meter",       // Must be excluded when calling updateWidget?
    "datasource": "",
    "position": {
        "x": -1.0,
        "y": -1.0
    },
    "anchor": "topLeft",
    "size": "small",
    "updateTime": 1.0,
    "transparency": 0.0,
    "channel": 1,
    "isVisible": false
}
*/

/* Application settings JSON interface */
export interface AppSettings {
  debug: boolean;
  roundedBboxCorners: boolean;
  bboxColor: string;
  bboxThickness: 'small' | 'medium' | 'large';
  bboxLabel: boolean;
  bboxAnchorIndicator: boolean;
  bboxOnlyShowActive: boolean;
  sortBy: 'id' | 'type';
  sortAscending: boolean;
  widgetDoubleClick: boolean;
  widgetAutoBringFront: boolean;
  wsDefault: boolean;
}

/* Application settings default values */
export const defaultAppSettings: AppSettings = {
  debug: false,
  roundedBboxCorners: false,
  bboxColor: 'yellow',
  bboxThickness: 'medium',
  bboxLabel: true,
  bboxAnchorIndicator: true,
  bboxOnlyShowActive: false,
  sortBy: 'id',
  sortAscending: true,
  widgetDoubleClick: false,
  widgetAutoBringFront: false,
  wsDefault: false
};

/* VideoBox dimensions interface */
export interface Dimensions {
  videoWidth: number; // Video stream width
  videoHeight: number; // Video stream height
  pixelWidth: number; // Video pixel width
  pixelHeight: number; // Video pixel height
  offsetX: number; // Offset X (left margin of the video in the container)
  offsetY: number; // Offset Y (top margin of the video in the container)
}
