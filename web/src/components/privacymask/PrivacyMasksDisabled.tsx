import React from 'react';
import { useThemeContext } from '../context/AppContext';
import { lightTheme, darkTheme } from '../../theme';
/* MUI */
import Alert from '@mui/material/Alert';
import Fade from '@mui/material/Fade';
import Typography from '@mui/material/Typography';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { SxProps, Theme } from '@mui/material/styles';

interface PrivacyMasksDisabledProps {
  /* Styles to override the default sx */
  sx?: SxProps<Theme>;
}

const PrivacyMasksDisabled: React.FC<PrivacyMasksDisabledProps> = ({ sx }) => {
  /* Global context */
  const { currentTheme } = useThemeContext();

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Fade in={true} timeout={1000} mountOnEnter unmountOnExit>
        <Alert
          severity="warning"
          sx={{
            marginTop: 2,
            marginLeft: 1,
            marginRight: 1,
            alignItems: 'center',
            ...sx
          }}
        >
          <Typography>
            Privacy masks are not supported on this device or for the selected
            channel.
          </Typography>
        </Alert>
      </Fade>
    </ThemeProvider>
  );
};

export default PrivacyMasksDisabled;
