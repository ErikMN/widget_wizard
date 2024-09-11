export interface Widget {
  generalParams: {
    id: number;
    type: string;
    position: {
      x: number;
      y: number;
    };
    anchor: string;
  };
  height: number;
  width: number;
  widgetParams: object;
}

export interface WidgetCapabilities {
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
  data: {
    widgets: Widget[];
  };
}
