/**
 * RTSP WebSocket transport
 *
 * Open a binary WebSocket to an Axis device using browser authentication.
 * If the handshake fails, request a session token and retry once within
 * the connection deadline.
 *
 * Feed incoming data to the RTSP parser and deliver complete messages to
 * the caller. Close the socket and release its resources on cancellation
 * or failure. The caller handles RTSP session negotiation and reconnection.
 */
import { RtspParser, type RtspMessage } from './rtspMessage';

/* The deadline covers both connection attempts and the token request. */
const CONNECTION_TIMEOUT = 20000;

export interface RtspConnection {
  readonly send: (data: Uint8Array) => void;
  readonly close: () => void;
}

const closeSocket = (socket: WebSocket) => {
  if (
    socket.readyState === WebSocket.CONNECTING ||
    socket.readyState === WebSocket.OPEN
  ) {
    socket.close();
  }
};

const openSocket = (
  url: URL,
  signal: AbortSignal
): Promise<WebSocket | undefined> =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    let socket: WebSocket;
    try {
      socket = new WebSocket(url.href, 'binary');
    } catch {
      reject(new Error('RTSP WebSocket could not be created'));
      return;
    }
    socket.binaryType = 'arraybuffer';

    const cleanup = () => {
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onFailure);
      socket.removeEventListener('close', onFailure);
      signal.removeEventListener('abort', onAbort);
    };
    const onOpen = () => {
      cleanup();
      resolve(socket);
    };
    const onFailure = () => {
      cleanup();
      closeSocket(socket);
      resolve(undefined);
    };
    const onAbort = () => {
      cleanup();
      closeSocket(socket);
      reject(signal.reason);
    };

    socket.addEventListener('open', onOpen);
    socket.addEventListener('error', onFailure);
    socket.addEventListener('close', onFailure);
    signal.addEventListener('abort', onAbort, { once: true });
  });

const readToken = async (url: URL, signal: AbortSignal): Promise<string> => {
  let response: Response;
  let token: string;
  try {
    response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      signal
    });
    if (!response.ok) {
      throw new Error('Token request failed');
    }
    token = (await response.text()).trim();
  } catch {
    signal.throwIfAborted();
    throw new Error('RTSP WebSocket session token request failed');
  }
  signal.throwIfAborted();
  if (!token || /[\s\x00-\x1f\x7f]/.test(token)) {
    throw new Error('Invalid RTSP WebSocket session token');
  }
  return token;
};

/* The caller owns the connection through its abort signal and close method.
 * Deliver parsed messages synchronously in wire order, without a second queue.
 */
export const connectRtspWebSocket = async (
  urls: { readonly websocketUrl: string; readonly tokenUrl: string },
  signal: AbortSignal,
  onMessage: (message: RtspMessage) => void,
  onEnded: (error: Error) => void
): Promise<RtspConnection> => {
  signal.throwIfAborted();
  const websocketUrl = new URL(urls.websocketUrl);
  const tokenUrl = new URL(urls.tokenUrl);
  const httpProtocol = websocketUrl.protocol === 'wss:' ? 'https:' : 'http:';
  if (
    !['ws:', 'wss:'].includes(websocketUrl.protocol) ||
    tokenUrl.protocol !== httpProtocol ||
    tokenUrl.host !== websocketUrl.host ||
    websocketUrl.username ||
    websocketUrl.password ||
    websocketUrl.hash ||
    tokenUrl.username ||
    tokenUrl.password ||
    tokenUrl.hash
  ) {
    throw new Error('Invalid RTSP WebSocket endpoints');
  }

  const startup = new AbortController();
  const cancelStartup = () => startup.abort(signal.reason);
  signal.addEventListener('abort', cancelStartup, { once: true });
  const timer = setTimeout(
    () => startup.abort(new Error('RTSP WebSocket connection timed out')),
    CONNECTION_TIMEOUT
  );
  let socket: WebSocket;
  try {
    let connected = await openSocket(websocketUrl, startup.signal);
    if (!connected) {
      startup.signal.throwIfAborted();
      /* Browsers do not expose the HTTP status of a failed handshake. */
      const token = await readToken(tokenUrl, startup.signal);
      websocketUrl.searchParams.set('rtspwssession', token);
      connected = await openSocket(websocketUrl, startup.signal);
      if (!connected) {
        startup.signal.throwIfAborted();
        throw new Error('RTSP WebSocket connection failed');
      }
    }
    socket = connected;
    if (startup.signal.aborted) {
      closeSocket(socket);
      startup.signal.throwIfAborted();
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancelStartup);
    startup.abort();
  }

  let parser: RtspParser | undefined = new RtspParser();
  let closed = false;
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    parser = undefined;
    signal.removeEventListener('abort', close);
    socket.removeEventListener('message', handleMessage);
    socket.removeEventListener('error', handleError);
    socket.removeEventListener('close', handleClose);
    closeSocket(socket);
  };
  const fail = (error: Error) => {
    if (!closed) {
      close();
      onEnded(error);
    }
  };
  const handleMessage = (event: MessageEvent) => {
    if (!parser) {
      return;
    }
    try {
      if (!(event.data instanceof ArrayBuffer)) {
        throw new Error('Expected binary RTSP WebSocket data');
      }
      for (const message of parser.parse(new Uint8Array(event.data))) {
        if (closed) {
          break;
        }
        onMessage(message);
      }
    } catch (error) {
      fail(
        error instanceof Error ? error : new Error('RTSP message handling failed')
      );
    }
  };
  const handleError = () => fail(new Error('RTSP WebSocket error'));
  const handleClose = (event: CloseEvent) =>
    fail(new Error(`RTSP WebSocket closed (${event.code})`));

  socket.addEventListener('message', handleMessage);
  socket.addEventListener('error', handleError);
  socket.addEventListener('close', handleClose);
  signal.addEventListener('abort', close, { once: true });

  return {
    close,
    send: (data) => {
      if (closed) {
        throw new Error('RTSP WebSocket is closed');
      }
      if (socket.readyState !== WebSocket.OPEN) {
        const error = new Error('RTSP WebSocket is not open');
        fail(error);
        throw error;
      }
      try {
        socket.send(new Uint8Array(data));
      } catch {
        const error = new Error('RTSP WebSocket send failed');
        fail(error);
        throw error;
      }
    }
  };
};
