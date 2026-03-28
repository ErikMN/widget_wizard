# Backend

This directory handles all frontend that communicates with the OPTIONAL ACAP backend.

`BackendControl.tsx` handles the toggling of the backend enable or disable state.

`SystemStats.tsx` is the main entry point for the frontend of the system stats backend websocket service.

`SystemStatsOverviewViews.tsx` handles overview system stats from the backend service.

`SystemStatsDetailViews.tsx` handles specific visualization of system info from the backend.

`useReconnectableWebSocket.ts` is a hook to handle websocket connections to the backend service.

`useSystemStatsStream.ts` is a hook to handle system stats websocket data, process monitoring state,
and related backend requests.
