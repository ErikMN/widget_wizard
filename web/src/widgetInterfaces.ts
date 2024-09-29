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
