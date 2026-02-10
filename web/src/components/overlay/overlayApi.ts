/* Overlay endpoint communication functions (backend API layer)
 */
import { jsonRequest } from '../../helpers/cgihelper.jsx';
import { O_CGI } from '../constants';
import {
  ImageOverlay,
  TextOverlay,
  OverlayCapabilities
} from './overlayInterfaces';

/* DANGER ZONE: Changing API version may break stuff */
const API_VERSION = '1.8';

/* List overlay capabilities */
export async function apiListOverlayCapabilities(): Promise<OverlayCapabilities | null> {
  const payload = {
    apiVersion: API_VERSION,
    method: 'getOverlayCapabilities'
  };

  return jsonRequest(O_CGI, payload);
}

/* List overlays */
export async function apiListOverlays(): Promise<any> {
  const payload = {
    apiVersion: API_VERSION,
    method: 'list',
    params: {}
  };

  return jsonRequest(O_CGI, payload);
}

/* Add an image overlay */
export async function apiAddImageOverlay(params: {
  camera: number;
  overlayPath: string;
  position: string;
}): Promise<any> {
  const payload = {
    apiVersion: API_VERSION,
    method: 'addImage',
    params
  };

  return jsonRequest(O_CGI, payload);
}

/* Add a text overlay */
export async function apiAddTextOverlay(params: {
  camera: number;
  text: string;
  position: string;
  textColor: string;
  textBGColor: string;
  textOLColor: string;
  fontSize?: number;
  reference: string;
}): Promise<any> {
  const payload = {
    apiVersion: API_VERSION,
    method: 'addText',
    params
  };

  return jsonRequest(O_CGI, payload);
}

/* Remove an overlay */
export async function apiRemoveOverlay(id: number): Promise<any> {
  const payload = {
    apiVersion: API_VERSION,
    method: 'remove',
    params: { identity: id }
  };

  return jsonRequest(O_CGI, payload);
}

/* Update an image overlay */
export async function apiUpdateImageOverlay(
  overlay: ImageOverlay
): Promise<any> {
  const payload = {
    apiVersion: API_VERSION,
    method: 'setImage',
    params: {
      identity: overlay.identity,
      overlayPath: overlay.overlayPath,
      position: overlay.position
    }
  };

  return jsonRequest(O_CGI, payload);
}

/* Update a text overlay */
export async function apiUpdateTextOverlay(overlay: TextOverlay): Promise<any> {
  const payload = {
    apiVersion: API_VERSION,
    method: 'setText',
    params: {
      identity: overlay.identity,
      text: overlay.text,
      position: overlay.position,
      textColor: overlay.textColor,
      textBGColor: overlay.textBGColor,
      textOLColor: overlay.textOLColor,
      fontSize: overlay.fontSize,
      reference: overlay.reference,
      rotation: overlay.rotation,
      indicator: overlay.indicator ?? '',
      indicatorColor: overlay.indicatorColor ?? 'white',
      indicatorBG: overlay.indicatorBG ?? 'transparent',
      indicatorOL: overlay.indicatorOL ?? 'black',
      indicatorSize: overlay.indicatorSize ?? overlay.fontSize ?? 100,
      zoomInterval: overlay.zoomInterval?.join(',') ?? '1,19999'
    }
  };

  return jsonRequest(O_CGI, payload);
}
