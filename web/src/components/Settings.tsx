import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { lightTheme, darkTheme } from '../theme';
import { useWidgetContext } from './WidgetContext';
import { defaultAppSettings, AppSettings } from '../widgetInterfaces';
import { capitalizeFirstLetter } from '../helpers/utils';
import { CustomSwitch } from './CustomComponents';
import VideoPlayer from './VideoPlayer';
import BBox from './BBox';
/* MUI */
import { ThemeProvider, CssBaseline } from '@mui/material';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import SettingsIcon from '@mui/icons-material/Settings';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';

const availableColors = ['yellow', 'blue', 'red', 'green', 'purple', 'none'];
const availableThicknesses: Array<'small' | 'medium' | 'large'> = [
  'small',
  'medium',
  'large'
];

const Settings: React.FC = () => {
  /* Local state */
  const [countdown, setCountdown] = useState<number | null>(null);

  /* Global context */
  const {
    listWidgets,
    dimensions,
    activeWidgets,
    appSettings,
    currentTheme,
    setAppSettings,
    alertSeverity,
    alertContent,
    openAlert,
    setOpenAlert,
    handleOpenAlert,
    setOpenDropdownIndex
  } = useWidgetContext();

  /* Refs */
  const timerRef = useRef<number | null>(null);

  /* Navigation */
  const navigate = useNavigate();

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  /* List widgets on mount */
  useEffect(() => {
    const fetchData = async () => {
      await listWidgets();
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
    if (countdown !== null) {
      if (countdown > 0) {
        timerRef.current = window.setTimeout(() => {
          setCountdown((prevCountdown) => (prevCountdown as number) - 1);
        }, 1000);
      } else {
        /* When countdown reaches zero, reload the page */
        window.location.reload();
      }
    } else {
      /* If countdown is null, clear any existing timer */
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
  }, [countdown]);

  /* Handle navigation back */
  const handleBack = () => {
    /* Reset the countdown */
    setCountdown(null);
    /* Navigate back to previous screen */
    navigate(-1);
  };

  /* Handle reset to default settings */
  const handleResetDefaults = () => {
    setAppSettings(defaultAppSettings);
    handleOpenAlert('Settings have been reset to default values', 'success');
  };

  /****************************************************************************/

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container
        sx={{
          p: 4,
          textAlign: 'center',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start'
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
          <Typography id="settings-modal-title" variant="h5" component="h2">
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

        {/* Back and Reset Defaults buttons */}
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
          <Button onClick={handleBack} variant="contained">
            Back
          </Button>
        </Box>

        {/* Video preview */}
        <Box
          sx={{
            position: 'relative',
            flexGrow: 1,
            display: 'flex',
            height: '40vh',
            marginTop: 4
          }}
        >
          <VideoPlayer />
          <Box
            sx={{
              // backgroundColor: 'blue',
              position: 'absolute',
              pointerEvents: 'none',
              top: `${dimensions.offsetY}px`,
              left: `${dimensions.offsetX}px`,
              width: `${dimensions.pixelWidth}px`,
              height: `${dimensions.pixelHeight}px`,
              zIndex: 1
            }}
          >
            {activeWidgets.map((widget) => {
              if (widget.generalParams.isVisible) {
                return (
                  /* One BBox per widget */
                  <BBox
                    key={widget.generalParams.id}
                    widget={widget}
                    dimensions={dimensions}
                  />
                );
              }
              return null;
            })}
          </Box>
        </Box>

        {/* Alert Snackbar */}
        <Snackbar
          open={openAlert}
          autoHideDuration={2000}
          onClose={handleCloseAlert}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert
            onClose={handleCloseAlert}
            severity={alertSeverity}
            sx={{
              width: '100%',
              borderRadius: 0,
              fontSize: '1.1rem'
            }}
          >
            {alertContent}
          </Alert>
        </Snackbar>
      </Container>
    </ThemeProvider>
  );
};

export default Settings;
