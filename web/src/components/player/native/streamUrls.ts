import type { StreamFormat, VapixParameters } from './types';

export type StreamUrls =
  | { transport: 'http'; url: string }
  | { transport: 'rtsp'; url: string; websocketUrl: string; tokenUrl: string };

/* Preserve device-specific parameters, but let the selected format determine
 * the codec and container. The refresh count changes the URL on each refresh.
 */
export const getStreamUrls = (
  host: string,
  secure: boolean,
  format: StreamFormat,
  parameters: VapixParameters,
  refresh: number
): StreamUrls | undefined => {
  if (!host) {
    return undefined;
  }

  const origin = `${secure ? 'https' : 'http'}://${host}`;
  const params = { ...parameters, timestamp: String(refresh) };
  const query = (values: VapixParameters) =>
    Object.entries(values)
      .map(
        ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      )
      .join('&');

  switch (format) {
    case 'JPEG':
      return {
        transport: 'http',
        url: `${origin}/axis-cgi/jpg/image.cgi?${query(params)}`
      };
    case 'MJPEG':
      return {
        transport: 'http',
        url: `${origin}/mjpg/video.mjpg?${query(params)}`
      };
    case 'MP4_H264': {
      const search = query({ ...params, videocodec: 'h264', container: 'mp4' });
      return {
        transport: 'http',
        url: `${origin}/axis-cgi/media.cgi?${search}`
      };
    }
    case 'RTP_H264':
    case 'RTP_JPEG': {
      const videocodec = format === 'RTP_H264' ? 'h264' : 'jpeg';
      const search = query({ ...params, videocodec });
      const websocket = new URL('/rtsp-over-websocket', origin);
      websocket.protocol = secure ? 'wss:' : 'ws:';
      return {
        transport: 'rtsp',
        url: `rtsp://${host}/axis-media/media.amp?${search}`,
        websocketUrl: websocket.href,
        tokenUrl: new URL('/axis-cgi/rtspwssession.cgi', origin).href
      };
    }
  }
};
