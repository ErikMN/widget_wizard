import React, { useEffect, useRef, useState } from 'react';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fade from '@mui/material/Fade';
import Modal from '@mui/material/Modal';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import Typography from '@mui/material/Typography';

const TIMEOUT = 2000;

/* WebSocket endpoint */
const wsPort = 9001;
const wsAddress =
  import.meta.env.MODE === 'development'
    ? `ws://${import.meta.env.VITE_TARGET_IP}:${wsPort}`
    : `ws://${window.location.hostname}:${wsPort}`;

interface MonitorModalProps {
  open: boolean;
  handleClose: () => void;
}

const MonitorModal: React.FC<MonitorModalProps> = ({ open, handleClose }) => {
  /* Local states */
  const [connectionError, setConnectionError] = useState<string>('');
  const [isRunning, setRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  /* Refs */
  const socketRef = useRef<WebSocket | null>(null);
  const shouldReconnectRef = useRef<boolean>(false);

  /* WebSocket setup */
  useEffect(() => {
    const connectWebSocket = () => {
      if (!shouldReconnectRef.current) {
        return;
      }

      socketRef.current = new WebSocket(wsAddress);

      /* WS onopen */
      socketRef.current.onopen = () => {
        setConnectionError('');
        setRunning(true);
      };

      /* WS onmessage */
      socketRef.current.onmessage = (event) => {
        setLogs((prevLogs) => [...prevLogs, event.data]);
      };

      /* WS onclose */
      socketRef.current.onclose = () => {
        setRunning(false);
        setConnectionError('WebSocket connection closed. Reconnecting...');
        if (shouldReconnectRef.current) {
          setTimeout(connectWebSocket, TIMEOUT);
        }
      };

      /* WS onerror */
      socketRef.current.onerror = () => {
        setConnectionError(`Error: Could not establish WebSocket connection.`);
        setRunning(false);
      };
    };

    /* Check protocol for HTTPS */
    const protocol = window.location.protocol;
    if (protocol !== 'https:' && open) {
      shouldReconnectRef.current = true;
      connectWebSocket();
    }

    return () => {
      /* Cleanup when modal closes */
      shouldReconnectRef.current = false;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [open]);

  /* Scroll to bottom of the logs when new log is added */
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <Modal
      aria-labelledby="monitor-modal-title"
      aria-describedby="monitor-modal-description"
      open={open}
      onClose={handleClose}
      closeAfterTransition
    >
      <Fade in={open}>
        <Box
          sx={{
            position: 'absolute',
            textAlign: 'center',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 800,
            bgcolor: 'background.paper',
            boxShadow: 24,
            p: 4,
            borderRadius: 1
          }}
        >
          {/* Monitor Title */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              marginBottom: 2
            }}
          >
            <MonitorHeartIcon sx={{ marginRight: 1 }} />
            <Typography id="monitor-modal-title" variant="h6" component="h2">
              System Monitor
            </Typography>
          </Box>

          {/* WebSocket Status */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 1
            }}
          >
            <Typography
              variant="body1"
              sx={{ textAlign: 'left' }}
              color={isRunning ? 'success.main' : 'error.main'}
            >
              {isRunning
                ? 'Connected to WebSocket'
                : 'Disconnected from WebSocket'}
            </Typography>
            <Typography
              variant="body1"
              color={isRunning ? 'success.main' : 'error.main'}
            >
              {connectionError}
            </Typography>
          </Box>

          {/* Logs box */}
          <Box
            sx={(theme) => ({
              height: 400,
              overflowY: 'auto',
              borderRadius: 1,
              border: `1px solid ${theme.palette.grey[600]}`,
              padding: 2,
              textAlign: 'left',
              fontFamily: 'Monaco, Menlo, "Courier New", monospace'
            })}
          >
            {logs.map((log, index) => (
              <pre
                key={index}
                style={{
                  fontFamily: 'inherit',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word'
                }}
              >
                {log}
              </pre>
            ))}
            <div ref={logsEndRef} />
          </Box>

          {/* Close button */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: 2
            }}
          >
            <Button onClick={handleClose} variant="contained">
              Close
            </Button>
          </Box>
        </Box>
      </Fade>
    </Modal>
  );
};

export default MonitorModal;
