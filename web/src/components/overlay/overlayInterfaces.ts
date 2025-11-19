/*
 * Base overlay structure shared by image and text overlays
 */
export interface OverlayBase {
  camera: number;
  identity: number;
  position: string | [number, number];
  ptPosition?: [number, number];
  zoomInterval?: [number, number];
  zIndex?: number;
  visible?: boolean;
  scalable?: boolean;
  size?: [number, number];
}

/*
 * Text overlay structure
 */
export interface TextOverlay extends OverlayBase {
  text: string;
  textColor: string;
  textBGColor: string;
  textOLColor: string;
  fontSize: number;
  reference: string;
  rotation: number;

  /* Indicator fields */
  indicator?: string;
  indicatorColor?: string;
  indicatorBG?: string;
  indicatorOL?: string;
  indicatorSize?: number;

  /* Additional fields */
  scrollSpeed?: number;
  textLength?: number;
}

/*
 * Image overlay structure
 */
export interface ImageOverlay extends OverlayBase {
  type: 'image';
  overlayPath: string;
}

/*
 * listOverlays (method=list)
 */
export interface OverlayListResponse {
  apiVersion: string;
  context: string;
  method: 'list';
  data: {
    imageFiles: string[];
    imageOverlays: ImageOverlay[];
    textOverlays: TextOverlay[];
  };
  /* On error */
  error?: {
    code: number;
    message: string;
  };
}

/*
 * getOverlayCapabilities
 */
export interface OverlayCapabilities {
  apiVersion: string;
  context: string;
  method: 'getOverlayCapabilities';
  data: {
    maxFontSize: number;
    minFontSize: number;
    maxImageHeight: number;
    maxImageWidth: number;
    maxImageSize: number;
    maxTextLength: number;
    numAvailableSlots: number;
    rotationSupported: boolean;
    slotsPerImageOverlay: number;
    slotsPerOverlay: number;
    slotsPerTextOverlay: number;
    supportedReferences?: string[];
  };
  /* On error */
  error?: {
    code: number;
    message: string;
  };
}

/*
 * Generic overlay action response (addText, addImage, setText, setImage, remove)
 */
export interface OverlayActionResponse {
  apiVersion: string;
  context: string;
  method: 'addText' | 'addImage' | 'setText' | 'setImage' | 'remove';
  data?: {
    camera?: number;
    identity?: number;
    success?: boolean;
  };
  /* On error */
  error?: {
    code: number;
    message: string;
  };
}

/* Common response union */
export type OverlayApiResponse =
  | OverlayListResponse
  | OverlayCapabilities
  | OverlayActionResponse;
