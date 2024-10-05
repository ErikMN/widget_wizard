import React from 'react';
import { useWidgetContext } from './WidgetContext';
import { AppSettings, defaultAppSettings } from '../widgetInterfaces';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fade from '@mui/material/Fade';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Modal from '@mui/material/Modal';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import SettingsIcon from '@mui/icons-material/Settings';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';

interface SettingsModalProps {
  open: boolean;
  handleClose: () => void;
}

const availableColors = ['yellow', 'blue', 'red', 'green', 'purple'];

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

  const handleColorChange = (event: SelectChangeEvent<string>) => {
    const selectedColor = event.target.value as string;
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxColor: selectedColor
    }));
    handleOpenAlert(`Bounding Box Color: ${selectedColor}`, 'success');
  };

  /* Ensure the bboxColor is valid, default to 'yellow' if it's not */
  const currentColor = availableColors.includes(appSettings.bboxColor)
    ? appSettings.bboxColor
    : 'yellow';

  /* If invalid color, reset to yellow */
  if (appSettings.bboxColor !== currentColor) {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxColor: 'yellow'
    }));
  }

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

          {/* Select bounding box color */}
          <FormControl sx={{ mt: 2, width: '50%' }}>
            <InputLabel id="bbox-color-label">Bounding Box Color</InputLabel>
            <Select
              labelId="bbox-color-label"
              value={currentColor}
              label="Bounding Box Color"
              onChange={handleColorChange}
            >
              {availableColors.map((color) => (
                <MenuItem key={color} value={color}>
                  {color}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

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
