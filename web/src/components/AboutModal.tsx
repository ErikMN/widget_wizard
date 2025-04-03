import React from 'react';
import AppVersion from './AppVersion';
import logo from '../assets/img/widgy1.png';
import { useGlobalContext } from './GlobalContext';
import { useScreenSizes } from '../helpers/hooks.jsx';
import { CustomBox, CustomButton } from './CustomComponents';
/* MUI */
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import Modal from '@mui/material/Modal';
import MuiLink from '@mui/material/Link';
import Typography from '@mui/material/Typography';

import license from '../assets/etc/LICENSE?raw';

import github_logo from '../assets/img/github-mark.svg';
import github_logo_white from '../assets/img/github-mark-white.svg';

interface AboutModalProps {
  open: boolean;
  handleClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ open, handleClose }) => {
  /* Screen size */
  const { isMobile } = useScreenSizes();

  /* Global context */
  const { appSettings } = useGlobalContext();

  const theme = useTheme();
  const githubLogo =
    theme.palette.mode === 'dark' ? github_logo_white : github_logo;

  return (
    <Modal
      aria-labelledby="about-modal-title"
      aria-describedby="about-modal-description"
      open={open}
      onClose={handleClose}
      closeAfterTransition
    >
      <Fade in={open}>
        <Box
          sx={{
            p: 2,
            position: 'absolute',
            textAlign: 'center',
            top: isMobile ? 0 : '50%',
            left: isMobile ? 0 : '50%',
            transform: isMobile ? 'none' : 'translate(-50%, -50%)',
            width: isMobile
              ? '100%'
              : { xs: '90%', sm: '80%', md: '60%', lg: '50%', xl: '40%' },
            height: isMobile ? '100%' : 'auto',
            maxWidth: '800px',
            minWidth: '300px',
            bgcolor: 'background.paper',
            boxShadow: 24,
            borderRadius: isMobile ? 0 : 1,
            overflowY: isMobile ? 'auto' : 'unset'
          }}
        >
          <img
            src={logo}
            alt="Widgy logo"
            style={{
              width: isMobile ? '150px' : '300px',
              marginBottom: '10px'
            }}
          />
          <Typography id="about-modal-title" variant="h6" component="h2">
            About {import.meta.env.VITE_WEBSITE_NAME}
          </Typography>

          {/* Version info */}
          <Typography
            id="about-modal-description"
            sx={{ marginTop: 2, marginBottom: 2 }}
          >
            Version: {import.meta.env.VITE_VERSION}
            {appSettings.debug ? <AppVersion /> : <br />}
            Copyright © {new Date().getFullYear()} Widget Wizard
          </Typography>

          {/* GitHub link */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              mt: 2
            }}
          >
            <MuiLink
              href="https://github.com/ErikMN/widget_wizard"
              target="_blank"
              rel="noopener noreferrer"
              underline="none"
              aria-label="View widget_wizard source code on GitHub"
              sx={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                '& img': {
                  width: '50px',
                  height: '50px',
                  cursor: 'pointer'
                }
              }}
            >
              <img src={githubLogo} alt="GitHub logo" />
              <Typography variant="caption" sx={{ mt: 1 }}>
                View on GitHub
              </Typography>
            </MuiLink>
          </Box>

          {/* License box */}
          <Box>
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Typography variant="h6">License</Typography>
            </Box>
            {/* Scrollable license box */}
            <CustomBox
              sx={(theme) => ({
                maxHeight: '300px',
                overflowY: 'auto',
                border: `1px solid ${theme.palette.grey[600]}`,
                padding: 2,
                textAlign: 'left'
              })}
            >
              {/* Preserve newlines in license text */}
              <pre
                style={{
                  fontFamily: 'inherit',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word'
                }}
              >
                {license}
              </pre>
            </CustomBox>
          </Box>

          {/* Close button */}
          <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
            <CustomButton
              onClick={handleClose}
              sx={{ width: 'auto', paddingX: 3 }}
              variant="contained"
            >
              Close
            </CustomButton>
          </Box>
        </Box>
      </Fade>
    </Modal>
  );
};

export default AboutModal;
