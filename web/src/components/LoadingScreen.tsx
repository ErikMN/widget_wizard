import React from 'react';
import { useGlobalContext } from './GlobalContext';
import { lightTheme, darkTheme } from '../theme';
/* MUI */
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Box, CircularProgress, Fade, Typography } from '@mui/material';

const LoadingScreen: React.FC = () => {
  /* Global context */
  const { currentTheme } = useGlobalContext();

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
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
        <CircularProgress size={50} />
      </Box>
    </ThemeProvider>
  );
};

export default LoadingScreen;
