/**
 * SDP media description
 *
 * Read the media description returned by RTSP DESCRIBE. Resolve the control
 * URLs and associate each RTP payload type with its encoding, clock rate
 * and codec parameters. The session uses these descriptions to set up tracks;
 * the media handlers decide which encodings they can decode.
 */
import type { RtspResponse } from './rtspMessage';

export interface SdpPayload {
  readonly payloadType: number;
  readonly encoding?: string;
  /* RTP timestamp ticks per second. */
  readonly clockRate?: number;
  readonly channels?: number;
  /* Raw codec-specific parameters from the fmtp attribute. */
  readonly formatParameters?: string;
  /* Frame dimensions advertised by the framesize attribute. */
  readonly frameSize?: { readonly width: number; readonly height: number };
}

export interface SdpTrack {
  readonly media: string;
  readonly controlUri: string;
  readonly payloads: readonly SdpPayload[];
}

export interface SdpDescription {
  /* Only present when the SDP advertises session-wide control. */
  readonly aggregateControlUri?: string;
  readonly tracks: readonly SdpTrack[];
}

const decoder = new TextDecoder('utf-8', { fatal: true });

/* Resolve controls against the description base (RFC 2326 C.1.1). */
const resolveControlUri = (value: string, base: string): string => {
  if (!value || /[\s\x00-\x1f\x7f]/.test(value)) {
    throw new Error('Invalid SDP control URI');
  }
  const uri = new URL(value === '*' ? base : value, base);
  if (
    uri.protocol !== 'rtsp:' ||
    !uri.hostname ||
    uri.username ||
    uri.password ||
    uri.hash
  ) {
    throw new Error('Invalid SDP control URI');
  }
  return uri.href;
};

const readControl = (lines: readonly string[]): string | undefined => {
  const values = lines.filter((line) => line.startsWith('a=control:'));
  if (values.length > 1) {
    throw new Error('Duplicate SDP control attribute');
  }
  return values[0]?.slice('a=control:'.length);
};

/* Static RTP payload assignments for JPEG and G.711 (RFC 3551). */
const withStaticEncoding = (media: string, payload: SdpPayload): SdpPayload => {
  if (payload.encoding !== undefined) {
    return payload;
  }
  if (media === 'video' && payload.payloadType === 26) {
    return { ...payload, encoding: 'JPEG', clockRate: 90000 };
  }
  if (media === 'audio' && payload.payloadType === 0) {
    return { ...payload, encoding: 'PCMU', clockRate: 8000, channels: 1 };
  }
  if (media === 'audio' && payload.payloadType === 8) {
    return { ...payload, encoding: 'PCMA', clockRate: 8000, channels: 1 };
  }
  return payload;
};

const parsePayloadType = (value: string): number => {
  const number = Number(value);
  if (!/^\d+$/.test(value) || number > 127) {
    throw new Error('Invalid SDP RTP payload type');
  }
  return number;
};

const parseTrack = (
  lines: readonly string[],
  base: string,
  fallbackControlUri: string | undefined
): SdpTrack | undefined => {
  const [media, port, protocol, ...formats] = lines[0].slice(2).split(/\s+/);
  const portMatch = /^(\d+)(?:\/(\d+))?$/.exec(port);
  if (!media || !portMatch || !protocol || !formats.length) {
    throw new Error('Invalid SDP media description');
  }
  const portNumber = Number(portMatch[1]);
  const portCount = Number(portMatch[2] ?? '1');
  if (
    portNumber > 65535 ||
    !Number.isSafeInteger(portCount) ||
    portCount < 1 ||
    portCount > 65536
  ) {
    throw new Error('Invalid SDP media port');
  }
  /* Only the RTP profiles used by the interleaved transport are handled. */
  if (protocol !== 'RTP/AVP' && protocol !== 'RTP/AVP/TCP') {
    return undefined;
  }

  const payloads = new Map<number, SdpPayload>();
  for (const format of formats) {
    const payloadType = parsePayloadType(format);
    if (payloads.has(payloadType)) {
      throw new Error('Duplicate SDP RTP payload type');
    }
    payloads.set(payloadType, { payloadType });
  }

  for (const line of lines.slice(1)) {
    if (line.startsWith('a=rtpmap:')) {
      const match =
        /^a=rtpmap:(\d+)\s+([^/\s]+)\/(\d+)(?:\/(\d+))?$/.exec(line);
      if (!match) {
        throw new Error('Invalid SDP rtpmap attribute');
      }
      const payloadType = parsePayloadType(match[1]);
      const payload = payloads.get(payloadType);
      const clockRate = Number(match[3]);
      const channels = media === 'audio' ? Number(match[4] ?? '1') : undefined;
      if (
        !payload ||
        payload.encoding !== undefined ||
        !Number.isSafeInteger(clockRate) ||
        clockRate <= 0 ||
        (channels !== undefined &&
          (!Number.isSafeInteger(channels) || channels <= 0))
      ) {
        throw new Error('Invalid or duplicate SDP rtpmap attribute');
      }
      payloads.set(payloadType, {
        ...payload,
        encoding: match[2].toUpperCase(),
        clockRate,
        channels
      });
    } else if (line.startsWith('a=fmtp:')) {
      const match = /^a=fmtp:(\d+)\s+(.+)$/.exec(line);
      if (!match) {
        throw new Error('Invalid SDP fmtp attribute');
      }
      const payloadType = parsePayloadType(match[1]);
      const payload = payloads.get(payloadType);
      if (!payload || payload.formatParameters !== undefined) {
        throw new Error('Invalid or duplicate SDP fmtp attribute');
      }
      payloads.set(payloadType, { ...payload, formatParameters: match[2] });
    } else if (media === 'video' && line.startsWith('a=framesize:')) {
      const match = /^a=framesize:(\d+)\s+(\d+)-(\d+)$/.exec(line);
      if (!match) {
        throw new Error('Invalid SDP framesize attribute');
      }
      const payloadType = parsePayloadType(match[1]);
      const payload = payloads.get(payloadType);
      const width = Number(match[2]);
      const height = Number(match[3]);
      if (
        !payload ||
        payload.frameSize !== undefined ||
        width < 1 ||
        width > 65535 ||
        height < 1 ||
        height > 65535
      ) {
        throw new Error('Invalid or duplicate SDP framesize attribute');
      }
      /* Axis can describe JPEG dimensions that do not fit in the RTP header. */
      payloads.set(payloadType, { ...payload, frameSize: { width, height } });
    }
  }

  const control = readControl(lines);
  const controlUri =
    control === undefined ? fallbackControlUri : resolveControlUri(control, base);
  if (controlUri === undefined) {
    throw new Error('Missing SDP media control attribute');
  }
  return {
    media,
    controlUri,
    payloads: Array.from(payloads.values(), (payload) =>
      withStaticEncoding(media, payload)
    )
  };
};

export const parseSdpDescription = (
  response: RtspResponse,
  requestUri: string
): SdpDescription => {
  const contentType = response.headers.get('content-type');
  if (
    response.status !== 200 ||
    contentType?.split(';')[0].trim().toLowerCase() !== 'application/sdp'
  ) {
    throw new Error('Expected an RTSP SDP description');
  }

  const base = resolveControlUri(
    response.headers.get('content-base') ??
      response.headers.get('content-location') ??
      requestUri,
    requestUri
  );
  const lines = decoder
    .decode(response.body)
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim());
  if (lines[0] !== 'v=0') {
    throw new Error('Invalid SDP version');
  }

  const session: string[] = [];
  const media: string[][] = [];
  let current = session;
  for (const line of lines) {
    if (line.startsWith('m=')) {
      current = [];
      media.push(current);
    }
    current.push(line);
  }

  const control = readControl(session);
  const aggregateControlUri =
    control === undefined ? undefined : resolveControlUri(control, base);
  /* Only a single-stream presentation may omit its media control attribute. */
  const fallbackControlUri =
    media.length === 1 ? aggregateControlUri ?? base : undefined;
  const tracks: SdpTrack[] = [];
  const controlUris = new Set<string>();
  for (const section of media) {
    const track = parseTrack(section, base, fallbackControlUri);
    if (track !== undefined) {
      if (controlUris.has(track.controlUri)) {
        throw new Error('Duplicate SDP media control URI');
      }
      controlUris.add(track.controlUri);
      tracks.push(track);
    }
  }
  return { aggregateControlUri, tracks };
};
