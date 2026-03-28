/* System stats detail views
 * Show detailed system monitor views:
 * - Process monitor
 * - Process list
 * - Storage info
 * - System info
 */
import React from 'react';
import { CustomButton, CustomStyledIconButton } from '../CustomComponents';
/* MUI */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
/* MUI X */
import { LineChart } from '@mui/x-charts/LineChart';
import {
  ProcHistoryPoint,
  ProcStats,
  StorageInfo,
  SystemInfo
} from './systemStatsTypes';

interface SystemStatsProcessViewProps {
  procName: string;
  setProcName: React.Dispatch<React.SetStateAction<string>>;
  sendMonitorRequest: () => void;
  clearMonitorInput: () => void;
  procHistory: ProcHistoryPoint[];
  procError: string | null;
  procStats: ProcStats | null;
  procMetrics: {
    cpu: boolean;
    rss: boolean;
    pss: boolean;
    uss: boolean;
  };
  toggleProcMetric: (key: 'cpu' | 'rss' | 'pss' | 'uss') => void;
}

/* Process monitor view with an optional history chart */
export const SystemStatsProcessView: React.FC<SystemStatsProcessViewProps> = ({
  procName,
  setProcName,
  sendMonitorRequest,
  clearMonitorInput,
  procHistory,
  procError,
  procStats,
  procMetrics,
  toggleProcMetric
}) => (
  <Stack spacing={1}>
    <Typography variant="subtitle2">Monitor a process by name</Typography>

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
      <Alert severity="error" variant="outlined" sx={{ py: 0.25, px: 1 }}>
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

    {/* Per-process history chart using MUI X */}
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
                    area: true,
                    baseline: 'min' as const,
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
                    area: true,
                    baseline: 'min' as const,
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
                    area: true,
                    baseline: 'min' as const,
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
                    area: true,
                    baseline: 'min' as const,
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
    )}
  </Stack>
);

interface SystemStatsProcessListViewProps {
  processList: string[];
  filteredProcesses: string[];
  processFilter: string;
  setProcessFilter: React.Dispatch<React.SetStateAction<string>>;
  requestProcessList: () => void;
  clearProcessList: () => void;
  selectedProcess: string | null;
  onSelectProcess: (name: string) => void;
  canCopyToClipboard: boolean;
  copyToClipboard: (text: string) => void;
  monitorSelectedProcess: () => void;
}

export const SystemStatsProcessListView: React.FC<
  SystemStatsProcessListViewProps
> = ({
  processList,
  filteredProcesses,
  processFilter,
  setProcessFilter,
  requestProcessList,
  clearProcessList,
  selectedProcess,
  onSelectProcess,
  canCopyToClipboard,
  copyToClipboard,
  monitorSelectedProcess
}) => (
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
          onClick={() => onSelectProcess(name)}
          style={{
            cursor: 'pointer',
            padding: '2px 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: selectedProcess === name ? '#333' : 'transparent'
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
                  monitorSelectedProcess();
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
);

interface SystemStatsStorageViewProps {
  storageInfo: StorageInfo[];
}

export const SystemStatsStorageView: React.FC<SystemStatsStorageViewProps> = ({
  storageInfo
}) => (
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
              <Typography variant="subtitle2" sx={{ marginBottom: '4px' }}>
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
                {(fs.total_kb / 1024).toFixed(0)} MB ({usedPercent.toFixed(1)}%)
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Box>
  </Stack>
);

interface SystemStatsSystemViewProps {
  systemInfo: SystemInfo | null;
  osLabel: string | null;
}

export const SystemStatsSystemView: React.FC<SystemStatsSystemViewProps> = ({
  systemInfo,
  osLabel
}) => (
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
        <>
          {systemInfo.hostname && <div>Hostname: {systemInfo.hostname}</div>}
          {osLabel && <div>OS: {osLabel}</div>}
          <div>Kernel release: {systemInfo.kernel_release}</div>
          <div>Kernel version: {systemInfo.kernel_version}</div>
          <div>Architecture: {systemInfo.machine}</div>
          <div>CPU cores: {systemInfo.cpu_cores}</div>
        </>
      </Box>
    )}
  </Stack>
);
