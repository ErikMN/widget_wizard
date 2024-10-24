import React from 'react';
import { useWidgetContext } from './WidgetContext';
import { AppSettings } from '../widgetInterfaces';
import { capitalizeFirstLetter } from '../helpers/utils';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fade from '@mui/material/Fade';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Modal from '@mui/material/Modal';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import SettingsIcon from '@mui/icons-material/Settings';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';

interface SettingsModalProps {
  open: boolean;
  handleClose: () => void;
}

const availableColors = ['yellow', 'blue', 'red', 'green', 'purple', 'none'];
const availableThicknesses: Array<'small' | 'medium' | 'large'> = [
  'small',
  'medium',
  'large'
];

const SettingsModal: React.FC<SettingsModalProps> = ({ open, handleClose }) => {
  /* Global context */
  const { appSettings, setAppSettings, handleOpenAlert, setOpenDropdownIndex } =
    useWidgetContext();

  /****************************************************************************/

  /* Settings handlers */
  const handleDebugMode = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      debug: !prevSettings.debug
    }));
    handleOpenAlert(`Debug mode: ${!appSettings.debug}`, 'success');
  };

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

  const handleToggleBboxLabel = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxLabel: !prevSettings.bboxLabel
    }));
    handleOpenAlert(`Bounding Box Label: ${!appSettings.bboxLabel}`, 'success');
  };

  const handleColorChange = (event: SelectChangeEvent<string>) => {
    const selectedColor = event.target.value as string;
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxColor: selectedColor
    }));
    handleOpenAlert(`Bounding Box Color: ${selectedColor}`, 'success');
  };

  const handleThicknessChange = (
    event: SelectChangeEvent<'small' | 'medium' | 'large'>
  ) => {
    const selectedThickness = event.target.value as
      | 'small'
      | 'medium'
      | 'large';
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxThickness: selectedThickness
    }));
    handleOpenAlert(`Bounding Box Thickness: ${selectedThickness}`, 'success');
  };

  /* Ensure the bboxColor is valid, default to 'yellow' if it's not */
  const currentColor = availableColors.includes(appSettings.bboxColor)
    ? appSettings.bboxColor
    : 'yellow';

  /* Ensure the bboxThickness is valid, default to 'medium' if it's not */
  const currentThickness = availableThicknesses.includes(
    appSettings.bboxThickness
  )
    ? appSettings.bboxThickness
    : 'medium';

  /* If invalid color, reset to yellow */
  if (appSettings.bboxColor !== currentColor) {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxColor: 'yellow'
    }));
  }

  /* If invalid thickness, reset to medium */
  if (appSettings.bboxThickness !== currentThickness) {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxThickness: 'medium'
    }));
  }

  const handleSortChange = (event: SelectChangeEvent<string>) => {
    /* Close all open widgets first */
    setOpenDropdownIndex(null);
    const selectedSort = event.target.value as 'id' | 'type';
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      sortBy: selectedSort
    }));
    handleOpenAlert(
      `Sort By: ${capitalizeFirstLetter(selectedSort)}`,
      'success'
    );
  };

  const handleToggleSortOrder = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      sortAscending: !prevSettings.sortAscending
    }));
    handleOpenAlert(
      `Sort Order: ${!appSettings.sortAscending ? 'Descending' : 'Ascending'}`,
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

          {/* Bounding Box settings */}
          <Box
            sx={(theme) => ({
              border: `1px solid ${theme.palette.grey[600]}`,
              padding: 2,
              borderRadius: 1,
              marginBottom: 2,
              textAlign: 'left'
            })}
          >
            <Typography variant="subtitle1" sx={{ marginBottom: 2 }}>
              Bounding Box Settings
            </Typography>

            {/* Switch for rounded bounding box corners */}
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

            {/* Switch for bounding box label */}
            <FormControlLabel
              control={
                <Switch
                  checked={appSettings.bboxLabel}
                  onChange={handleToggleBboxLabel}
                  name="bboxLabel"
                />
              }
              label="Show Bounding Box Info Label"
            />

            <Box
              sx={{
                display: 'flex',
                gap: 2,
                justifyContent: 'space-between'
              }}
            >
              {/* Select bounding box color */}
              <FormControl sx={{ marginTop: 2, width: '50%' }}>
                <InputLabel id="bbox-color-label">
                  Bounding Box Color
                </InputLabel>
                <Select
                  labelId="bbox-color-label"
                  value={currentColor}
                  label="Bounding Box Color"
                  onChange={handleColorChange}
                >
                  {availableColors.map((color) => (
                    <MenuItem key={color} value={color}>
                      {capitalizeFirstLetter(color)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Select bounding box thickness */}
              <FormControl sx={{ marginTop: 2, width: '50%' }}>
                <InputLabel id="bbox-thickness-label">
                  Bounding Box Thickness
                </InputLabel>
                <Select
                  labelId="bbox-thickness-label"
                  value={currentThickness}
                  label="Bounding Box Thickness"
                  onChange={handleThicknessChange}
                >
                  {availableThicknesses.map((thickness) => (
                    <MenuItem key={thickness} value={thickness}>
                      {capitalizeFirstLetter(thickness)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Box>

          {/* Widget settings */}
          <Box
            sx={(theme) => ({
              border: `1px solid ${theme.palette.grey[600]}`,
              padding: 2,
              borderRadius: 1,
              marginBottom: 2,
              textAlign: 'left'
            })}
          >
            <Typography variant="subtitle1" sx={{ marginBottom: 2 }}>
              Widget Settings
            </Typography>

            {/* Widget sorting */}
            <Box
              sx={{
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2
              }}
            >
              <FormControl sx={{ width: '40%' }}>
                <InputLabel id="sort-by-label">Sort Widgets By</InputLabel>
                <Select
                  labelId="sort-by-label"
                  value={appSettings.sortBy}
                  label="Sort Widgets By"
                  onChange={handleSortChange}
                >
                  <MenuItem value="id">ID</MenuItem>
                  <MenuItem value="type">Type</MenuItem>
                </Select>
              </FormControl>
              {/* Toggle for sorting ascending/descending */}
              <FormControlLabel
                control={
                  <Switch
                    checked={appSettings.sortAscending}
                    onChange={handleToggleSortOrder}
                    name="sortAscending"
                  />
                }
                label="Sort in Ascending Order"
                sx={{ marginLeft: 2 }}
              />
            </Box>
          </Box>
          {/* Switch to enable debug mode */}
          <FormControlLabel
            control={
              <Switch
                checked={appSettings.debug}
                onChange={handleDebugMode}
                name="debugMode"
              />
            }
            label={
              <span style={{ display: 'flex', alignItems: 'center' }}>
                Enable debug mode
                <ScienceOutlinedIcon style={{ marginLeft: '4px' }} />
              </span>
            }
          />

          {/* Close button */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: 4
            }}
          >
            <Button
              onClick={handleClose}
              sx={{ marginTop: 2 }}
              variant="contained"
            >
              Close
            </Button>
          </Box>
        </Box>
      </Fade>
    </Modal>
  );
};

export default SettingsModal;
