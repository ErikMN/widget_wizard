import React, { useEffect, useState, useRef } from 'react';
import { useWidgetContext } from './WidgetContext';
import { defaultAppSettings, AppSettings } from '../widgetInterfaces';
import { capitalizeFirstLetter } from '../helpers/utils';
import { CustomSwitch } from './CustomComponents';
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
  /* Local state */
  const [countdown, setCountdown] = useState<number | null>(null);

  /* Global context */
  const { appSettings, setAppSettings, handleOpenAlert, setOpenDropdownIndex } =
    useWidgetContext();

  /* Refs */
  const timerRef = useRef<number | null>(null);

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

  const handleToggleBboxAnchorIndicator = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxAnchorIndicator: !prevSettings.bboxAnchorIndicator
    }));
    handleOpenAlert(
      `Bounding Anchor Indicator: ${!appSettings.bboxAnchorIndicator}`,
      'success'
    );
  };

  const handleToggleBboxOnlyShowActive = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxOnlyShowActive: !prevSettings.bboxOnlyShowActive
    }));
    handleOpenAlert(
      `Only Show Active Widget BBox: ${!appSettings.bboxOnlyShowActive}`,
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
    /* Close all open widgets first */
    setOpenDropdownIndex(null);
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      sortAscending: !prevSettings.sortAscending
    }));
    handleOpenAlert(
      `Sort Order: ${!appSettings.sortAscending ? 'Descending' : 'Ascending'}`,
      'success'
    );
  };

  const handleToggleWSDefault = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      wsDefault: !prevSettings.wsDefault
    }));
    handleOpenAlert(`WebSocket Stream: ${!appSettings.wsDefault}`, 'success');
    /* Start the countdown */
    setCountdown(2);
  };

  useEffect(() => {
    if (countdown !== null && open) {
      if (countdown > 0) {
        timerRef.current = setTimeout(() => {
          setCountdown((prevCountdown) => (prevCountdown as number) - 1);
        }, 1000);
      } else {
        /* When countdown reaches zero, reload the page */
        window.location.reload();
      }
    } else {
      /* If countdown is null or modal is closed, clear any existing timer */
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    /* Cleanup function to clear timer if the component unmounts */
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [countdown, open]);

  /* Handle modal close and cancel countdown */
  const handleModalClose = () => {
    /* Reset the countdown */
    setCountdown(null);
    /* Call handleClose callback */
    handleClose();
  };

  /* Handle reset to default settings */
  const handleResetDefaults = () => {
    setAppSettings(defaultAppSettings);
    handleOpenAlert('Settings have been reset to default values', 'success');
  };

  /****************************************************************************/

  return (
    <Modal
      aria-labelledby="settings-modal-title"
      aria-describedby="settings-modal-description"
      open={open}
      onClose={handleModalClose}
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
            width: {
              xs: '90%',
              sm: '80%',
              md: '70%',
              lg: '60%',
              xl: '50%'
            },
            maxWidth: '650px',
            minWidth: '300px',
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
            <Typography variant="subtitle1" sx={{ marginBottom: 1 }}>
              Bounding Box Settings
            </Typography>

            {/* Switch for rounded bounding box corners */}
            <FormControlLabel
              control={
                <CustomSwitch
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
                <CustomSwitch
                  checked={appSettings.bboxLabel}
                  onChange={handleToggleBboxLabel}
                  name="bboxLabel"
                />
              }
              label="Show Bounding Box Info Label"
            />

            {/* Switch for bounding anchor indicator */}
            <FormControlLabel
              control={
                <CustomSwitch
                  checked={appSettings.bboxAnchorIndicator}
                  onChange={handleToggleBboxAnchorIndicator}
                  name="bboxAnchorIndicator"
                />
              }
              label="Show Bounding Box Anchor Indicator"
            />

            {/* Switch for only showing active bbox */}
            <FormControlLabel
              control={
                <CustomSwitch
                  checked={appSettings.bboxOnlyShowActive}
                  onChange={handleToggleBboxOnlyShowActive}
                  name="bboxOnlyShowActive"
                />
              }
              label="Only Show Bounding Box For Active Widget"
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
                <InputLabel id="bbox-color-label" sx={{ top: '-4px' }}>
                  Bounding Box Color
                </InputLabel>
                <Select
                  labelId="bbox-color-label"
                  value={currentColor}
                  label="Bounding Box Color"
                  onChange={handleColorChange}
                  sx={{
                    height: '40px',
                    '& .MuiOutlinedInput-root': {
                      height: '100%'
                    }
                  }}
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
                <InputLabel id="bbox-thickness-label" sx={{ top: '-4px' }}>
                  Bounding Box Thickness
                </InputLabel>
                <Select
                  labelId="bbox-thickness-label"
                  value={currentThickness}
                  label="Bounding Box Thickness"
                  onChange={handleThicknessChange}
                  sx={{
                    height: '40px',
                    '& .MuiOutlinedInput-root': {
                      height: '100%'
                    }
                  }}
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
            <Typography variant="subtitle1" sx={{ marginBottom: 1 }}>
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
                <InputLabel id="sort-by-label" sx={{ top: '-4px' }}>
                  Sort Widgets By
                </InputLabel>
                <Select
                  labelId="sort-by-label"
                  value={appSettings.sortBy}
                  label="Sort Widgets By"
                  onChange={handleSortChange}
                  sx={{
                    height: '40px',
                    '& .MuiOutlinedInput-root': {
                      height: '100%'
                    }
                  }}
                >
                  <MenuItem value="id">ID</MenuItem>
                  <MenuItem value="type">Type</MenuItem>
                </Select>
              </FormControl>
              {/* Toggle for sorting ascending/descending */}
              <FormControlLabel
                control={
                  <CustomSwitch
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

          {/* Misc. settings */}
          <Box
            sx={(theme) => ({
              border: `1px solid ${theme.palette.grey[600]}`,
              padding: 2,
              borderRadius: 1,
              marginBottom: 2,
              textAlign: 'left'
            })}
          >
            <Typography variant="subtitle1" sx={{ marginBottom: 1 }}>
              Misc. Settings
            </Typography>

            {/* Switch for using WS stream as default */}
            <FormControlLabel
              control={
                <CustomSwitch
                  checked={appSettings.wsDefault}
                  onChange={handleToggleWSDefault}
                  name="wsDefault"
                />
              }
              label="Use WebSocket stream by default (faster, but may be less reliable)"
            />
          </Box>

          {/* Display the countdown if it's active */}
          {countdown !== null && (
            <Typography
              variant="subtitle1"
              sx={{ marginTop: 1, textAlign: 'center', color: 'red' }}
            >
              Reloading application in {countdown}...
            </Typography>
          )}

          {/* Switch to enable debug mode */}
          <FormControlLabel
            control={
              <CustomSwitch
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

          {/* Close and Reset Defaults buttons */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 4
            }}
          >
            <Button onClick={handleResetDefaults} variant="outlined">
              Reset Defaults
            </Button>
            <Button onClick={handleModalClose} variant="contained">
              Close
            </Button>
          </Box>
        </Box>
      </Fade>
    </Modal>
  );
};

export default SettingsModal;
