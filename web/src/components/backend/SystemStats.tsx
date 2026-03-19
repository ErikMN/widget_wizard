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
import {
  SystemStatsBarsView,
  SystemStatsChartView
} from './SystemStatsOverviewViews';
import { useSystemStatsStream } from './useSystemStatsStream';
import { SystemInfo } from './systemStatsTypes';
/* MUI */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

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
  const [viewMode, setViewMode] = useState<
    'bars' | 'chart' | 'process' | 'list' | 'storage' | 'system'
  >('bars');
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

  /* Refs */
  const mountMessageShownRef = useRef<boolean>(false);

  enableLogging(false);

  const {
    connected,
    error,
    stats,
    history,
    procName,
    setProcName,
    procHistory,
    procError,
    procStats,
    processList,
    storageInfo,
    systemInfo,
    sendMonitorRequest,
    requestProcessList,
    requestStorageInfo,
    requestSystemInfo,
    clearMonitorInput
  } = useSystemStatsStream({
    url: WS_ADDRESS
  });

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

            {viewMode === 'bars' && (
              <SystemStatsBarsView
                stats={stats}
                cpuPercent={cpuPercent}
                memUsedKb={memUsedKb}
                memUsedPercent={memUsedPercent}
                barsCoreSectionExpanded={barsCoreSectionExpanded}
                toggleBarsCoreSectionExpanded={() =>
                  setBarsCoreSectionExpanded((prev) => !prev)
                }
              />
            )}

            {viewMode === 'chart' && (
              <SystemStatsChartView
                stats={stats}
                history={history}
                cpuPercent={cpuPercent}
                memUsedKb={memUsedKb}
                sysChartMetrics={sysChartMetrics}
                toggleSysChartMetric={toggleSysChartMetric}
                sysChartCoreMetrics={sysChartCoreMetrics}
                toggleSysChartCoreMetric={toggleSysChartCoreMetric}
                toggleAllSysChartCoreMetrics={toggleAllSysChartCoreMetrics}
                allSysChartCoresEnabled={allSysChartCoresEnabled}
                chartCoreListExpanded={chartCoreListExpanded}
                toggleChartCoreListExpanded={() =>
                  setChartCoreListExpanded((prev) => !prev)
                }
                sysChartCoreSeries={sysChartCoreSeries}
                sysChartYAxis={sysChartYAxis}
              />
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
