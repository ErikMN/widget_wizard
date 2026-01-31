/**
 * Application interface definitions
 */

/* Application settings JSON interface */
export interface AppSettings {
  debug: boolean;
  mute: boolean;
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
  snapToAnchor: boolean;
  /* WebSocket stats backend */
  wsAddress?: string;
  wsPort?: number;
}

/* Application settings default values */
export const defaultAppSettings: AppSettings = {
  debug: false,
  mute: false,
  roundedBboxCorners: false,
  bboxColor: 'yellow',
  bboxThickness: 'medium',
  bboxLabel: true,
  bboxAnchorIndicator: false,
  bboxOnlyShowActive: false,
  sortBy: 'id',
  sortAscending: true,
  widgetDoubleClick: false,
  widgetAutoBringFront: false,
  wsDefault: false,
  snapToAnchor: true,
  /* WebSocket stats backend defaults (not set here) */
  wsAddress: undefined,
  wsPort: undefined
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
