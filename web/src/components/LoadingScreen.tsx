/**
 * LoadingScreen
 *
 * This component displays a loading screen while the application is
 * initializing. It checks the system readiness via systemready.cgi and waits
 * until the system is ready before rendering the main application component.
 */
import React, { useEffect, useState } from 'react';
import Logo from './Logo';
import { useAppContext } from './AppContext';
import { useParameters } from './ParametersContext';
import { jsonRequest } from '../helpers/cgihelper';
import { crossGridPatternSx } from '../helpers/backgrounds';
import { useScreenSizes } from '../helpers/hooks.jsx';
import { lightTheme, darkTheme } from '../theme';
import { SR_CGI } from './constants';
/* MUI */
import { ThemeProvider, CssBaseline } from '@mui/material';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Fade from '@mui/material/Fade';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Typography from '@mui/material/Typography';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

interface LoadingScreenProps {
  Component: React.ComponentType;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ Component }) => {
  /* Local state */
  const [appLoading, setAppLoading] = useState<boolean>(true);
  const [systemReady, setSystemReady] = useState<string>('no');
  const [status, setStatus] = useState<{
    message: string;
    severity: 'info' | 'error';
  }>({
    message: 'Initializing...',
    severity: 'info'
  });

  /* Global context */
  const { currentTheme } = useAppContext();
  const { paramsInitialized } = useParameters();

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  /* Screen size */
  const { isMobile } = useScreenSizes();

  /* On app mount */
  useEffect(() => {
    let retryTimer: number | null = null;
    /* Check system state */
    const fetchSystemReady = async () => {
      setAppLoading(true);
      setStatus({
        message: 'Checking system ready...',
        severity: 'info'
      });
      const payload = {
        apiVersion: '1.0',
        method: 'systemready',
        params: {
          timeout: 10
        }
      };
      try {
        const resp = await jsonRequest(SR_CGI, payload);
        const systemReadyState = resp.data.systemready;
        /* If the system is not ready, wait a couple of seconds and retry */
        if (systemReadyState !== 'yes') {
          setStatus({
            message: 'System not ready yet. Retrying...',
            severity: 'info'
          });
          retryTimer = window.setTimeout(
            fetchSystemReady,
            2000
          ); /* Wait before retrying */
        } else {
          setStatus({
            message: 'System is ready. Starting application...',
            severity: 'info'
          });
          setSystemReady(systemReadyState);
        }
      } catch (error) {
        console.error(error);
        setStatus({
          message: 'Failed to check system status.',
          severity: 'error'
        });
        setAppLoading(false);
        /* We don't continue from here */
      }
    };
    fetchSystemReady();

    return () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
      }
    };
  }, []);

  if (paramsInitialized && systemReady === 'yes') {
    return <Component />;
  }

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          ...(isMobile ? {} : crossGridPatternSx(theme)),
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          width: '100%'
        }}
      >
        <CssBaseline />
        <Fade in={true} timeout={1000} mountOnEnter unmountOnExit>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <Logo style={{ height: '60px' }} />
            <Typography variant="h6" sx={{ marginBottom: 1 }}>
              {import.meta.env.VITE_WEBSITE_NAME} is getting ready
            </Typography>
          </div>
        </Fade>
        <Chip
          icon={
            status.severity === 'error' ? (
              <WarningAmberOutlinedIcon />
            ) : (
              <InfoOutlinedIcon />
            )
          }
          label={status.message}
          variant="outlined"
          sx={{ marginBottom: 2 }}
        />
        {appLoading && <CircularProgress size={30} />}
      </Box>
    </ThemeProvider>
  );
};

export default LoadingScreen;
