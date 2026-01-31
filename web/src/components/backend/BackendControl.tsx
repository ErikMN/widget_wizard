/* BackendControl
 * Start or stop the ACAP backend and fetch application logs.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { CustomSwitch, CustomButton } from '../CustomComponents';
/* MUI */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

/* Constants */
const APP_NAME = import.meta.env.VITE_NAME;
const CONTROL_CGI = '/axis-cgi/applications/control.cgi';
const LIST_CGI = '/axis-cgi/applications/list.cgi';
const LOG_CGI = '/axis-cgi/admin/systemlog.cgi';

type BackendState = 'running' | 'stopped' | 'unknown';

const BackendControl: React.FC = () => {
  /* Global app context */
  const { handleOpenAlert, appSettings, setAppSettings } = useAppContext();

  /* Local state */
  const [backendState, setBackendState] = useState<BackendState>('unknown');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [logText, setLogText] = useState<string>('');
  const [isProbing, setIsProbing] = useState<boolean>(true);
  const [wsAddressDraft, setWsAddressDraft] = useState<string>('');
  const [wsPortDraft, setWsPortDraft] = useState<string>('');

  useEffect(() => {
    /* Sync local draft address from active application settings */
    setWsAddressDraft(appSettings.wsAddress ?? '');
    /* Sync local draft port from active application settings */
    setWsPortDraft(
      typeof appSettings.wsPort === 'number' ? String(appSettings.wsPort) : ''
    );
  }, [appSettings.wsAddress, appSettings.wsPort]);

  /* Probe backend state on mount */
  useEffect(() => {
    const probeBackendState = async () => {
      setIsProbing(true);

      try {
        const resp = await fetch(LIST_CGI, {
          method: 'GET'
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        /* Parse XML response */
        const xmlText = await resp.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

        const applications = Array.from(
          xmlDoc.getElementsByTagName('application')
        );

        const app = applications.find(
          (el) => el.getAttribute('Name') === APP_NAME
        );

        if (!app) {
          setBackendState('stopped');
          return;
        }

        const status = app.getAttribute('Status');

        if (status === 'Running') {
          setBackendState('running');
        } else {
          setBackendState('stopped');
        }
      } catch (err) {
        /* Do not block UI if probing fails */
        setBackendState('unknown');
      } finally {
        setIsProbing(false);
      }
    };

    probeBackendState();
  }, []);

  /* Start or stop backend application */
  const controlBackend = useCallback(
    async (action: 'start' | 'stop') => {
      setIsLoading(true);
      setError(null);

      const url = `${CONTROL_CGI}?action=${action}&package=${APP_NAME}`;

      try {
        const resp = await fetch(url, {
          method: 'GET'
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const text = await resp.text();

        /* NOTE: Returns "OK" on success */
        if (text.trim() !== 'OK') {
          throw new Error(`Unexpected response: ${text}`);
        }
        const newState: BackendState =
          action === 'start' ? 'running' : 'stopped';

        setBackendState(newState);
        handleOpenAlert(
          `Backend ${action === 'start' ? 'started' : 'stopped'}`,
          'success'
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Backend control failed');
      } finally {
        setIsLoading(false);
      }
    },
    [handleOpenAlert]
  );

  /* Fetch backend application log */
  const fetchLog = useCallback(async () => {
    setError(null);

    const url = `${LOG_CGI}?appname=${APP_NAME}`;

    try {
      const resp = await fetch(url, {
        method: 'GET'
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const text = await resp.text();
      setLogText(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch log');
    }
  }, []);

  /* Clear backend application log */
  const clearLog = useCallback(() => {
    setLogText('');
  }, []);

  /* Toggle handler for CustomSwitch */
  const handleToggleBackend = () => {
    if (backendState === 'running') {
      controlBackend('stop');
    } else {
      controlBackend('start');
    }
  };

  const applyWsSettings = () => {
    /* Resolve the next WebSocket address: empty input means use default */
    const nextAddress =
      wsAddressDraft.trim() === '' ? undefined : wsAddressDraft.trim();

    /* Resolve the next WebSocket port: empty input means use default */
    const nextPort =
      wsPortDraft.trim() === '' ? undefined : Number(wsPortDraft);

    /* Validate port number */
    if (
      nextPort !== undefined &&
      (!Number.isInteger(nextPort) || nextPort <= 0)
    ) {
      setError('Invalid WebSocket port');
      return;
    }
    /* Apply the settings as the active WebSocket configuration */
    setAppSettings((prev) => ({
      ...prev,
      wsAddress: nextAddress,
      wsPort: nextPort
    }));
    handleOpenAlert('WebSocket settings applied', 'success');
  };

  const clearWsSettings = () => {
    /* Reset drafts to defaults (empty means use default) */
    setWsAddressDraft('');
    setWsPortDraft('');
    /* Apply defaults to active settings */
    setAppSettings((prev) => ({
      ...prev,
      wsAddress: undefined,
      wsPort: undefined
    }));
    handleOpenAlert('WebSocket settings cleared', 'success');
  };

  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        border: `1px solid ${theme.palette.grey[600]}`,
        padding: 2,
        borderRadius: 1,
        marginBottom: 2,
        textAlign: 'left'
      })}
    >
      {/* Probing overlay */}
      {isProbing && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 1
          }}
        >
          <CircularProgress />
        </Box>
      )}

      {/* Content */}
      <Box sx={{ opacity: isProbing ? 0.5 : 1 }}>
        <Typography variant="subtitle1" sx={{ marginBottom: 1 }}>
          Backend control
        </Typography>

        {error && (
          <Alert severity="error" variant="outlined" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        <FormControlLabel
          control={
            <CustomSwitch
              checked={backendState === 'running'}
              onChange={handleToggleBackend}
              disabled={isLoading || backendState === 'unknown' || isProbing}
              name="backendRunning"
            />
          }
          label={
            backendState === 'unknown'
              ? 'Backend state unknown'
              : backendState === 'running'
                ? 'Backend running'
                : 'Backend stopped'
          }
        />

        <Box sx={{ marginTop: 1, marginBottom: 1, display: 'flex', gap: 1 }}>
          <CustomButton
            variant="outlined"
            disabled={isLoading || isProbing}
            onClick={fetchLog}
          >
            Refresh backend log
          </CustomButton>

          <CustomButton
            variant="outlined"
            disabled={isLoading || isProbing || !logText}
            onClick={clearLog}
            sx={{
              color: 'error.main',
              borderColor: 'error.main',
              '&:hover': {
                borderColor: 'error.dark'
              }
            }}
          >
            Clear logs
          </CustomButton>
        </Box>

        {logText && (
          <Box
            sx={(theme) => ({
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              fontSize: '12px',
              backgroundColor: theme.palette.background.default,
              color: theme.palette.text.primary,
              padding: '8px',
              border: `1px solid ${theme.palette.divider}`,
              maxHeight: '300px',
              overflowY: 'auto'
            })}
          >
            {logText}
          </Box>
        )}

        <Box
          sx={{
            marginTop: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1
          }}
        >
          <Typography variant="subtitle2">
            System monitor WebSocket settings
          </Typography>

          <TextField
            size="small"
            label="Address"
            value={wsAddressDraft}
            placeholder={
              import.meta.env.MODE === 'development'
                ? import.meta.env.VITE_TARGET_IP
                : window.location.hostname
            }
            onChange={(e) => setWsAddressDraft(e.target.value)}
          />

          <TextField
            size="small"
            label="Port"
            type="number"
            value={wsPortDraft}
            placeholder="9000"
            onChange={(e) => setWsPortDraft(e.target.value)}
          />

          <Box sx={{ display: 'flex', gap: 1, marginTop: 1 }}>
            <CustomButton variant="outlined" onClick={applyWsSettings}>
              Apply
            </CustomButton>
            <CustomButton
              variant="outlined"
              onClick={clearWsSettings}
              sx={{
                color: 'error.main',
                borderColor: 'error.main',
                '&:hover': {
                  borderColor: 'error.dark'
                }
              }}
            >
              Reset to default
            </CustomButton>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default BackendControl;
