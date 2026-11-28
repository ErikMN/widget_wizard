/**
 * RTSP session control
 *
 * Negotiate selected media tracks over one WebSocket using OPTIONS,
 * DESCRIBE, SETUP and PLAY. Match responses to commands by CSeq and
 * route binary packets by the channels returned by SETUP.
 *
 * Keep the session alive while streaming and release it on stop or
 * failure. Media decoding, RTP timing and reconnection belong to the caller.
 */
import {
  serializeRtspRequest,
  type RtspMessage,
  type RtspResponse
} from './rtspMessage';
import { connectRtspWebSocket, type RtspConnection } from './rtspWebSocket';
import { parseSdpDescription, type SdpDescription, type SdpTrack } from './sdp';

/* Command and session timeouts are in milliseconds and seconds respectively. */
const COMMAND_TIMEOUT = 10000;
const DEFAULT_SESSION_TIMEOUT = 60;
const encoder = new TextEncoder();

/* Expose the response status so callers can decide whether to retry. */
export class RtspResponseError extends Error {
  readonly method: string;
  readonly status: number;

  constructor(method: string, status: number) {
    super(`RTSP ${method} failed (${status})`);
    this.name = 'RtspResponseError';
    this.method = method;
    this.status = status;
  }
}

export interface RtspTrack {
  readonly description: SdpTrack;
  readonly rtpChannel: number;
  readonly rtcpChannel: number;
}

interface SessionHandlers {
  /* Select entries from the description, then prepare their decoders in onTracks. */
  readonly selectTracks: (description: SdpDescription) => readonly SdpTrack[];
  readonly onTracks: (tracks: readonly RtspTrack[]) => void;
  /* Preserve the server's playback range and initial RTP timing information. */
  readonly onPlay: (range?: string, rtpInfo?: string) => void;
  readonly onPacket: (
    track: RtspTrack,
    kind: 'rtp' | 'rtcp',
    data: Uint8Array
  ) => void;
  readonly onEnded: (error: Error) => void;
}

interface PendingCommand {
  readonly sequence: number;
  readonly method: string;
  readonly complete: (response: RtspResponse) => void;
}

const readSession = (value: string) => {
  const [id, ...parameters] = value.split(';').map((part) => part.trim());
  if (!/^[A-Za-z0-9$_.+-]+$/.test(id)) {
    throw new Error('Invalid RTSP session identifier');
  }
  let timeout: number | undefined;
  for (const parameter of parameters) {
    if (/^timeout\s*=/i.test(parameter)) {
      const match = /^timeout\s*=\s*(\d+)$/i.exec(parameter);
      if (
        !match ||
        timeout !== undefined ||
        !Number.isSafeInteger(Number(match[1]))
      ) {
        throw new Error('Invalid RTSP session timeout');
      }
      timeout = Number(match[1]);
    }
  }
  return { id, timeout };
};

const readChannels = (
  value: string | undefined,
  usedChannels: ReadonlyMap<number, unknown>
): [number, number] => {
  const [profile, ...parameters] = (value ?? '')
    .split(';')
    .map((part) => part.trim());
  const channels = parameters.filter((part) => /^interleaved\s*=/i.test(part));
  const match = /^interleaved\s*=\s*(\d+)(?:-(\d+))?$/i.exec(channels[0] ?? '');
  if (
    profile.toUpperCase() !== 'RTP/AVP/TCP' ||
    parameters.some((part) => part.toLowerCase() === 'multicast') ||
    channels.length !== 1 ||
    !match
  ) {
    throw new Error('Expected interleaved RTSP transport');
  }
  const rtp = Number(match[1]);
  let rtcp = Number(match[2] ?? rtp + 1);
  /* RFC 2326 section 10.12 defines the default RTCP channel. */
  if (match[2] === undefined) {
    while (rtcp < 256 && usedChannels.has(rtcp)) {
      rtcp++;
    }
  }
  if (rtp > 255 || rtcp > 255 || rtp === rtcp) {
    throw new Error('Invalid RTSP interleaved channels');
  }
  return [rtp, rtcp];
};

export const startRtspSession = (
  urls: {
    readonly url: string;
    readonly websocketUrl: string;
    readonly tokenUrl: string;
  },
  offset: number,
  handlers: SessionHandlers
): (() => void) => {
  const controller = new AbortController();
  let connection: RtspConnection | undefined;
  let stopped = false;
  let sequence = 0;
  let sessionId: string | undefined;
  let sessionTimeout = DEFAULT_SESSION_TIMEOUT;
  let lastCommandSentAt = 0;
  let controlUri = urls.url;
  let pending: PendingCommand | undefined;
  let commandTimer: ReturnType<typeof setTimeout> | undefined;
  let keepaliveTimer: ReturnType<typeof setTimeout> | undefined;
  let receiving = false;
  const tracks: RtspTrack[] = [];
  const channels = new Map<
    number,
    { track: RtspTrack; kind: 'rtp' | 'rtcp' }
  >();

  const clearTimers = () => {
    clearTimeout(commandTimer);
    clearTimeout(keepaliveTimer);
    commandTimer = undefined;
    keepaliveTimer = undefined;
    pending = undefined;
  };

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearTimers();
    /* Send TEARDOWN before closing, but do not delay cancellation for its reply. */
    if (connection && sessionId) {
      try {
        connection.send(
          serializeRtspRequest('TEARDOWN', controlUri, {
            CSeq: String(++sequence),
            Session: sessionId
          })
        );
      } catch {
        /* The socket may already be closed. */
      }
    }
    controller.abort();
    connection?.close();
    connection = undefined;
    channels.clear();
    tracks.length = 0;
  };

  const fail = (error: unknown) => {
    if (!stopped) {
      stop();
      handlers.onEnded(
        error instanceof Error ? error : new Error('RTSP session failed')
      );
    }
  };

  const send = (
    method: string,
    uri: string,
    headers: Record<string, string>,
    complete: PendingCommand['complete']
  ) => {
    if (stopped) {
      return;
    }
    if (!connection || pending) {
      throw new Error('Invalid RTSP command state');
    }
    const cseq = ++sequence;
    const requestHeaders: Record<string, string> = {
      ...headers,
      CSeq: String(cseq)
    };
    if (sessionId) {
      requestHeaders.Session = sessionId;
    }
    const request = serializeRtspRequest(method, uri, requestHeaders);
    pending = { sequence: cseq, method, complete };
    /* Do not wait longer than the session timeout for a session command. */
    const timeout = sessionId
      ? Math.min(COMMAND_TIMEOUT, sessionTimeout * 1000)
      : COMMAND_TIMEOUT;
    lastCommandSentAt = performance.now();
    commandTimer = setTimeout(
      () => fail(new Error(`RTSP ${method} timed out`)),
      timeout
    );
    connection.send(request);
  };

  const scheduleKeepalive = () => {
    if (stopped) {
      return;
    }
    /* Renew the session before the server timeout expires. Account for
     * the time spent waiting for the previous reply.
     */
    const interval = Math.min(sessionTimeout * 500, 30000);
    const elapsed = performance.now() - lastCommandSentAt;
    keepaliveTimer = setTimeout(
      () => {
        try {
          send('OPTIONS', controlUri, {}, scheduleKeepalive);
        } catch (error) {
          fail(error);
        }
      },
      Math.max(0, interval - elapsed)
    );
  };

  const setupTrack = (selected: readonly SdpTrack[], index: number) => {
    if (stopped) {
      return;
    }
    if (index === selected.length) {
      handlers.onTracks([...tracks]);
      if (stopped) {
        return;
      }
      send('PLAY', controlUri, { Range: `npt=${offset}-` }, (response) => {
        handlers.onPlay(
          response.headers.get('range'),
          response.headers.get('rtp-info')
        );
        if (stopped) {
          return;
        }
        /* Discard premature packets until playback timing has been reported. */
        receiving = true;
        scheduleKeepalive();
      });
      return;
    }

    /* Choose two unused channels, since the server may have changed earlier pairs. */
    let rtp = 0;
    while (rtp < 256 && (channels.has(rtp) || channels.has(rtp + 1))) {
      rtp += 2;
    }
    if (rtp >= 256) {
      throw new Error('No free RTSP interleaved channel pair');
    }
    const description = selected[index];
    send(
      'SETUP',
      description.controlUri,
      {
        Blocksize: '64000',
        Transport: `RTP/AVP/TCP;unicast;interleaved=${rtp}-${rtp + 1}`
      },
      (response) => {
        const [rtpChannel, rtcpChannel] = readChannels(
          response.headers.get('transport'),
          channels
        );
        if (channels.has(rtpChannel) || channels.has(rtcpChannel)) {
          throw new Error('Duplicate RTSP interleaved channel');
        }
        const track = { description, rtpChannel, rtcpChannel };
        tracks.push(track);
        channels.set(rtpChannel, { track, kind: 'rtp' });
        channels.set(rtcpChannel, { track, kind: 'rtcp' });
        setupTrack(selected, index + 1);
      }
    );
  };

  const handleResponse = (response: RtspResponse) => {
    const command = pending;
    const cseq = response.headers.get('cseq');
    if (
      !command ||
      !cseq ||
      !/^\d+$/.test(cseq) ||
      Number(cseq) !== command.sequence
    ) {
      throw new Error('Unexpected RTSP response sequence');
    }
    if (response.status < 200) {
      return;
    }
    clearTimeout(commandTimer);
    commandTimer = undefined;
    pending = undefined;
    if (response.status >= 300) {
      throw new RtspResponseError(command.method, response.status);
    }
    const session = response.headers.get('session');
    if (session !== undefined && (sessionId || command.method === 'SETUP')) {
      const { id, timeout } = readSession(session);
      if (sessionId && sessionId !== id) {
        throw new Error('RTSP session identifier changed');
      }
      sessionId = id;
      /* A zero timeout is not a documented promise of unlimited session life. */
      sessionTimeout =
        timeout === 0 ? DEFAULT_SESSION_TIMEOUT : timeout ?? sessionTimeout;
    }
    if (command.method === 'SETUP' && !sessionId) {
      throw new Error('Missing RTSP session identifier');
    }
    command.complete(response);
  };

  const handleMessage = (message: RtspMessage) => {
    if (stopped) {
      return;
    }
    try {
      if (message.type === 'response') {
        handleResponse(message);
      } else if (message.type === 'interleaved') {
        const channel = channels.get(message.channel);
        if (receiving && channel) {
          handlers.onPacket(channel.track, channel.kind, message.data);
        }
      } else {
        const cseq = message.headers.get('cseq');
        if (!cseq || !/^\d+$/.test(cseq)) {
          throw new Error('Invalid RTSP server request sequence');
        }
        connection?.send(
          encoder.encode(`RTSP/1.0 501 Not Implemented\r\nCSeq: ${cseq}\r\n\r\n`)
        );
      }
    } catch (error) {
      fail(error);
    }
  };

  const run = async () => {
    if (!Number.isFinite(offset) || offset < 0) {
      throw new Error('Invalid RTSP playback offset');
    }
    connection = await connectRtspWebSocket(
      urls,
      controller.signal,
      handleMessage,
      fail
    );
    if (stopped) {
      connection.close();
      connection = undefined;
      return;
    }
    send('OPTIONS', urls.url, {}, () => {
      send('DESCRIBE', urls.url, { Accept: 'application/sdp' }, (response) => {
        const description = parseSdpDescription(response, urls.url);
        const selected = [...handlers.selectTracks(description)];
        if (
          !selected.length ||
          selected.length > 128 ||
          new Set(selected).size !== selected.length ||
          selected.some((track) => !description.tracks.includes(track))
        ) {
          throw new Error('Invalid RTSP track selection');
        }
        if (selected.length > 1 && !description.aggregateControlUri) {
          throw new Error('Multiple RTSP tracks require aggregate control');
        }
        controlUri = description.aggregateControlUri ?? selected[0].controlUri;
        setupTrack(selected, 0);
      });
    });
  };
  run().catch(fail);
  return stop;
};
