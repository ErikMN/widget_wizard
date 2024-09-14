import React from 'react';
import AppVersion from './AppVersion';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fade from '@mui/material/Fade';
import Modal from '@mui/material/Modal';
import Typography from '@mui/material/Typography';

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
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 400,
            bgcolor: 'background.paper',
            boxShadow: 24,
            p: 4,
            borderRadius: 1
          }}
        >
          <Typography id="about-modal-title" variant="h6" component="h2">
            About {import.meta.env.VITE_WEBSITE_NAME}
          </Typography>
          <Typography id="about-modal-description" sx={{ mt: 2 }}>
            Version: {import.meta.env.VITE_VERSION}
            <AppVersion />
          </Typography>
          <Button onClick={handleClose} sx={{ mt: 2 }} variant="contained">
            Close
          </Button>
        </Box>
      </Fade>
    </Modal>
  );
};

export default AboutModal;
