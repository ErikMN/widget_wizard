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

  /* Global context */
  const { currentTheme, handleOpenAlert } = useAppContext();
  const { paramsLoading } = useParameters();

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  /* Screen size */
  const { isMobile } = useScreenSizes();

  /* App mount calls */
  useEffect(() => {
    /* Check system state */
    const fetchSystemReady = async () => {
      setAppLoading(true);
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
          setTimeout(() => {
            fetchSystemReady();
          }, 2000); /* Wait before retrying */
        } else {
          setSystemReady(systemReadyState);
        }
      } catch (error) {
        console.error(error);
        handleOpenAlert('Failed to check system status', 'error');
      } finally {
        setAppLoading(false);
      }
    };
    fetchSystemReady();
  }, []);

  if (!appLoading && !paramsLoading && systemReady === 'yes') {
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
        <CircularProgress size={30} />
      </Box>
    </ThemeProvider>
  );
};

export default LoadingScreen;
