/**
 * LoadingScreen
 *
 * This component displays a loading screen while the application is
 * initializing. It checks the system readiness via systemready.cgi and waits
 * until the system is ready before rendering the main application component.
 */
import React, { useEffect, useState } from 'react';
import { useAppContext } from './AppContext';
import { useParameters } from './ParametersContext';
import { jsonRequest } from '../helpers/cgihelper';
import { crossGridPatternSx } from '../helpers/backgrounds';
import { useScreenSizes } from '../helpers/hooks.jsx';
import { lightTheme, darkTheme } from '../theme';
import { SR_CGI } from './constants';
/* MUI */
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Box, CircularProgress, Fade, Typography } from '@mui/material';

interface LoadingScreenProps {
  Component: React.ComponentType;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ Component }) => {
  /* Local state */
  const [appLoading, setAppLoading] = useState<boolean>(true);
  const [systemReady, setSystemReady] = useState<string>('no');
  const [statusMessage, setStatusMessage] = useState<string>('Initializing...');

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
      setStatusMessage('Checking system ready...');
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
          setStatusMessage('System not ready yet. Retrying...');
          retryTimer = window.setTimeout(
            fetchSystemReady,
            2000
          ); /* Wait before retrying */
        } else {
          setStatusMessage('System is ready. Starting application...');
          setSystemReady(systemReadyState);
          setAppLoading(false); /* Only stop loading when ready */
        }
      } catch (error) {
        console.error(error);
        setStatusMessage('Failed to check system status.');
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

  if (!appLoading && paramsInitialized && systemReady === 'yes') {
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
          <Typography variant="h6" sx={{ marginBottom: 2 }}>
            {import.meta.env.VITE_WEBSITE_NAME} is getting ready
          </Typography>
        </Fade>
        <Typography variant="body2" sx={{ marginBottom: 2 }}>
          {statusMessage}
        </Typography>
        <CircularProgress size={30} />
      </Box>
    </ThemeProvider>
  );
};

export default LoadingScreen;
