import React from 'react';
import { useGlobalContext } from '../GlobalContext';
import { lightTheme, darkTheme } from '../../theme';
/* MUI */
import Alert from '@mui/material/Alert';
import Fade from '@mui/material/Fade';
import Typography from '@mui/material/Typography';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { SxProps, Theme } from '@mui/material/styles';

interface OverlaysDisabledProps {
  /** Styles to override the default `sx` */
  sx?: SxProps<Theme>;
}

const OverlaysDisabled: React.FC<OverlaysDisabledProps> = ({ sx }) => {
  /* Global context */
  const { currentTheme } = useGlobalContext();

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
            ...sx // merge custom styles
          }}
        >
          <Typography>
            Overlays are not supported on this device, or the overlay backend is
            disabled.
          </Typography>
        </Alert>
      </Fade>
    </ThemeProvider>
  );
};

export default OverlaysDisabled;
