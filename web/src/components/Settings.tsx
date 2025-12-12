/**
 * Settings
 *
 * Application settings are controlled from here by using various app context.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { lightTheme, darkTheme } from '../theme';
import { useAppContext } from './AppContext';
import { defaultAppSettings, AppSettings } from './appInterface';
import { capitalizeFirstLetter } from '../helpers/utils';
import { P_CGI } from './constants';
import {
  CustomSwitch,
  CustomButton,
  CustomStyledIconButton,
  CustomContainer
} from './CustomComponents';
import { useScreenSizes } from '../helpers/hooks.jsx';
import VideoPlayer from './VideoPlayer';
import AlertSnackbar from './AlertSnackbar';
/* Widgets */
import { useWidgetContext } from './widget/WidgetContext';
import WidgetsDisabled from './widget/WidgetsDisabled';
/* Overlays */
import { useOverlayContext } from './overlay/OverlayContext';
import OverlaysDisabled from './overlay/OverlaysDisabled';
/* MUI */
import { ThemeProvider, CssBaseline } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import ContrastIcon from '@mui/icons-material/Contrast';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import SettingsIcon from '@mui/icons-material/Settings';
import Tooltip from '@mui/material/Tooltip';
import TvIcon from '@mui/icons-material/Tv';
import Typography from '@mui/material/Typography';
import VolumeOffOutlinedIcon from '@mui/icons-material/VolumeOffOutlined';
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined';

const availableColors = ['yellow', 'blue', 'red', 'green', 'purple'];
const availableThicknesses: Array<'small' | 'medium' | 'large'> = [
  'small',
  'medium',
  'large'
];

const Settings: React.FC = () => {
  /* Global context */
  const {
    appSettings,
    currentTheme,
    setAppSettings,
    alertSeverity,
    alertContent,
    openAlert,
    setOpenAlert,
    handleOpenAlert,
    setCurrentTheme
  } = useAppContext();

  const { listWidgets, widgetSupported } = useWidgetContext();
  const { listOverlays, overlaySupported } = useOverlayContext();

  /* Refs */
  const timerRef = useRef<number | null>(null);

  /* Navigation */
  const navigate = useNavigate();

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  /* Screen size */
  const { isMobile } = useScreenSizes();

  /* List widgets and overlays on mount */
  useEffect(() => {
    const fetchData = async () => {
      await listWidgets();
      await listOverlays();
    };
    fetchData();
  }, []);

  /****************************************************************************/

  /* Alert handler */
  const handleCloseAlert = (
    event?: React.SyntheticEvent | Event,
    reason?: string
  ) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpenAlert(false);
  };

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
      `Rounded bounding box corners: ${!appSettings.roundedBboxCorners}`,
      'success'
    );
  };

  const handleToggleBboxLabel = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxLabel: !prevSettings.bboxLabel
    }));
    handleOpenAlert(`Bounding box label: ${!appSettings.bboxLabel}`, 'success');
  };

  const handleToggleBboxAnchorIndicator = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxAnchorIndicator: !prevSettings.bboxAnchorIndicator
    }));
    handleOpenAlert(
      `Bounding anchor indicator: ${!appSettings.bboxAnchorIndicator}`,
      'success'
    );
  };

  const handleToggleBboxOnlyShowActive = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxOnlyShowActive: !prevSettings.bboxOnlyShowActive
    }));
    handleOpenAlert(
      `Only show active widget bounding box: ${!appSettings.bboxOnlyShowActive}`,
      'success'
    );
  };

  const handleColorChange = (event: SelectChangeEvent<string>) => {
    const selectedColor = event.target.value as string;
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      bboxColor: selectedColor
    }));
    handleOpenAlert(`Bounding box color: ${selectedColor}`, 'success');
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
    handleOpenAlert(`Bounding box thickness: ${selectedThickness}`, 'success');
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
    const selectedSort = event.target.value as 'id' | 'type';
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      sortBy: selectedSort
    }));
    handleOpenAlert(
      `Sort by: ${capitalizeFirstLetter(selectedSort)}`,
      'success'
    );
  };

  const handleToggleSortOrder = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      sortAscending: !prevSettings.sortAscending
    }));
    handleOpenAlert(
      `Sort order: ${!appSettings.sortAscending ? 'Descending' : 'Ascending'}`,
      'success'
    );
  };

  const handleToggleDoubleClick = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      widgetDoubleClick: !prevSettings.widgetDoubleClick
    }));
    handleOpenAlert(
      `Double click to activate widget: ${!appSettings.widgetDoubleClick}`,
      'success'
    );
  };

  const handleToggleAutoBringFront = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      widgetAutoBringFront: !prevSettings.widgetAutoBringFront
    }));
    handleOpenAlert(
      `Widget auto bring to front: ${!appSettings.widgetAutoBringFront}`,
      'success'
    );
  };

  const handleSnapToAnchor = () => {
    setAppSettings((prevSettings: AppSettings) => ({
      ...prevSettings,
      snapToAnchor: !prevSettings.snapToAnchor
    }));
    handleOpenAlert(
      `Snap to anchor enabled: ${!appSettings.snapToAnchor}`,
      'success'
    );
  };

  /* Handle navigation back */
  const handleBack = () => {
    /* Navigate back to previous screen */
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      /* Fallback to home if there's no navigation history */
      navigate('/');
    }
  };

  /* Handle reset to default settings */
  const handleResetDefaults = () => {
    setAppSettings(defaultAppSettings);
    handleOpenAlert('Settings have been reset to default values', 'success');
  };

  const handleToggleMute = () => {
    setAppSettings({ ...appSettings, mute: !appSettings.mute });
  };

  const toggleTheme = useCallback(() => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setCurrentTheme(newTheme);
  }, [currentTheme, setCurrentTheme]);

  /****************************************************************************/

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CustomContainer
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          height: isMobile ? 'unset' : '100vh',
          overflowY: 'auto'
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: 2
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <SettingsIcon sx={{ marginRight: 1 }} />
            <Typography id="settings-modal-title" variant="h5" component="h2">
              Application settings
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              marginLeft: 'auto'
            }}
          >
            {/* Mute button */}
            <Tooltip
              title={appSettings.mute ? 'Unmute audio' : 'Mute audio'}
              arrow
            >
              <div>
                <CustomStyledIconButton
                  color="inherit"
                  aria-label="mute/unmute audio"
                  onClick={handleToggleMute}
                  edge="end"
                  sx={{ p: 0.5 }}
                >
                  {appSettings.mute ? (
                    <VolumeOffOutlinedIcon
                      sx={{
                        width: '20px',
                        height: '20px',
                        color: 'text.secondary'
                      }}
                    />
                  ) : (
                    <VolumeUpOutlinedIcon
                      sx={{
                        width: '20px',
                        height: '20px',
                        color: 'text.secondary'
                      }}
                    />
                  )}
                </CustomStyledIconButton>
              </div>
            </Tooltip>

            {/* Theme Toggle CustomButton */}
            <Tooltip title="Toggle theme" arrow>
              <div>
                <CustomStyledIconButton
                  color="inherit"
                  aria-label="toggle theme"
                  onClick={toggleTheme}
                  edge="end"
                  sx={{ marginRight: '0px' }}
                >
                  <ContrastIcon
                    sx={{
                      width: '20px',
                      height: '20px',
                      color: 'text.secondary'
                    }}
                  />
                </CustomStyledIconButton>
              </div>
            </Tooltip>
          </Box>
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
            Bounding box settings
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
            label="Rounded bounding box corners"
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
            label="Show bounding box info label"
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
            label="Show bounding box anchor indicator"
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
            label="Only show bounding box for active widget"
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
                Bounding box color
              </InputLabel>
              <Select
                labelId="bbox-color-label"
                value={currentColor}
                label="Bounding box color"
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
                Bounding box thickness
              </InputLabel>
              <Select
                labelId="bbox-thickness-label"
                value={currentThickness}
                label="Bounding box thickness"
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
            Widget settings
          </Typography>
          {!widgetSupported && (
            <WidgetsDisabled sx={{ ml: 0, mr: 0, mt: 1, mb: 3 }} />
          )}
          {!overlaySupported && (
            <OverlaysDisabled sx={{ ml: 0, mr: 0, mt: 1, mb: 3 }} />
          )}
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
                Sort widgets by
              </InputLabel>
              <Select
                labelId="sort-by-label"
                value={appSettings.sortBy}
                label="Sort widgets by"
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
              label="Sort in ascending order"
              sx={{ marginLeft: 2 }}
            />
          </Box>
          {/* Switch setting double or single click for widget activation */}
          <FormControlLabel
            control={
              <CustomSwitch
                checked={appSettings.widgetDoubleClick}
                onChange={handleToggleDoubleClick}
                name="widgetDoubleClick"
              />
            }
            label="Use double click for widget activation"
          />
          {/* Switch setting auto bring to front */}
          <FormControlLabel
            control={
              <CustomSwitch
                checked={appSettings.widgetAutoBringFront}
                onChange={handleToggleAutoBringFront}
                name="widgetAutoBringFront"
              />
            }
            label="Widget auto bring to front"
          />
          {/* Switch setting handle snap to anchor */}
          <FormControlLabel
            control={
              <CustomSwitch
                checked={appSettings.snapToAnchor}
                onChange={handleSnapToAnchor}
                name="snapToAnchor"
              />
            }
            label="Widget snap to anchor"
          />
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between'
          }}
        >
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
          {/* Open parameter list */}
          <CustomButton
            variant="outlined"
            onClick={() => {
              const url = `${window.location.protocol}//${window.location.host}${P_CGI}`;
              window.open(url, '_blank');
            }}
          >
            Parameters list
          </CustomButton>
        </Box>

        {/* Back and Reset Defaults buttons */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 2,
            marginBottom: 2
          }}
        >
          <CustomButton onClick={handleResetDefaults} variant="outlined">
            Reset defaults
          </CustomButton>
          <CustomButton
            onClick={handleBack}
            variant="contained"
            startIcon={<ArrowBackIcon />}
          >
            Back
          </CustomButton>
        </Box>

        {/* Video preview */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <TvIcon sx={{ marginRight: 1 }} />
          <Typography id="preview" variant="h5" component="h2">
            Preview
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex',
            minHeight: isMobile ? '240px' : '540px',
            marginTop: 2,
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
            overflow: 'hidden'
          }}
        >
          <VideoPlayer />
        </Box>

        {/* Alert Snackbar */}
        <AlertSnackbar
          openAlert={openAlert}
          alertSeverity={alertSeverity}
          alertContent={alertContent}
          handleCloseAlert={handleCloseAlert}
        />
      </CustomContainer>
    </ThemeProvider>
  );
};

export default Settings;
