import type { StreamFormat, VapixParameters } from './types';

const resolutionCodecs: Record<StreamFormat, string> = {
  MP4_H264: 'H264',
  MP4_AV1: 'AV1',
  RTP_H264: 'H264',
  RTP_JPEG: 'JPEG',
  MJPEG: 'JPEG',
  JPEG: 'JPEG'
};

/* VAPIX camera numbers start at one, while parameter group indices start at zero. */
export const getSupportedResolutions = (
  parameters: VapixParameters | null,
  format: StreamFormat,
  camera?: string
): string[] | undefined => {
  const cameraNumber = Number(camera || '1');
  const prefix = 'root.Properties.Image';
  let resolutions: string | undefined;

  if (Number.isSafeInteger(cameraNumber) && cameraNumber > 0) {
    const channel = `${prefix}.I${cameraNumber - 1}`;
    const codec = resolutionCodecs[format];
    resolutions =
      parameters?.[`${channel}.${codec}.Resolution`] ??
      parameters?.[`${channel}.Resolution`];
  }

  resolutions ??= parameters?.[`${prefix}.Resolution`];
  return resolutions
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
};

/* Keep the requested resolution unless the device explicitly excludes it. */
export const getPlayableResolution = (
  requested: string | undefined,
  supported: readonly string[] | undefined
): string | undefined => {
  if (!requested || (supported && !supported.includes(requested))) {
    return undefined;
  }

  return requested;
};
