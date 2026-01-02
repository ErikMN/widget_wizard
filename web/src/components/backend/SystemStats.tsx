/* Stats
 * Get stats from WS backend and display them.
 */
import React, { useRef, useEffect, useState } from 'react';
import { log, enableLogging } from '../../helpers/logger';
import { useAppContext } from '../AppContext';
import { CustomButton, CustomStyledIconButton } from '../CustomComponents';
/* MUI */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import LinearProgress from '@mui/material/LinearProgress';
import MemoryIcon from '@mui/icons-material/Memory';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
/* MUI X */
import { LineChart } from '@mui/x-charts/LineChart';

const WS_PORT = 9000;

const WS_ADDRESS =
  import.meta.env.MODE === 'development'
    ? `ws://${import.meta.env.VITE_TARGET_IP}:${WS_PORT}`
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:${WS_PORT}`;

interface ProcHistoryPoint {
  ts: number;
  cpu: number;
  mem: number;
}

interface ProcStats {
  name: string;
  cpu: number;
  rss_kb: number;
}

interface SysStats {
  ts: number;
  mono_ms: number;
  delta_ms: number;
  cpu: number;
  cpu_cores: number;
  mem_total_kb: number;
  mem_available_kb: number;
  uptime_s: number;
  load1: number;
  load5: number;
  load15: number;
  clients: {
    connected: number;
    max: number;
  };
  proc?: ProcStats;
}

interface HistoryPoint {
  ts: number;
  cpu: number;
  mem: number;
}

const MAX_HISTORY_POINTS = 60;

/* Convert uptime in seconds to a compact human-readable string (e.g. "2d 3h 4m 5s"). */
const formatUptime = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0 || days > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${secs}s`);

  return parts.join(' ');
};

const SystemStats: React.FC = () => {
  /* Global context */
  const { appSettings } = useAppContext();

  /* Local state */
  const [stats, setStats] = useState<SysStats | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<
    'bars' | 'chart' | 'process' | 'list'
  >('bars');

  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [procName, setProcName] = useState<string>('');
  const [procHistory, setProcHistory] = useState<ProcHistoryPoint[]>([]);
  const [procError, setProcError] = useState<string | null>(null);

  const [processList, setProcessList] = useState<string[]>([]);
  const [processFilter, setProcessFilter] = useState<string>('');
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);

  /* Refs */
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const isUnmountedRef = useRef<boolean>(false);
  const intentionalCloseRef = useRef<boolean>(false);

  enableLogging(false);

  const isConnectingOrOpen = () =>
    wsRef.current !== null &&
    (wsRef.current.readyState === WebSocket.CONNECTING ||
      wsRef.current.readyState === WebSocket.OPEN);

  /* Send a per-process monitor request */
  const sendMonitorRequest = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    setProcError(null);
    setProcHistory([]);
    wsRef.current.send(JSON.stringify({ monitor: procName.trim() }));
  };

  /* Request a one-shot process list */
  const requestProcessList = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    wsRef.current.send(JSON.stringify({ list_processes: true }));
  };

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
  const connect = () => {
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

    /* Create a new WebSocket and remember it for cleanup. */
    const ws = new WebSocket(WS_ADDRESS);
    wsRef.current = ws;

    ws.onopen = () => {
      /* If the component was unmounted while the socket was CONNECTING,
       * the socket may still complete the handshake and become OPEN.
       * In that case, immediately close it to avoid a leaked connection.
       */
      if (intentionalCloseRef.current || isUnmountedRef.current) {
        ws.close();
        return;
      }
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      /* Server sends JSON snapshots */
      try {
        const data = JSON.parse(event.data);

        if (Array.isArray(data.processes)) {
          setProcessList(data.processes);
          return;
        }

        setStats(data);

        const memUsedKb = data.mem_total_kb - data.mem_available_kb;
        const memPercent = (memUsedKb / data.mem_total_kb) * 100;
        setHistory((prev) => {
          const next = [
            ...prev,
            { ts: data.ts, cpu: data.cpu, mem: memPercent }
          ];
          return next.length > MAX_HISTORY_POINTS
            ? next.slice(-MAX_HISTORY_POINTS)
            : next;
        });
        /* Optional per process stats */
        if (data.error && data.error.type === 'process_not_found') {
          setProcError(data.error.message);
        } else if (data.proc) {
          setProcError(null);
          const procMemMb = data.proc.rss_kb / 1024;
          setProcHistory((prev) => {
            const next = [
              ...prev,
              {
                ts: data.ts,
                cpu: data.proc.cpu,
                mem: procMemMb
              }
            ];
            return next.length > MAX_HISTORY_POINTS
              ? next.slice(-MAX_HISTORY_POINTS)
              : next;
          });
        }
      } catch {
        /* Ignore invalid JSON frames */
      }
    };

    ws.onerror = () => {
      /* Suppress errors during intentional teardown */
      if (intentionalCloseRef.current) {
        return;
      }
      setError('WebSocket disconnected');
      setConnected(false);
    };

    ws.onclose = () => {
      /* Suppress reconnect during intentional teardown */
      if (intentionalCloseRef.current) {
        return;
      }
      setConnected(false);

      /* Connection dropped: try again later */
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (isUnmountedRef.current) {
      return;
    }
    if (reconnectTimerRef.current !== null) {
      return;
    }
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, 2000);
  };

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
        /* Detach handlers to avoid scheduling reconnect from close/error during teardown */
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;

        /* Close only if already OPEN. If CONNECTING, we avoid calling close()
         * here to prevent "closed before the connection is established" noise.
         * The ws.onopen handler handles the CONNECTING -> OPEN after unmount case
         * by immediately closing the socket.
         */
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }

        wsRef.current = null;
      }
    };
  }, []);

  const clearMonitorInput = () => {
    /* Clear UI state */
    setProcName('');
    setProcError(null);
    setProcHistory([]);
    setError(null);

    /* Tell backend to stop monitoring */
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ monitor: '' }));
    }
  };

  /* Clear process filter */
  const clearProcessList = () => {
    setProcessFilter('');
  };

  /* Copy to clipboard helper */
  const copyToClipboard = (text: string) => {
    if (!navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(text).catch(() => {
      /* Just ignore any clipboard errors */
    });
  };

  const cpuPercent = stats ? stats.cpu : 0;
  const memUsedKb = stats ? stats.mem_total_kb - stats.mem_available_kb : 0;
  const memUsedPercent = stats ? (memUsedKb / stats.mem_total_kb) * 100 : 0;

  const filteredProcesses = processList.filter((name) =>
    name.toLowerCase().includes(processFilter.toLowerCase())
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '6px',
        color: '#fff',
        '& .MuiTypography-root': { color: '#fff' },
        '& .MuiSvgIcon-root': { color: '#fff' }
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {!connected && !error && (
          <Alert
            severity="info"
            variant="outlined"
            sx={{
              py: 0.25,
              px: 1,
              color: '#fff'
            }}
          >
            Connecting to statistics backend...
          </Alert>
        )}

        {error && (
          <Alert
            severity="error"
            variant="outlined"
            sx={{
              py: 0.25,
              px: 1,
              color: '#fff'
            }}
          >
            {error}
          </Alert>
        )}

        {connected && stats && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1}>
              <CustomButton
                size="small"
                variant="outlined"
                onClick={() => setViewMode('bars')}
                sx={{
                  cursor: 'pointer',
                  color: '#fff',
                  '& .MuiChip-label': { color: '#fff' },
                  opacity: viewMode === 'bars' ? 1 : 0.5
                }}
              >
                Bars
              </CustomButton>
              <CustomButton
                size="small"
                variant="outlined"
                onClick={() => setViewMode('chart')}
                sx={{
                  cursor: 'pointer',
                  color: '#fff',
                  '& .MuiChip-label': { color: '#fff' },
                  opacity: viewMode === 'chart' ? 1 : 0.5
                }}
              >
                Chart
              </CustomButton>

              <CustomButton
                size="small"
                variant="outlined"
                onClick={() => setViewMode('process')}
                sx={{
                  cursor: 'pointer',
                  color: '#fff',
                  '& .MuiChip-label': { color: '#fff' },
                  opacity: viewMode === 'process' ? 1 : 0.5
                }}
              >
                Process
              </CustomButton>
              <CustomButton
                size="small"
                variant="outlined"
                onClick={() => {
                  setViewMode('list');
                  requestProcessList();
                }}
                sx={{
                  cursor: 'pointer',
                  color: '#fff',
                  '& .MuiChip-label': { color: '#fff' },
                  opacity: viewMode === 'list' ? 1 : 0.5
                }}
              >
                List
              </CustomButton>
            </Stack>

            {/* Use standard MUI components */}
            {viewMode === 'bars' && (
              <>
                {/* CPU */}
                <Box>
                  <Typography
                    variant="subtitle2"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <DeveloperBoardIcon sx={{ fontSize: 16 }} />
                    CPU: {cpuPercent.toFixed(1)} %
                  </Typography>

                  <LinearProgress
                    variant="determinate"
                    value={Math.min(cpuPercent, 100)}
                    sx={{
                      height: 16,
                      borderRadius: 0
                    }}
                  />
                </Box>

                {/* Memory */}
                <Box>
                  <Typography
                    variant="subtitle2"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <MemoryIcon sx={{ fontSize: 16 }} />
                    RAM: {memUsedPercent.toFixed(1)} % (
                    {(memUsedKb / 1024).toFixed(0)} MB of{' '}
                    {(stats.mem_total_kb / 1024).toFixed(0)} MB)
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(memUsedPercent, 100)}
                    sx={{
                      height: 16,
                      borderRadius: 0
                    }}
                  />
                </Box>

                {/* Load average */}
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip
                    size="small"
                    variant="filled"
                    label={`Load 1m: ${stats.load1.toFixed(2)}`}
                    sx={{
                      alignSelf: 'flex-start',
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' }
                    }}
                  />
                  <Chip
                    size="small"
                    variant="filled"
                    label={`Load 5m: ${stats.load5.toFixed(2)}`}
                    sx={{
                      alignSelf: 'flex-start',
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' }
                    }}
                  />
                  <Chip
                    size="small"
                    variant="filled"
                    label={`Load 15m: ${stats.load15.toFixed(2)}`}
                    sx={{
                      alignSelf: 'flex-start',
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' }
                    }}
                  />
                </Stack>

                {/* Timestamp */}
                <Stack
                  direction="row"
                  spacing={1}
                  flexWrap="wrap"
                  sx={{ alignSelf: 'flex-start' }}
                >
                  <Chip
                    size="small"
                    variant="filled"
                    label={`Updated at ${new Date(stats.ts).toLocaleTimeString()}`}
                    sx={{
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' }
                    }}
                  />
                  <Chip
                    size="small"
                    variant="filled"
                    label={`Uptime: ${formatUptime(stats.uptime_s)}`}
                    sx={{
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' }
                    }}
                  />
                </Stack>

                {/* System info */}
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip
                    size="small"
                    variant="filled"
                    label={`CPU cores: ${stats.cpu_cores}`}
                    sx={{
                      alignSelf: 'flex-start',
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' }
                    }}
                  />
                  <Chip
                    size="small"
                    variant="filled"
                    label={`Clients: ${stats.clients.connected} / ${stats.clients.max}`}
                    sx={{
                      alignSelf: 'flex-start',
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' }
                    }}
                  />
                </Stack>
              </>
            )}

            {/* Use MUI X LineChart for overall system stats */}
            {viewMode === 'chart' && (
              <LineChart
                height={220}
                margin={{ left: 0, right: 8, top: 16, bottom: 8 }}
                series={[
                  {
                    data: history.map((h) => h.cpu),
                    label: 'CPU %',
                    showMark: false,
                    valueFormatter: (v) =>
                      v == null ? '' : `${v.toFixed(1)} %`
                  },
                  {
                    data: history.map((h) => h.mem),
                    label: 'RAM %',
                    showMark: false,
                    valueFormatter: (v) =>
                      v == null ? '' : `${v.toFixed(1)} %`
                  }
                ]}
                yAxis={[{ min: 0, max: 100 }]}
                sx={{
                  '& .MuiChartsAxis-line': {
                    stroke: '#fff !important'
                  },
                  '& .MuiChartsAxis-tick': {
                    stroke: '#fff !important'
                  },
                  '& .MuiChartsAxis-tickLabel': {
                    fill: '#fff !important'
                  },
                  '& .MuiChartsLegend-root': {
                    color: '#fff !important'
                  }
                }}
              />
            )}

            {/* Use MUI X LineChart for per-process stats */}
            {viewMode === 'process' && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">
                  Monitor a process by name
                </Typography>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <input
                    type="text"
                    value={procName}
                    onChange={(e) => setProcName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        sendMonitorRequest();
                      }
                    }}
                    placeholder="process name"
                    style={{
                      flex: 1,
                      padding: '6px',
                      background: '#222',
                      color: '#fff',
                      border: '1px solid #555'
                    }}
                  />
                  <Chip
                    size="small"
                    label="Start"
                    onClick={sendMonitorRequest}
                    sx={{
                      cursor: 'pointer',
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' }
                    }}
                  />
                  <Chip
                    size="small"
                    label="Clear"
                    onClick={clearMonitorInput}
                    sx={{
                      cursor: 'pointer',
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' }
                    }}
                  />
                </Box>

                {procHistory.length === 0 && (
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    Enter a process name and press Start
                  </Typography>
                )}

                {procError && (
                  <Alert
                    severity="error"
                    variant="outlined"
                    sx={{ py: 0.25, px: 1 }}
                  >
                    {procError}
                  </Alert>
                )}

                {procHistory.length > 1 && (
                  <LineChart
                    height={220}
                    margin={{ left: 0, right: 8, top: 16, bottom: 8 }}
                    series={[
                      {
                        data: procHistory.map((p) => p.cpu),
                        label: 'Process CPU %',
                        showMark: false,
                        valueFormatter: (v) =>
                          v == null ? '' : `${v.toFixed(1)} %`
                      },
                      {
                        data: procHistory.map((p) => p.mem),
                        label: 'RAM MB',
                        showMark: false,
                        valueFormatter: (v) =>
                          v == null ? '' : `${v.toFixed(1)} MB`
                      }
                    ]}
                    yAxis={[
                      {
                        min: 0
                      }
                    ]}
                    sx={{
                      '& .MuiChartsAxis-line': {
                        stroke: '#fff !important'
                      },
                      '& .MuiChartsAxis-tick': {
                        stroke: '#fff !important'
                      },
                      '& .MuiChartsAxis-tickLabel': {
                        fill: '#fff !important'
                      },
                      '& .MuiChartsLegend-root': {
                        color: '#fff !important'
                      }
                    }}
                  />
                )}
              </Stack>
            )}

            {viewMode === 'list' && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">
                  Running processes (double click to monitor)
                </Typography>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <input
                    type="text"
                    value={processFilter}
                    onChange={(e) => setProcessFilter(e.target.value)}
                    placeholder="filter processes"
                    style={{
                      flex: 1,
                      padding: '6px',
                      background: '#222',
                      color: '#fff',
                      border: '1px solid #555'
                    }}
                  />

                  <Chip
                    size="small"
                    label="Refresh"
                    onClick={requestProcessList}
                    sx={{
                      cursor: 'pointer',
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' }
                    }}
                  />

                  <Chip
                    size="small"
                    label="Clear"
                    onClick={clearProcessList}
                    sx={{
                      cursor: 'pointer',
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' }
                    }}
                  />
                </Box>

                <Box
                  sx={{
                    maxHeight: '240px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    backgroundColor: '#111',
                    color: '#fff',
                    padding: '8px',
                    border: '1px solid #333'
                  }}
                >
                  {filteredProcesses.map((name) => (
                    <div
                      key={name}
                      /* Needed to exclude from Draggable on touch screens */
                      className="process-row"
                      onClick={() => {
                        setSelectedProcess(name);
                        setProcName(name);
                      }}
                      style={{
                        cursor: 'pointer',
                        padding: '2px 4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor:
                          selectedProcess === name ? '#333' : 'transparent'
                      }}
                    >
                      <span>{name}</span>
                      {selectedProcess === name && (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <CustomStyledIconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(name);
                            }}
                            sx={{
                              minWidth: 0,
                              padding: '2px',
                              marginRight: '4px'
                            }}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </CustomStyledIconButton>
                          <CustomButton
                            size="small"
                            variant="outlined"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewMode('process');
                              sendMonitorRequest();
                            }}
                          >
                            Monitor
                          </CustomButton>
                        </div>
                      )}
                    </div>
                  ))}
                </Box>
              </Stack>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default SystemStats;
