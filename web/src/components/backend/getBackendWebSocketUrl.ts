/* Backend WebSocket URL helper
 *
 * Keep the frontend backend URL construction in one place.
 */
interface BackendWebSocketSettings {
  wsAddress?: string;
  wsPort?: number;
}

export const getBackendWebSocketUrl = ({
  wsAddress,
  wsPort
}: BackendWebSocketSettings): string => {
  /* Prefer the user-configured address when present */
  const resolvedAddress =
    wsAddress && wsAddress.trim() !== ''
      ? wsAddress
      : import.meta.env.MODE === 'development'
        ? import.meta.env.VITE_TARGET_IP
        : window.location.hostname;

  /* Fall back to the backend default port when no override is configured */
  const resolvedPort = typeof wsPort === 'number' ? wsPort : 9000;

  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${resolvedAddress}:${resolvedPort}`;
};
