/* Backend WebSocket URL helper
 *
 * Keep the frontend backend URL construction in one place.
 */
interface BackendWebSocketSettings {
  wsAddress?: string;
  wsPort?: number;
}

const BACKEND_WEBSOCKET_PROXY_PATH = 'system-stats-ws';
const BACKEND_WEBSOCKET_PORT = 9000;

/* Build the WebSocket URL for the ACAP reverse proxy */
const getProxiedBackendWebSocketUrl = (): string => {
  /* Make sure the app base path ends with / */
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  /* Use the same host as the web UI */
  const url = new URL(
    `${baseUrl}${BACKEND_WEBSOCKET_PROXY_PATH}`,
    window.location.origin
  );

  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  return url.toString();
};

/* Use the reverse proxy unless the user has set a custom backend. */
export const getBackendWebSocketUrl = ({
  wsAddress,
  wsPort
}: BackendWebSocketSettings): string => {
  const hasCustomAddress =
    typeof wsAddress === 'string' && wsAddress.trim() !== '';
  const hasCustomPort =
    typeof wsPort === 'number' && wsPort !== BACKEND_WEBSOCKET_PORT;

  /* Use the reverse proxy by default */
  if (!hasCustomAddress && !hasCustomPort) {
    return getProxiedBackendWebSocketUrl();
  }

  /* Prefer the user-configured address when present */
  const resolvedAddress = hasCustomAddress
    ? wsAddress
    : import.meta.env.MODE === 'development'
      ? import.meta.env.VITE_TARGET_IP
      : window.location.hostname;

  /* Fall back to the backend default port when no override is configured */
  const resolvedPort =
    typeof wsPort === 'number' ? wsPort : BACKEND_WEBSOCKET_PORT;

  /* Only use ws as WebSocket protocol */
  return `ws://${resolvedAddress}:${resolvedPort}`;
};
