import React from 'react';
import AppVersion from './AppVersion';
import logo from '../assets/img/widgy1.png';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fade from '@mui/material/Fade';
import Modal from '@mui/material/Modal';
import Typography from '@mui/material/Typography';

import license from '../assets/etc/LICENSE?raw';

interface AboutModalProps {
  open: boolean;
  handleClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ open, handleClose }) => {
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
          <img
            src={logo}
            alt="Widgy logo"
            style={{ width: '300px', marginBottom: '10px' }}
          />
          <Typography id="about-modal-title" variant="h6" component="h2">
            About {import.meta.env.VITE_WEBSITE_NAME}
          </Typography>
          <Typography
            id="about-modal-description"
            sx={{ mt: 2, marginBottom: 2 }}
          >
            Version: {import.meta.env.VITE_VERSION}
            <AppVersion />
            Copyright © {new Date().getFullYear()}
          </Typography>

          {/* License box */}
          <Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6">License</Typography>
            </Box>
            {/* Scrollable license box */}
            <Box
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
            </Box>
          </Box>

          <Button onClick={handleClose} sx={{ mt: 2 }} variant="contained">
            Close
          </Button>
        </Box>
      </Fade>
    </Modal>
  );
};

export default AboutModal;
