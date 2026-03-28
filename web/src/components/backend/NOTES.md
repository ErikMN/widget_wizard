# Backend

This directory handles all frontend that communicates with the OPTIONAL ACAP backend.

`BackendControl.tsx` handles backend start and stop, log fetching, and system monitor WebSocket settings.

`SystemStats.tsx` is the main entry point for the frontend of the system stats backend WebSocket service.

`SystemStatsOverviewViews.tsx` handles overview system stats from the backend service.

`SystemStatsDetailViews.tsx` handles process monitoring, process lists, storage info, and system info views from the backend.

`useReconnectableWebSocket.ts` is a hook to handle WebSocket connections to the backend service.

`useSystemStatsStream.ts` is a hook to handle system stats WebSocket data, process monitoring state,
and related backend requests.
