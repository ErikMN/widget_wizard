/* Privacy mask endpoint communication functions (backend API layer)
 *
 * privacymask.cgi answers with an empty body on success and a plain text
 * "Error: ..." body on failure. Mask enable state, renaming and appearance are
 * only available through param.cgi (Image.I<source>.Overlay.MaskWindows).
 */
import { P_CGI, PM_CGI } from '../constants';
import {
  MaskColor,
  MaskPoint,
  MaskReferenceFrame,
  PrivacyMask
} from './privacyMaskInterfaces';
import { parseMaskList, toPxPolygon } from './privacyMaskUtils';

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin'
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url.split('?')[0]}`);
  }
  return text;
};

/* Throw with the device message if a privacymask.cgi action failed */
const assertCgiSuccess = (text: string): void => {
  const trimmed = text.trim();
  if (trimmed.startsWith('Error')) {
    const message = trimmed
      .replace(/^Error:?\s*/, '')
      .replace(/^privacy_mask:\s*/, '')
      .trim();
    throw new Error(message || 'Privacy mask operation failed');
  }
};

const frameParams = (frame: MaskReferenceFrame): URLSearchParams =>
  new URLSearchParams({
    imagesource: String(frame.source),
    imagerotation: '0',
    imageresolution: `${frame.width}x${frame.height}`
  });

/* List privacy masks in the reference frame */
export async function apiListPrivacyMasks(
  frame: MaskReferenceFrame
): Promise<PrivacyMask[]> {
  const params = frameParams(frame);
  params.set('query', 'listpxjson');
  const text = await fetchText(`${PM_CGI}?${params.toString()}`);
  assertCgiSuccess(text);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Invalid privacy mask list response');
  }
  const masks = parseMaskList(json);
  if (!masks) {
    throw new Error('Invalid privacy mask list response');
  }
  return masks;
}

/* Add a privacy mask */
export async function apiAddPrivacyMask(
  frame: MaskReferenceFrame,
  name: string,
  points: MaskPoint[]
): Promise<void> {
  const params = frameParams(frame);
  params.set('action', 'add');
  params.set('name', name);
  params.set('pxpolygon', toPxPolygon(points));
  assertCgiSuccess(await fetchText(`${PM_CGI}?${params.toString()}`));
}

/* Update the polygon of a privacy mask (identified by name) */
export async function apiUpdatePrivacyMask(
  frame: MaskReferenceFrame,
  name: string,
  points: MaskPoint[]
): Promise<void> {
  const params = frameParams(frame);
  params.set('action', 'update');
  params.set('name', name);
  params.set('pxpolygon', toPxPolygon(points));
  assertCgiSuccess(await fetchText(`${PM_CGI}?${params.toString()}`));
}

/* Remove a privacy mask (identified by name) */
export async function apiRemovePrivacyMask(name: string): Promise<void> {
  const params = new URLSearchParams({ action: 'remove', name });
  assertCgiSuccess(await fetchText(`${PM_CGI}?${params.toString()}`));
}

/* Update param.cgi values, throws unless the device answers OK */
export async function apiUpdateMaskParams(
  values: Record<string, string>
): Promise<void> {
  const params = new URLSearchParams({ action: 'update' });
  Object.entries(values).forEach(([key, value]) => params.append(key, value));
  const text = (await fetchText(`${P_CGI}?${params.toString()}`)).trim();
  if (text !== 'OK') {
    throw new Error(text.replace(/^#\s*/, '') || 'Failed to update parameters');
  }
}

const maskWindowsGroup = (source: number) =>
  `root.Image.I${source}.Overlay.MaskWindows`;

/* Enable or disable a mask. The listpxjson id maps to MaskWindows.M<id>. */
export const apiSetPrivacyMaskEnabled = (
  source: number,
  id: number,
  enabled: boolean
) =>
  apiUpdateMaskParams({
    [`${maskWindowsGroup(source)}.M${id}.Enabled`]: enabled ? 'yes' : 'no'
  });

/* Rename a mask (privacymask.cgi ignores newname, so use param.cgi) */
export const apiRenamePrivacyMask = (
  source: number,
  id: number,
  name: string
) => apiUpdateMaskParams({ [`${maskWindowsGroup(source)}.M${id}.Name`]: name });

/* Mask color/mosaic is shared by all masks on the source */
export const apiSetPrivacyMaskAppearance = (
  source: number,
  values: { color?: MaskColor; mosaicScale?: number }
) => {
  const update: Record<string, string> = {};
  if (values.color !== undefined) {
    update[`${maskWindowsGroup(source)}.Color`] = values.color;
  }
  if (values.mosaicScale !== undefined) {
    update[`${maskWindowsGroup(source)}.MosaicScale`] = String(
      values.mosaicScale
    );
  }
  return apiUpdateMaskParams(update);
};

/* Read the image source rotation. With SourceRotation=yes the device applies
 * this rotation to every stream and ignores the stream rotation parameter.
 */
export async function apiGetSourceRotation(
  source: number
): Promise<{ sourceRotation: boolean; rotation: string } | null> {
  const params = new URLSearchParams({
    action: 'list',
    group: `root.ImageSource.I${source}`
  });
  try {
    const text = await fetchText(`${P_CGI}?${params.toString()}`);
    const values: Record<string, string> = {};
    text.split('\n').forEach((line) => {
      const index = line.indexOf('=');
      if (index > 0) {
        values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
      }
    });
    const prefix = `root.ImageSource.I${source}`;
    if (values[`${prefix}.Rotation`] === undefined) {
      return null;
    }
    return {
      sourceRotation: values[`${prefix}.SourceRotation`] === 'yes',
      rotation: values[`${prefix}.Rotation`]
    };
  } catch {
    return null;
  }
}

/* Read the allowed MosaicScale range (it differs between devices) */
export async function apiGetMosaicScaleRange(
  source: number
): Promise<{ min: number; max: number } | null> {
  const params = new URLSearchParams({
    action: 'listdefinitions',
    listformat: 'xmlschema',
    group: `Image.I${source}.Overlay.MaskWindows.MosaicScale`
  });
  try {
    const text = await fetchText(`${P_CGI}?${params.toString()}`);
    const match = /<int\s+min="(\d+)"\s+max="(\d+)"/.exec(text);
    if (!match) {
      return null;
    }
    return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
  } catch {
    return null;
  }
}
