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
    channnel: number;
    datasource: string;
    id: number;
    isVisible: boolean;
    position: {
      x: number;
      y: number;
    };
    size: string;
    trancparency: number;
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
      channel: number;
    }>;
  };
}

export interface ApiResponse {
  apiVersion: string;
  method: string;
  data: {
    widgets: Widget[];
  };
}
