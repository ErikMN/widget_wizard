/* System stats overview views
 * Show overview system monitor views:
 * - Bars
 * - Chart
 */
import React from 'react';
import { CustomButton } from '../CustomComponents';
/* MUI */
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
import { HistoryPoint, SysStats } from './systemStatsTypes';

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

interface SystemStatsBarsViewProps {
  stats: SysStats;
  cpuPercent: number;
  memUsedKb: number;
  memUsedPercent: number;
  barsCoreSectionExpanded: boolean;
  toggleBarsCoreSectionExpanded: () => void;
}

/* Overall system stats bars view */
export const SystemStatsBarsView: React.FC<SystemStatsBarsViewProps> = ({
  stats,
  cpuPercent,
  memUsedKb,
  memUsedPercent,
  barsCoreSectionExpanded,
  toggleBarsCoreSectionExpanded
}) => (
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

    {/* Per-core CPU usage dropdown */}
    {Array.isArray(stats.cpu_per_core) && stats.cpu_per_core.length > 0 && (
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

          {/* Expand or collapse CPU cores bars */}
          <CustomButton
            size="small"
            variant="outlined"
            onClick={toggleBarsCoreSectionExpanded}
            sx={{
              color: '#fff',
              borderColor: '#fff',
              flexShrink: 0
            }}
          >
            {barsCoreSectionExpanded ? 'Collapse' : 'Expand'}
          </CustomButton>
        </Box>
        {/* Per-core CPU usage bars */}
        {barsCoreSectionExpanded && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
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

    {/* System memory */}
    <Box>
      <Typography
        variant="subtitle2"
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
      >
        <MemoryIcon sx={{ fontSize: 16 }} />
        RAM: {memUsedPercent.toFixed(1)} % ({(memUsedKb / 1024).toFixed(0)} MB
        of {(stats.mem_total_kb / 1024).toFixed(0)} MB)
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

    {/* System summary */}
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
);

interface SystemStatsChartViewProps {
  stats: SysStats;
  history: HistoryPoint[];
  cpuPercent: number;
  memUsedKb: number;
  sysChartMetrics: {
    cpu: boolean;
    mem: boolean;
  };
  toggleSysChartMetric: (key: 'cpu' | 'mem') => void;
  sysChartCoreMetrics: boolean[];
  toggleSysChartCoreMetric: (index: number) => void;
  toggleAllSysChartCoreMetrics: () => void;
  allSysChartCoresEnabled: boolean;
  chartCoreListExpanded: boolean;
  toggleChartCoreListExpanded: () => void;
  sysChartCoreSeries: {
    data: (number | null)[];
    label: string;
    showMark: boolean;
    valueFormatter: (v: number | null) => string;
  }[];
  sysChartYAxis: {
    min: number;
  }[];
}

/* Overall system stats chart view */
export const SystemStatsChartView: React.FC<SystemStatsChartViewProps> = ({
  stats,
  history,
  cpuPercent,
  memUsedKb,
  sysChartMetrics,
  toggleSysChartMetric,
  sysChartCoreMetrics,
  toggleSysChartCoreMetric,
  toggleAllSysChartCoreMetrics,
  allSysChartCoresEnabled,
  chartCoreListExpanded,
  toggleChartCoreListExpanded,
  sysChartCoreSeries,
  sysChartYAxis
}) => (
  <>
    {/* Toggle system chart metrics */}
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
            border: sysChartMetrics.cpu ? '1px solid #fff' : undefined
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
            border: sysChartMetrics.mem ? '1px solid #fff' : undefined
          }}
        />
      </Tooltip>
    </Box>

    {/* CPU core info  */}
    {Array.isArray(stats.cpu_per_core) && stats.cpu_per_core.length > 0 && (
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
          {/* Show all cores button */}
          <CustomButton
            size="small"
            variant="outlined"
            onClick={toggleAllSysChartCoreMetrics}
            sx={{
              color: '#fff',
              borderColor: '#fff'
            }}
          >
            {allSysChartCoresEnabled ? 'Hide all cores' : 'Show all cores'}
          </CustomButton>
          {/* Expand or collapse CPU cores dropdown */}
          <CustomButton
            size="small"
            variant="outlined"
            onClick={toggleChartCoreListExpanded}
            sx={{
              color: '#fff',
              borderColor: '#fff'
            }}
          >
            {chartCoreListExpanded ? 'Collapse' : 'Expand'}
          </CustomButton>
        </Stack>

        {/* Per-core info dropdown */}
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

    {/* System stats chart using MUI X */}
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
);
