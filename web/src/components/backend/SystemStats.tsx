/* Stats
 * Get stats from WS backend and display them.
 */
import React, { useRef, useEffect, useState } from 'react';
import { log, enableLogging } from '../../helpers/logger';
import { useAppContext } from '../AppContext';
import { CustomButton, CustomStyledIconButton } from '../CustomComponents';
import { useOnScreenMessage } from '../OnScreenMessageContext';
/* MUI */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import LinearProgress from '@mui/material/LinearProgress';
import MemoryIcon from '@mui/icons-material/Memory';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
/* MUI X */
import { LineChart } from '@mui/x-charts/LineChart';

interface StorageInfo {
  path: string;
  fs: string;
  total_kb: number;
  used_kb: number;
  available_kb: number;
}

interface SystemInfo {
  kernel_release: string;
  kernel_version: string;

  machine: string;
  cpu_cores: number;

  os_name?: string;
  os_version?: string;
  os_pretty_name?: string;

  hostname?: string;
}

interface ProcHistoryPoint {
  ts: number;
  cpu: number;
  rss: number;
  pss: number;
  uss: number;
  pid: number;
}

interface ProcStats {
  name: string;
  pid: number;
  cpu: number;
  rss_kb: number;
  pss_kb: number;
  uss_kb: number;
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

const formatOsName = (info: SystemInfo): string | null => {
  if (info.os_pretty_name && info.os_pretty_name.trim() !== '') {
    return info.os_pretty_name;
  }

  if (info.os_name && info.os_version) {
    return `${info.os_name} ${info.os_version}`;
  }

  if (info.os_name) {
    return info.os_name;
  }

  return null;
};

const SystemStats: React.FC = () => {
  /* Global context */
  const { appSettings } = useAppContext();
  const { showMessage } = useOnScreenMessage();

  const wsAddress =
    appSettings.wsAddress && appSettings.wsAddress.trim() !== ''
      ? appSettings.wsAddress
      : import.meta.env.MODE === 'development'
        ? import.meta.env.VITE_TARGET_IP
        : window.location.hostname;

  const wsPort =
    typeof appSettings.wsPort === 'number' ? appSettings.wsPort : 9000;

  const WS_ADDRESS = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${wsAddress}:${wsPort}`;

  /* Local state */
  const [stats, setStats] = useState<SysStats | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<
    'bars' | 'chart' | 'process' | 'list' | 'storage' | 'system'
  >('bars');
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [procName, setProcName] = useState<string>('');
  const [procHistory, setProcHistory] = useState<ProcHistoryPoint[]>([]);
  const [procError, setProcError] = useState<string | null>(null);
  const [procStats, setProcStats] = useState<ProcStats | null>(null);
  const [processList, setProcessList] = useState<string[]>([]);
  const [processFilter, setProcessFilter] = useState<string>('');
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const [procMetrics, setProcMetrics] = useState<{
    cpu: boolean;
    rss: boolean;
    pss: boolean;
    uss: boolean;
  }>({
    cpu: true,
    rss: false,
    pss: true,
    uss: false
  });
  const [sysChartMetrics, setSysChartMetrics] = useState<{
    cpu: boolean;
    mem: boolean;
  }>({
    cpu: true,
    mem: true
  });
  const [storageInfo, setStorageInfo] = useState<StorageInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  /* Refs */
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const isUnmountedRef = useRef<boolean>(false);
  const intentionalCloseRef = useRef<boolean>(false);
  const connectionIdRef = useRef<number>(0);
  const mountMessageShownRef = useRef<boolean>(false);

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

  /* Request one-shot storage information */
  const requestStorageInfo = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    wsRef.current.send(JSON.stringify({ storage: true }));
  };

  /* Request one-shot system information */
  const requestSystemInfo = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    wsRef.current.send(JSON.stringify({ system_info: true }));
  };

  /* Toggle which per-process metric to show */
  const toggleProcMetric = (key: keyof typeof procMetrics) => {
    setProcMetrics((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  /* Toggle which total system metric to show */
  const toggleSysChartMetric = (key: keyof typeof sysChartMetrics) => {
    setSysChartMetrics((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  /* Recreate the Y-axis only when at least one system metric is enabled, so the chart rescales correctly when toggling */
  const sysChartYAxis =
    sysChartMetrics.cpu || sysChartMetrics.mem ? [{ min: 0 }] : [];

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

    /* New connection attempt generation */
    const myConnectionId = ++connectionIdRef.current;

    /* Create a new WebSocket and remember it for cleanup. */
    const ws = new WebSocket(WS_ADDRESS);
    wsRef.current = ws;

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
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      /* Ignore stale sockets */
      if (myConnectionId !== connectionIdRef.current) {
        return;
      }

      /* Server sends JSON snapshots */
      try {
        const data = JSON.parse(event.data);
        // console.log('has proc:', !!data.proc);

        /* One-shot process list */
        if (Array.isArray(data.processes)) {
          setProcessList(data.processes);
          return;
        }
        /* One-shot storage list */
        if (Array.isArray(data.storage)) {
          setStorageInfo(data.storage);
          return;
        }
        /* One-shot system info */
        if (data.system && typeof data.system === 'object') {
          setSystemInfo(data.system);
          return;
        }

        setStats(data);

        /* Set local proc stats state */
        if (data.proc) {
          setProcStats(data.proc);
        }

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
          /* Only clear process state if we are actually monitoring something */
          if (procName.trim() !== '') {
            setProcStats(null);
          }
        } else if (data.proc) {
          setProcError(null);
          setProcHistory((prev) => {
            /* If the monitored process PID changed (process restarted or replaced),
             * reset the history to avoid mixing different processes into one graph.
             *
             * We must compare against the last recorded PID, not React state,
             * because setStats() is async and stats.proc may be stale here.
             */
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              if (
                (last as any).pid !== undefined &&
                (last as any).pid !== data.proc.pid
              ) {
                return [
                  {
                    ts: data.ts,
                    cpu: data.proc.cpu,
                    rss: data.proc.rss_kb / 1024,
                    pss: data.proc.pss_kb / 1024,
                    uss: data.proc.uss_kb / 1024,
                    pid: data.proc.pid
                  }
                ];
              }
            }
            const next = [
              ...prev,
              {
                ts: data.ts,
                cpu: data.proc.cpu,
                rss: data.proc.rss_kb / 1024,
                pss: data.proc.pss_kb / 1024,
                uss: data.proc.uss_kb / 1024,
                pid: data.proc.pid
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
      /* Ignore stale sockets */
      if (myConnectionId !== connectionIdRef.current) {
        return;
      }

      /* Suppress errors during intentional teardown */
      if (intentionalCloseRef.current) {
        return;
      }
      setError('System monitor disconnected');
      setConnected(false);
    };

    ws.onclose = () => {
      /* Ignore stale sockets */
      if (myConnectionId !== connectionIdRef.current) {
        return;
      }

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
    }, 2000);
  };

  const closeSocket = (socket: WebSocket | null) => {
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
  };

  /* Show on-screen message when connected */
  useEffect(() => {
    if (mountMessageShownRef.current) {
      return;
    }
    if (!connected) {
      return;
    }
    mountMessageShownRef.current = true;
    showMessage({
      title: 'System Monitor',
      icon: <DeveloperBoardIcon fontSize="small" />,
      content: 'Live system statistics are now streaming.',
      duration: 5000
    });
  }, [connected, showMessage]);

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
  }, [appSettings.wsAddress, appSettings.wsPort]);

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

  /* Clipboard support (HTTP-safe fallback) */
  const canCopyToClipboard =
    typeof document !== 'undefined' &&
    typeof document.execCommand === 'function' &&
    (typeof document.queryCommandSupported !== 'function' ||
      document.queryCommandSupported('copy'));

  /* Copy to clipboard helper */
  const copyToClipboard = (text: string) => {
    if (!canCopyToClipboard) {
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed'; /* avoid scroll jump */
    textarea.style.opacity = '0';
    textarea.style.left = '0';
    textarea.style.top = '0';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand('copy');
    } catch {
      /* Just ignore any clipboard errors */
    }
    document.body.removeChild(textarea);
  };

  const cpuPercent = stats ? stats.cpu : 0;
  const memUsedKb = stats ? stats.mem_total_kb - stats.mem_available_kb : 0;
  const memUsedPercent = stats ? (memUsedKb / stats.mem_total_kb) * 100 : 0;

  /* Filter and sort the process list alphabetically */
  const filteredProcesses = processList
    .filter((name) => name.toLowerCase().includes(processFilter.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '80vh',
        maxWidth: '90vw',
        overflow: 'hidden',
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
            <Typography>Connecting to system monitor...</Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              {WS_ADDRESS}
            </Typography>
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
          <Stack
            spacing={2}
            sx={{
              overflowY: 'auto',
              maxHeight: 'calc(80vh - 64px)'
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1
              }}
            >
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

              <CustomButton
                size="small"
                variant="outlined"
                onClick={() => {
                  setViewMode('storage');
                  requestStorageInfo();
                }}
                sx={{
                  cursor: 'pointer',
                  color: '#fff',
                  opacity: viewMode === 'storage' ? 1 : 0.5
                }}
              >
                Storage
              </CustomButton>

              <CustomButton
                size="small"
                variant="outlined"
                onClick={() => {
                  setViewMode('system');
                  requestSystemInfo();
                }}
                sx={{
                  cursor: 'pointer',
                  color: '#fff',
                  opacity: viewMode === 'system' ? 1 : 0.5
                }}
              >
                System
              </CustomButton>
            </Box>

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
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1
                  }}
                >
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
                </Box>

                {/* Timestamp */}
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    alignSelf: 'flex-start'
                  }}
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
                </Box>

                {/* System info */}
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    alignSelf: 'flex-start'
                  }}
                >
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
                </Box>
              </>
            )}

            {/* Use MUI X LineChart for overall system stats */}
            {viewMode === 'chart' && (
              <>
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    alignSelf: 'flex-start'
                  }}
                >
                  <Tooltip title="Total system CPU usage." arrow>
                    <Chip
                      disableRipple
                      size="small"
                      clickable
                      onClick={() => toggleSysChartMetric('cpu')}
                      label={`CPU ${cpuPercent.toFixed(1)} %`}
                      sx={{
                        color: '#fff',
                        '& .MuiChip-label': { color: '#fff' },
                        opacity: sysChartMetrics.cpu ? 1 : 0.5,
                        border: sysChartMetrics.cpu
                          ? '1px solid #fff'
                          : undefined
                      }}
                    />
                  </Tooltip>

                  <Tooltip title="Total system RAM usage." arrow>
                    <Chip
                      disableRipple
                      size="small"
                      clickable
                      onClick={() => toggleSysChartMetric('mem')}
                      label={`RAM ${(memUsedKb / 1024).toFixed(0)} / ${(stats.mem_total_kb / 1024).toFixed(0)} MB`}
                      sx={{
                        color: '#fff',
                        '& .MuiChip-label': { color: '#fff' },
                        opacity: sysChartMetrics.mem ? 1 : 0.5,
                        border: sysChartMetrics.mem
                          ? '1px solid #fff'
                          : undefined
                      }}
                    />
                  </Tooltip>
                </Box>

                <Box sx={{ width: '100%', overflowX: 'hidden' }}>
                  <LineChart
                    skipAnimation
                    height={220}
                    margin={{ left: 0, right: 8, top: 16, bottom: 8 }}
                    series={[
                      ...(sysChartMetrics.cpu
                        ? [
                            {
                              data: history.map((h) => h.cpu),
                              label: 'CPU %',
                              showMark: false,
                              valueFormatter: (v: number | null) =>
                                v == null ? '' : `${v.toFixed(1)} %`
                            }
                          ]
                        : []),

                      ...(sysChartMetrics.mem
                        ? [
                            {
                              data: history.map((h) => h.mem),
                              label: 'RAM %',
                              showMark: false,
                              valueFormatter: (v: number | null) =>
                                v == null ? '' : `${v.toFixed(1)} %`
                            }
                          ]
                        : [])
                    ]}
                    yAxis={sysChartYAxis}
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
                </Box>
              </>
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
                    inputMode="text"
                    autoCorrect="off"
                    autoCapitalize="none"
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
                    disableRipple
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
                    disableRipple
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

                {procStats && (
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1,
                      alignSelf: 'flex-start'
                    }}
                  >
                    <Tooltip
                      title="Process ID. Changes when the process restarts or is replaced."
                      arrow
                    >
                      <Chip
                        size="small"
                        label={`PID ${procStats.pid}`}
                        sx={{
                          color: '#fff',
                          '& .MuiChip-label': { color: '#fff' }
                        }}
                      />
                    </Tooltip>

                    <Tooltip title="Total CPU usage for this process." arrow>
                      <Chip
                        disableRipple
                        size="small"
                        clickable
                        onClick={() => toggleProcMetric('cpu')}
                        label={`CPU ${procStats.cpu.toFixed(1)} %`}
                        sx={{
                          color: '#fff',
                          '& .MuiChip-label': { color: '#fff' },
                          opacity: procMetrics.cpu ? 1 : 0.5,
                          border: procMetrics.cpu ? '1px solid #fff' : undefined
                        }}
                      />
                    </Tooltip>

                    <Tooltip
                      title="RSS (Resident Set Size): how much RAM this process currently has mapped. Shared memory is counted in full."
                      arrow
                    >
                      <Chip
                        disableRipple
                        size="small"
                        clickable
                        onClick={() => toggleProcMetric('rss')}
                        label={`RSS ${(procStats.rss_kb / 1024).toFixed(1)} MB`}
                        sx={{
                          color: '#fff',
                          '& .MuiChip-label': { color: '#fff' },
                          opacity: procMetrics.rss ? 1 : 0.5,
                          border: procMetrics.rss ? '1px solid #fff' : undefined
                        }}
                      />
                    </Tooltip>

                    <Tooltip
                      title="PSS (Proportional Set Size): how much RAM this process really costs the system."
                      arrow
                    >
                      <Chip
                        disableRipple
                        size="small"
                        clickable
                        onClick={() => toggleProcMetric('pss')}
                        label={`PSS ${(procStats.pss_kb / 1024).toFixed(1)} MB`}
                        sx={{
                          color: '#fff',
                          '& .MuiChip-label': { color: '#fff' },
                          opacity: procMetrics.pss ? 1 : 0.5,
                          border: procMetrics.pss ? '1px solid #fff' : undefined
                        }}
                      />
                    </Tooltip>

                    <Tooltip
                      title="USS (Unique Set Size): how much RAM would be freed if this process exited."
                      arrow
                    >
                      <Chip
                        disableRipple
                        size="small"
                        clickable
                        onClick={() => toggleProcMetric('uss')}
                        label={`USS ${(procStats.uss_kb / 1024).toFixed(1)} MB`}
                        sx={{
                          color: '#fff',
                          '& .MuiChip-label': { color: '#fff' },
                          opacity: procMetrics.uss ? 1 : 0.5,
                          border: procMetrics.uss ? '1px solid #fff' : undefined
                        }}
                      />
                    </Tooltip>
                  </Box>
                )}

                {/* Use MUI X LineChart for per-process stats */}
                {procHistory.length > 1 && (
                  <Box sx={{ width: '100%', overflowX: 'hidden' }}>
                    <LineChart
                      skipAnimation
                      height={220}
                      margin={{ left: 0, right: 8, top: 16, bottom: 8 }}
                      series={[
                        ...(procMetrics.cpu
                          ? [
                              {
                                data: procHistory.map((p) => p.cpu),
                                label: 'CPU %',
                                showMark: false,
                                valueFormatter: (v: number | null) =>
                                  v == null ? '' : `${v.toFixed(1)} %`
                              }
                            ]
                          : []),

                        ...(procMetrics.rss
                          ? [
                              {
                                data: procHistory.map((p) => p.rss),
                                label: 'RSS MB',
                                showMark: false,
                                valueFormatter: (v: number | null) =>
                                  v == null ? '' : `${v.toFixed(1)} MB`
                              }
                            ]
                          : []),

                        ...(procMetrics.pss
                          ? [
                              {
                                data: procHistory.map((p) => p.pss),
                                label: 'PSS MB (real memory)',
                                showMark: false,
                                valueFormatter: (v: number | null) =>
                                  v == null ? '' : `${v.toFixed(1)} MB`
                              }
                            ]
                          : []),

                        ...(procMetrics.uss
                          ? [
                              {
                                data: procHistory.map((p) => p.uss),
                                label: 'USS MB',
                                showMark: false,
                                valueFormatter: (v: number | null) =>
                                  v == null ? '' : `${v.toFixed(1)} MB`
                              }
                            ]
                          : [])
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
                  </Box>
                )}
              </Stack>
            )}

            {viewMode === 'list' && (
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle2">Running processes</Typography>
                  {processList.length > 0 && (
                    <Chip
                      size="small"
                      label={`${processList.length} processes`}
                      sx={{
                        color: '#fff',
                        '& .MuiChip-label': { color: '#fff' },
                        opacity: 0.7
                      }}
                    />
                  )}
                </Stack>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <input
                    type="text"
                    inputMode="text"
                    autoCorrect="off"
                    autoCapitalize="none"
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
                    disableRipple
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
                    disableRipple
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
                          {canCopyToClipboard && (
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
                          )}
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

            {viewMode === 'storage' && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Filesystem storage</Typography>

                {storageInfo.length === 0 && (
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    No storage data received yet
                  </Typography>
                )}

                <Box
                  sx={{
                    maxHeight: '240px',
                    overflowY: 'auto'
                  }}
                >
                  <Stack spacing={1}>
                    {storageInfo.map((fs) => {
                      const usedPercent =
                        fs.total_kb > 0 ? (fs.used_kb / fs.total_kb) * 100 : 0;

                      return (
                        <Box
                          key={`${fs.path}:${fs.fs}`}
                          sx={{
                            border: '1px solid #333',
                            padding: '8px',
                            backgroundColor: '#111'
                          }}
                        >
                          <Typography
                            variant="subtitle2"
                            sx={{ marginBottom: '4px' }}
                          >
                            {fs.path}
                          </Typography>

                          <Typography variant="caption" sx={{ opacity: 0.7 }}>
                            Filesystem: {fs.fs}
                          </Typography>

                          <LinearProgress
                            variant="determinate"
                            value={Math.min(usedPercent, 100)}
                            sx={{ height: 12, marginBottom: '4px' }}
                          />

                          <Typography variant="caption" sx={{ opacity: 0.8 }}>
                            Used {(fs.used_kb / 1024).toFixed(0)} MB /{' '}
                            {(fs.total_kb / 1024).toFixed(0)} MB (
                            {usedPercent.toFixed(1)}%)
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              </Stack>
            )}

            {viewMode === 'system' && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">System information</Typography>

                {!systemInfo && (
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    No system information received yet
                  </Typography>
                )}

                {systemInfo && (
                  <Box
                    className="selectable-text"
                    sx={{
                      backgroundColor: '#111',
                      border: '1px solid #333',
                      padding: '8px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      userSelect: 'text'
                    }}
                  >
                    {(() => {
                      const osLabel = formatOsName(systemInfo);
                      return (
                        <>
                          {systemInfo.hostname && (
                            <div>Hostname: {systemInfo.hostname}</div>
                          )}
                          {osLabel && <div>OS: {osLabel}</div>}
                          <div>Kernel release: {systemInfo.kernel_release}</div>
                          <div>Kernel version: {systemInfo.kernel_version}</div>
                          <div>Architecture: {systemInfo.machine}</div>
                          <div>CPU cores: {systemInfo.cpu_cores}</div>
                        </>
                      );
                    })()}
                  </Box>
                )}
              </Stack>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default SystemStats;
