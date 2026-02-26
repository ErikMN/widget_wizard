/**
 * useAppGreeting
 *
 * Shows a one-time greeting message when the app
 * is started for the very first time in this browser.
 */
import { useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { useOnScreenMessage } from '../components/OnScreenMessageContext';
import logo from '../assets/img/widgy1.png';

const FIRST_RUN_KEY = 'firstRunGreetingShown';
const GREETING_DURATION_MS = 10000;

export const useAppGreeting = () => {
  const { showMessage } = useOnScreenMessage();

  useEffect(() => {
    const storage = window.localStorage;
    const alreadyShown = storage.getItem(FIRST_RUN_KEY);
    if (alreadyShown) {
      return;
    }

    const websiteName =
      import.meta.env.VITE_WEBSITE_NAME?.trim() || 'Widget Wizard';

    showMessage({
      title: `Welcome to ${websiteName}!`,
      content: (
        <Box sx={{ textAlign: 'center', px: 1 }}>
          <Box
            component="img"
            src={logo}
            alt={`${websiteName} logo`}
            sx={{
              width: 112,
              height: 'auto',
              display: 'block',
              mx: 'auto',
              mb: 1.5,
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.22))'
            }}
          />
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Your widget Swiss Army knife is ready.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            We are glad to have you here.
          </Typography>
        </Box>
      ),
      duration: GREETING_DURATION_MS
    });

    storage.setItem(FIRST_RUN_KEY, 'true');
  }, [showMessage]);
};
