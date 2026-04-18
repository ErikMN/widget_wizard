/* SystemStatsLogView
 *
 * Displays live log lines streamed from the backend via the log_stream
 * WebSocket protocol. Lines are client-side filtered by a text input and
 * per-severity toggle chips.
 */
import React, { useEffect, useState, useRef } from 'react';
import { CustomButton } from '../CustomComponents';
import { LogLine } from './systemStatsTypes';
/* MUI */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

/* Severity levels in display order. */
const LEVELS = ['error', 'warning', 'info', 'debug', 'auth'] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_COLOR: Record<Level, string> = {
  error: '#ff6b6b',
  warning: '#ffd93d',
  info: '#e8e8e8',
  debug: '#a0a0a0',
  auth: '#82cfff'
};

const LEVEL_LABEL: Record<Level, string> = {
  error: 'ERROR',
  warning: 'WARN',
  info: 'INFO',
  debug: 'DEBUG',
  auth: 'AUTH'
};

interface SystemStatsLogViewProps {
  logLines: LogLine[];
  logStreaming: boolean;
  startLogStream: () => void;
  stopLogStream: () => void;
  clearLogLines: () => void;
}

export const SystemStatsLogView: React.FC<SystemStatsLogViewProps> = ({
  logLines,
  logStreaming,
  startLogStream,
  stopLogStream,
  clearLogLines
}) => {
  /* Local state */
  const [showLogNotice, setShowLogNotice] = useState(true);
  const [filter, setFilter] = useState('');
  const [enabledLevels, setEnabledLevels] = useState<Set<Level>>(
    new Set(LEVELS)
  );

  /* Refs */
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  /* Scroll to bottom when new lines arrive, unless the user scrolled up */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      40;
    if (atBottom) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [logLines]);

  const toggleLevel = (level: Level) => {
    setEnabledLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const filteredLines = logLines.filter((line) => {
    if (!enabledLevels.has(line.level as Level)) {
      return false;
    }
    if (
      filter.trim() !== '' &&
      !line.text.toLowerCase().includes(filter.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const getLineColor = (level: string): string =>
    LEVEL_COLOR[level as Level] ?? '#e8e8e8';

  return (
    <Stack spacing={1}>
      {/* Log limits notice */}
      {showLogNotice && (
        <Alert
          severity="warning"
          onClose={() => setShowLogNotice(false)}
          slotProps={{
            closeButton: {
              disableRipple: true
            }
          }}
          sx={{
            backgroundColor: 'rgba(20,20,20,0.95)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.14)',
            '& .MuiAlert-icon': {
              color: '#ffd93d',
              opacity: 1
            },
            '& .MuiSvgIcon-root': {
              color: '#ffd93d'
            },
            '& .MuiAlert-message': {
              fontSize: '0.78rem',
              lineHeight: 1.45
            },
            '& .MuiAlert-action': {
              alignItems: 'center'
            },
            '& .MuiAlert-action .MuiIconButton-root': {
              color: '#fff'
            },
            '& .MuiAlert-action .MuiIconButton-root:hover': {
              backgroundColor: 'rgba(255,255,255,0.08)'
            }
          }}
        >
          This log view is for lightweight live troubleshooting only. It is NOT
          a complete or guaranteed audit log and must NOT be used for audit,
          forensics, or compliance purposes.
        </Alert>
      )}

      {/* Controls */}
      <Box
        sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <CustomButton
          size="small"
          variant={logStreaming ? 'contained' : 'outlined'}
          onClick={logStreaming ? stopLogStream : startLogStream}
          sx={{ color: '#fff', minWidth: 90 }}
        >
          {logStreaming ? 'Stop' : 'Stream'}
        </CustomButton>
        <CustomButton
          size="small"
          variant="outlined"
          onClick={clearLogLines}
          disabled={logLines.length === 0}
          sx={{ color: '#fff' }}
        >
          Clear
        </CustomButton>
        <TextField
          size="small"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          sx={{
            flex: 1,
            minWidth: 120,
            '& .MuiInputBase-input': { color: '#fff', fontSize: '0.8rem' },
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(255,255,255,0.3)'
            },
            '& .MuiInputBase-input::placeholder': {
              color: 'rgba(255,255,255,0.4)'
            }
          }}
          slotProps={{ input: { sx: { color: '#fff' } } }}
        />
        <Typography
          variant="caption"
          sx={{ opacity: 0.6, whiteSpace: 'nowrap' }}
        >
          {filteredLines.length}/{logLines.length} lines
        </Typography>
      </Box>

      {/* Severity chips */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {LEVELS.map((level) => {
          const active = enabledLevels.has(level);
          return (
            <Chip
              key={level}
              label={LEVEL_LABEL[level]}
              size="small"
              onClick={() => toggleLevel(level)}
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.68rem',
                height: 20,
                borderColor: LEVEL_COLOR[level],
                color: active ? LEVEL_COLOR[level] : 'rgba(255,255,255,0.25)',
                backgroundColor: active
                  ? `${LEVEL_COLOR[level]}1a`
                  : 'transparent',
                border: '1px solid',
                '& .MuiChip-label': { px: '6px' },
                cursor: 'pointer'
              }}
            />
          );
        })}
      </Box>

      {/* Log output */}
      <Box
        ref={containerRef}
        className="selectable-text"
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.72rem',
          lineHeight: 1.4,
          backgroundColor: 'rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 1,
          padding: '6px 8px',
          overflowY: 'auto',
          maxHeight: '45vh',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          color: '#e8e8e8',
          cursor: 'text'
        }}
      >
        {filteredLines.length === 0 ? (
          <Typography
            variant="caption"
            sx={{ opacity: 0.4, fontFamily: 'monospace' }}
          >
            {logStreaming
              ? 'Waiting for log lines…'
              : 'Press Stream to start receiving log lines.'}
          </Typography>
        ) : (
          filteredLines.map((line, i) => (
            <div key={i} style={{ color: getLineColor(line.level) }}>
              {line.text}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </Box>
    </Stack>
  );
};
