/* Reconnectable WebSocket
 * Reusable hook for the backend WS connection lifecycle.
 *
 * Handles:
 * - Initial connect
 * - Reconnect after disconnect
 * - Safe teardown during unmount or URL changes
 * - Protection against stale sockets and leaked handlers
 *
 * Exposes helpers to:
 * - Send plain string messages
 * - Send JSON commands
 * - Send raw WS payloads such as binary upload chunks
 * - Read the current connection state
 */
import { useEffect, useRef, useState } from 'react';

type WebSocketSendData = string | ArrayBuffer | Blob | ArrayBufferView;

interface UseReconnectableWebSocketOptions {
  url: string;
  reconnectDelayMs?: number;
  onOpen?: (socket: WebSocket) => void;
  onMessage?: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
}

interface UseReconnectableWebSocketResult {
  send: (message: string) => boolean;
  sendJson: (data: unknown) => boolean;
  sendRaw: (data: WebSocketSendData) => boolean;
  connected: boolean;
  readyState: number | null;
}

/* Keep the socket lifecycle logic reusable while preserving the current
 * reconnect and teardown behavior used by SystemStats.
 */
export const useReconnectableWebSocket = ({
  url,
  reconnectDelayMs = 2000,
  onOpen,
  onMessage,
  onError,
  onClose
}: UseReconnectableWebSocketOptions): UseReconnectableWebSocketResult => {
  /* Local state */
  const [readyState, setReadyState] = useState<number | null>(null);

  /* Refs */
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const isUnmountedRef = useRef<boolean>(false);
  const intentionalCloseRef = useRef<boolean>(false);
  const connectionIdRef = useRef<number>(0);

  const setSocketState = (state: number | null) => {
    setReadyState(state);
  };

  const isConnectingOrOpen = () =>
    wsRef.current !== null &&
    (wsRef.current.readyState === WebSocket.CONNECTING ||
      wsRef.current.readyState === WebSocket.OPEN);

  function closeSocket(socket: WebSocket | null) {
    if (!socket) {
      return;
    }

    /* Detach handlers so teardown does not trigger reconnect/error flows. */
    socket.onclose = null;
    socket.onerror = null;
    socket.onopen = null;
    socket.onmessage = null;

    /* Close both CONNECTING and OPEN sockets to avoid leaked connections. */
    if (
      socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN
    ) {
      socket.close();
    }

    setSocketState(socket.readyState);
  }

  function scheduleReconnect() {
    /* Do not reconnect if the component has been unmounted */
    if (isUnmountedRef.current) {
      return;
    }

    /* Avoid scheduling multiple reconnect timers in parallel */
    if (reconnectTimerRef.current !== null) {
      return;
    }

    /* Capture the current connection generation to detect stale reconnects */
    const scheduledConnectionId = connectionIdRef.current;

    /* Schedule a delayed reconnect attempt */
    reconnectTimerRef.current = window.setTimeout(() => {
      /* Clear the timer reference once it fires */
      reconnectTimerRef.current = null;

      /* Abort if the component was unmounted while waiting */
      if (isUnmountedRef.current) {
        return;
      }

      /* Abort if a newer connection attempt was started meanwhile */
      if (scheduledConnectionId !== connectionIdRef.current) {
        return;
      }

      /* Reconnect using the current WebSocket configuration */
      connect();
    }, reconnectDelayMs);
  }

  /* Open (or reopen) the WebSocket connection used to stream system stats.
   *
   * This function is written to be safe with:
   * - Unmount during CONNECTING (tab switch, route change)
   * - Backend disconnects (reconnect every 2 seconds)
   *
   * refs used:
   * - isUnmountedRef: true after cleanup, prevents starting new connections.
   * - intentionalCloseRef: true when we are intentionally closing during cleanup,
   *   used to suppress reconnect and error handling.
   * - wsRef: holds the currently active WebSocket instance for cleanup and state checks.
   */
  function connect() {
    /* Do not create a socket if the component has been unmounted. */
    if (isUnmountedRef.current) {
      return;
    }

    /* Prevent parallel connections */
    if (isConnectingOrOpen()) {
      return;
    }

    /* This is a normal (non-teardown) connection attempt. */
    intentionalCloseRef.current = false;

    /* New connection attempt generation */
    const myConnectionId = ++connectionIdRef.current;

    /* Create a new WebSocket and remember it for cleanup. */
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setSocketState(ws.readyState);

    ws.onopen = () => {
      /* Ignore stale sockets */
      if (myConnectionId !== connectionIdRef.current) {
        ws.close();
        return;
      }

      /* If the component was unmounted while the socket was CONNECTING,
       * the socket may still complete the handshake and become OPEN.
       * In that case, immediately close it to avoid a leaked connection.
       */
      if (intentionalCloseRef.current || isUnmountedRef.current) {
        ws.close();
        return;
      }

      setSocketState(ws.readyState);
      onOpen?.(ws);
    };

    ws.onmessage = (event) => {
      /* Ignore stale sockets */
      if (myConnectionId !== connectionIdRef.current) {
        return;
      }

      onMessage?.(event);
    };

    ws.onerror = (event) => {
      /* Ignore stale sockets */
      if (myConnectionId !== connectionIdRef.current) {
        return;
      }

      /* Suppress errors during intentional teardown */
      if (intentionalCloseRef.current) {
        return;
      }

      setSocketState(ws.readyState);
      onError?.(event);
    };

    ws.onclose = (event) => {
      /* Ignore stale sockets */
      if (myConnectionId !== connectionIdRef.current) {
        return;
      }

      /* Suppress reconnect during intentional teardown */
      if (intentionalCloseRef.current) {
        return;
      }

      setSocketState(ws.readyState);
      onClose?.(event);

      /* Connection dropped: try again later */
      scheduleReconnect();
    };
  }

  /* Manage the WebSocket connection lifecycle for this route-scoped component.
   *
   * Mount:
   * - Reset lifecycle flags for this component instance.
   * - Establish the initial WebSocket connection.
   *
   * Unmount:
   * - Mark the component as unmounted to prevent any future reconnect attempts.
   * - Mark the close as intentional so event handlers do not schedule reconnects
   *   or report spurious errors while tearing down.
   * - Cancel any pending reconnect timer.
   * - Detach WebSocket event handlers and close the socket if it is OPEN.
   */
  useEffect(() => {
    /* Component is active: allow connections and normal error handling */
    isUnmountedRef.current = false;
    intentionalCloseRef.current = false;

    /* Start (or resume) stats streaming */
    connect();

    return () => {
      /* Invalidate any in-flight connection and its callbacks/timers */
      connectionIdRef.current += 1;

      /* Component is unmounting, prevent reconnects */
      isUnmountedRef.current = true;
      intentionalCloseRef.current = true;

      /* Cancel any scheduled reconnect attempt */
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      /* Stop the WebSocket connection */
      if (wsRef.current) {
        closeSocket(wsRef.current);
        wsRef.current = null;
      }

      setSocketState(null);
    };
  }, []);

  /* Reconnect when WS settings change */
  useEffect(() => {
    /* Invalidate any in-flight connection + reconnect attempts */
    connectionIdRef.current += 1;

    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    intentionalCloseRef.current = true;

    if (wsRef.current) {
      closeSocket(wsRef.current);
      wsRef.current = null;
    }

    intentionalCloseRef.current = false;
    connect();
  }, [url, reconnectDelayMs]);

  const sendRaw = (data: WebSocketSendData) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    wsRef.current.send(data);
    return true;
  };

  const send = (message: string) => sendRaw(message);

  const sendJson = (data: unknown) => sendRaw(JSON.stringify(data));

  return {
    send,
    sendJson,
    sendRaw,
    connected: readyState === WebSocket.OPEN,
    readyState
  };
};
