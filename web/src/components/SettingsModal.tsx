import React from 'react';
import { useWidgetContext } from './WidgetContext';
import { AppSettings, defaultAppSettings } from '../widgetInterfaces';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fade from '@mui/material/Fade';
import FormControlLabel from '@mui/material/FormControlLabel';
import Modal from '@mui/material/Modal';
import SettingsIcon from '@mui/icons-material/Settings';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';

interface SettingsModalProps {
  open: boolean;
  handleClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, handleClose }) => {
  /* Global context */
  const { appSettings, setAppSettings, handleOpenAlert } = useWidgetContext();

  /****************************************************************************/

  /* Settings handlers */
  const handleToggleRoundedCorners = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      roundedBboxCorners: !prevSettings.roundedBboxCorners
    }));
    handleOpenAlert(
      `Rounded Bounding Box Corners: ${!appSettings.roundedBboxCorners}`,
      'success'
    );
  };

  /****************************************************************************/

  return (
    <Modal
      aria-labelledby="settings-modal-title"
      aria-describedby="settings-modal-description"
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
            width: 600,
            bgcolor: 'background.paper',
            boxShadow: 24,
            p: 4,
            borderRadius: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: 'auto'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              marginBottom: 2
            }}
          >
            <SettingsIcon sx={{ marginRight: 1 }} />
            <Typography id="settings-modal-title" variant="h6" component="h2">
              Application Settings
            </Typography>
          </Box>

          {/* Switch roundedBboxCorners */}
          <FormControlLabel
            control={
              <Switch
                checked={appSettings.roundedBboxCorners}
                onChange={handleToggleRoundedCorners}
                name="roundedBboxCorners"
              />
            }
            label="Rounded Bounding Box Corners"
          />

          {/* Close button */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              mt: 4
            }}
          >
            <Button onClick={handleClose} sx={{ mt: 2 }} variant="contained">
              Close
            </Button>
          </Box>
        </Box>
      </Fade>
    </Modal>
  );
};

export default SettingsModal;
