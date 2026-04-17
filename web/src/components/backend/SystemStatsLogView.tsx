/* SystemStatsLogView
 *
 * Displays live log lines streamed from the backend via the log_stream
 * WebSocket protocol. Lines are client-side filtered by a text input.
 */
import React, { useEffect, useRef } from 'react';
import { CustomButton } from '../CustomComponents';
/* MUI */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface SystemStatsLogViewProps {
  logLines: string[];
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
  const [filter, setFilter] = React.useState('');
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

  const filteredLines =
    filter.trim() === ''
      ? logLines
      : logLines.filter((line) =>
          line.toLowerCase().includes(filter.toLowerCase())
        );

  const getLineColor = (line: string): string => {
    const lower = line.toLowerCase();
    if (/\b(error|err|crit|critical|alert|emerg|fatal)\b/.test(lower)) {
      return '#ff6b6b';
    }
    if (/\b(warning|warn|notice)\b/.test(lower)) {
      return '#ffd93d';
    }
    return '#e8e8e8';
  };

  return (
    <Stack spacing={1}>
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
            <div key={i} style={{ color: getLineColor(line) }}>
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </Box>
    </Stack>
  );
};
