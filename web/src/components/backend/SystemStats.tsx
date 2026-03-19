/* Stats
 * Get stats from WS backend and display them.
 */
import React, { useRef, useEffect, useState } from 'react';
import { enableLogging } from '../../helpers/logger';
import { useAppSettingsContext } from '../context/AppContext';
import { CustomButton } from '../CustomComponents';
import { useOnScreenMessage } from '../context/OnScreenMessageContext';
import {
  SystemStatsProcessListView,
  SystemStatsProcessView,
  SystemStatsStorageView,
  SystemStatsSystemView
} from './SystemStatsDetailViews';
import { useReconnectableWebSocket } from './useReconnectableWebSocket';
import {
  HistoryPoint,
  ProcHistoryPoint,
  ProcStats,
  StorageInfo,
  SystemInfo,
  SysStats
} from './systemStatsTypes';
/* MUI */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import LinearProgress from '@mui/material/LinearProgress';
import MemoryIcon from '@mui/icons-material/Memory';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
/* MUI X */
import { LineChart } from '@mui/x-charts/LineChart';

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
  const { appSettings } = useAppSettingsContext();
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
  const [sysChartCoreMetrics, setSysChartCoreMetrics] = useState<boolean[]>([]);
  const [barsCoreSectionExpanded, setBarsCoreSectionExpanded] =
    useState<boolean>(false);
  const [chartCoreListExpanded, setChartCoreListExpanded] =
    useState<boolean>(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  /* Refs */
  const mountMessageShownRef = useRef<boolean>(false);

  enableLogging(false);

  const { send } = useReconnectableWebSocket({
    url: WS_ADDRESS,
    onOpen: () => {
      setConnected(true);
      setError(null);
    },
    onMessage: (event) => {
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
            {
              ts: data.ts,
              cpu: data.cpu,
              mem: memPercent,
              cpuPerCore: Array.isArray(data.cpu_per_core)
                ? [...data.cpu_per_core]
                : []
            }
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
    },
    onError: () => {
      setError('System monitor disconnected');
      setConnected(false);
    },
    onClose: () => {
      setConnected(false);
    }
  });

  /* Send a per-process monitor request */
  const sendMonitorRequest = () => {
    if (!send(JSON.stringify({ monitor: procName.trim() }))) {
      return;
    }

    setProcError(null);
    setProcHistory([]);
  };

  /* Request a one-shot process list */
  const requestProcessList = () => {
    send(JSON.stringify({ list_processes: true }));
  };

  /* Request one-shot storage information */
  const requestStorageInfo = () => {
    send(JSON.stringify({ storage: true }));
  };

  /* Request one-shot system information */
  const requestSystemInfo = () => {
    send(JSON.stringify({ system_info: true }));
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

  const toggleSysChartCoreMetric = (index: number) => {
    setSysChartCoreMetrics((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const toggleAllSysChartCoreMetrics = () => {
    const coreCount = stats?.cpu_per_core?.length ?? 0;
    const showAll = sysChartCoreMetrics
      .slice(0, coreCount)
      .some((enabled) => !enabled);
    setSysChartCoreMetrics(Array.from({ length: coreCount }, () => showAll));
  };

  useEffect(() => {
    const coreCount = stats?.cpu_per_core?.length ?? 0;
    setSysChartCoreMetrics((prev) => {
      if (prev.length === coreCount) {
        return prev;
      }

      return Array.from(
        { length: coreCount },
        (_, index) => prev[index] ?? false
      );
    });
  }, [stats?.cpu_per_core?.length]);

  /* Recreate the Y-axis only when at least one system metric is enabled, so the chart rescales correctly when toggling */
  const sysChartYAxis =
    sysChartMetrics.cpu ||
    sysChartMetrics.mem ||
    sysChartCoreMetrics.some(Boolean)
      ? [{ min: 0 }]
      : [];
  const sysChartCoreSeries = (stats?.cpu_per_core ?? []).flatMap((_, index) =>
    sysChartCoreMetrics[index]
      ? [
          {
            data: history.map((h) =>
              h.cpuPerCore[index] === undefined ? null : h.cpuPerCore[index]
            ),
            label: `CPU ${index} %`,
            showMark: false,
            valueFormatter: (v: number | null) =>
              v == null ? '' : `${v.toFixed(1)} %`
          }
        ]
      : []
  );
  const allSysChartCoresEnabled =
    (stats?.cpu_per_core?.length ?? 0) > 0 &&
    sysChartCoreMetrics
      .slice(0, stats?.cpu_per_core?.length ?? 0)
      .every(Boolean);

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

  const clearMonitorInput = () => {
    /* Clear UI state */
    setProcName('');
    setProcError(null);
    setProcHistory([]);
    setError(null);

    /* Tell backend to stop monitoring */
    send(JSON.stringify({ monitor: '' }));
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
  const osLabel = systemInfo ? formatOsName(systemInfo) : null;

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

                {/* Per-core CPU usage */}
                {Array.isArray(stats.cpu_per_core) &&
                  stats.cpu_per_core.length > 0 && (
                    <Box>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                          mb: barsCoreSectionExpanded ? 1 : 0
                        }}
                      >
                        <Typography
                          variant="subtitle2"
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5
                          }}
                        >
                          <DeveloperBoardIcon sx={{ fontSize: 16 }} />
                          Per-core CPU usage
                        </Typography>
                        <CustomButton
                          size="small"
                          variant="outlined"
                          onClick={() =>
                            setBarsCoreSectionExpanded((prev) => !prev)
                          }
                          sx={{
                            color: '#fff',
                            borderColor: '#fff',
                            flexShrink: 0
                          }}
                        >
                          {barsCoreSectionExpanded ? 'Collapse' : 'Expand'}
                        </CustomButton>
                      </Box>
                      {barsCoreSectionExpanded && (
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns:
                              'repeat(auto-fit, minmax(140px, 1fr))',
                            gap: 1
                          }}
                        >
                          {stats.cpu_per_core.map((coreUsage, index) => (
                            <Box key={`cpu-core-${index}`}>
                              <Typography variant="caption">
                                CPU {index}: {coreUsage.toFixed(1)} %
                              </Typography>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(coreUsage, 100)}
                                sx={{
                                  height: 10,
                                  borderRadius: 0
                                }}
                              />
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  )}

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

                {Array.isArray(stats.cpu_per_core) &&
                  stats.cpu_per_core.length > 0 && (
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        width: '100%'
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{
                          flexWrap: 'wrap'
                        }}
                      >
                        <Typography variant="subtitle2">CPU cores</Typography>
                        <Chip
                          size="small"
                          label={`${stats.cpu_per_core.length} cores`}
                          sx={{
                            color: '#fff',
                            '& .MuiChip-label': { color: '#fff' },
                            opacity: 0.7
                          }}
                        />
                        <CustomButton
                          size="small"
                          variant="outlined"
                          onClick={toggleAllSysChartCoreMetrics}
                          sx={{
                            color: '#fff',
                            borderColor: '#fff'
                          }}
                        >
                          {allSysChartCoresEnabled
                            ? 'Hide all cores'
                            : 'Show all cores'}
                        </CustomButton>
                        <CustomButton
                          size="small"
                          variant="outlined"
                          onClick={() =>
                            setChartCoreListExpanded((prev) => !prev)
                          }
                          sx={{
                            color: '#fff',
                            borderColor: '#fff'
                          }}
                        >
                          {chartCoreListExpanded ? 'Collapse' : 'Expand'}
                        </CustomButton>
                      </Stack>

                      {chartCoreListExpanded && (
                        <Box
                          sx={{
                            maxHeight: '240px',
                            width: '100%',
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
                          {stats.cpu_per_core.map((coreUsage, index) => (
                            <div
                              key={`sys-chart-core-${index}`}
                              onClick={() => toggleSysChartCoreMetric(index)}
                              style={{
                                cursor: 'pointer',
                                padding: '4px 6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                backgroundColor: sysChartCoreMetrics[index]
                                  ? '#333'
                                  : 'transparent'
                              }}
                            >
                              <span>{`CPU ${index}`}</span>
                              <span>{`${coreUsage.toFixed(1)} %`}</span>
                            </div>
                          ))}
                        </Box>
                      )}
                    </Box>
                  )}

                <Box sx={{ width: '100%', overflowX: 'hidden' }}>
                  <LineChart
                    skipAnimation
                    hideLegend
                    height={220}
                    margin={{ left: 0, right: 8, top: 16, bottom: 8 }}
                    series={[
                      ...(sysChartMetrics.cpu
                        ? [
                            {
                              data: history.map((h) => h.cpu),
                              label: 'CPU %',
                              area: true,
                              baseline: 'min' as const,
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
                              area: true,
                              baseline: 'min' as const,
                              showMark: false,
                              valueFormatter: (v: number | null) =>
                                v == null ? '' : `${v.toFixed(1)} %`
                            }
                          ]
                        : []),

                      ...sysChartCoreSeries
                    ]}
                    yAxis={sysChartYAxis}
                    sx={{
                      '& .MuiAreaElement-root': {
                        fillOpacity: 0.12
                      },
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
              <SystemStatsProcessView
                procName={procName}
                setProcName={setProcName}
                sendMonitorRequest={sendMonitorRequest}
                clearMonitorInput={clearMonitorInput}
                procHistory={procHistory}
                procError={procError}
                procStats={procStats}
                procMetrics={procMetrics}
                toggleProcMetric={toggleProcMetric}
              />
            )}

            {viewMode === 'list' && (
              <SystemStatsProcessListView
                processList={processList}
                filteredProcesses={filteredProcesses}
                processFilter={processFilter}
                setProcessFilter={setProcessFilter}
                requestProcessList={requestProcessList}
                clearProcessList={clearProcessList}
                selectedProcess={selectedProcess}
                onSelectProcess={(name) => {
                  setSelectedProcess(name);
                  setProcName(name);
                }}
                canCopyToClipboard={canCopyToClipboard}
                copyToClipboard={copyToClipboard}
                monitorSelectedProcess={() => {
                  setViewMode('process');
                  sendMonitorRequest();
                }}
              />
            )}

            {viewMode === 'storage' && (
              <SystemStatsStorageView storageInfo={storageInfo} />
            )}

            {viewMode === 'system' && (
              <SystemStatsSystemView
                systemInfo={systemInfo}
                osLabel={osLabel}
              />
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default SystemStats;
