/* Widget Wizard main component */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import logo from '../assets/img/widgy2.png';
import GetParam from './GetParam';
import VideoPlayer from './VideoPlayer';
import WidgetHandler from './WidgetHandler';
import AboutModal from './AboutModal';
import CapabilitiesModal from './CapabilitiesModal';
import SettingsModal from './SettingsModal';
import BBox from './BBox';
import { lightTheme, darkTheme } from '../theme';
import { useLocalStorage } from '../helpers/hooks.jsx';
import { jsonRequest } from '../helpers/cgihelper';
import { SR_CGI, drawerWidth, drawerOffset } from './constants';
import { log, enableLogging } from '../helpers/logger';
import { useWidgetContext } from './WidgetContext';
import { Dimensions } from '../widgetInterfaces';
/* MUI */
import { styled } from '@mui/material/styles';
import { grey } from '@mui/material/colors';
import MuiAppBar, { AppBarProps as MuiAppBarProps } from '@mui/material/AppBar';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CircularProgress from '@mui/material/CircularProgress';
import ContrastIcon from '@mui/icons-material/Contrast';
import DataObjectIcon from '@mui/icons-material/DataObject';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import Snackbar from '@mui/material/Snackbar';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';

/******************************************************************************/

const Main = styled('main', { shouldForwardProp: (prop) => prop !== 'open' })<{
  open?: boolean;
}>(({ theme }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
  transition: theme.transitions.create('margin', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen
  }),
  marginLeft: `-${drawerWidth}px`,
  variants: [
    {
      props: ({ open }) => open,
      style: {
        transition: theme.transitions.create('margin', {
          easing: theme.transitions.easing.easeOut,
          duration: theme.transitions.duration.enteringScreen
        }),
        marginLeft: 0,
        position: 'relative'
      }
    }
  ]
}));

interface AppBarProps extends MuiAppBarProps {
  open?: boolean;
}

const AppBar = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== 'open'
})<AppBarProps>(({ theme }) => ({
  transition: theme.transitions.create(['margin', 'width'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen
  }),
  variants: [
    {
      props: ({ open }) => open,
      style: {
        width: `calc(100% - ${drawerWidth}px)`,
        marginLeft: `${drawerWidth}px`,
        transition: theme.transitions.create(['margin', 'width'], {
          easing: theme.transitions.easing.easeOut,
          duration: theme.transitions.duration.enteringScreen
        })
      }
    }
  ]
}));

const DrawerHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0, 1),
  // necessary for content to be below app bar
  ...theme.mixins.toolbar,
  justifyContent: 'flex-end'
}));

/******************************************************************************/

const App: React.FC = () => {
  /* Local state */
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [appLoading, setAppLoading] = useState<boolean>(true);
  const [systemReady, setSystemReady] = useState<string>('no');
  const [screenWidth, setScreenWidth] = useState<number>(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState<number>(window.innerHeight);
  const [manualDrawerControl, setManualDrawerControl] = useState<boolean>(true);
  const [aboutModalOpen, setAboutModalOpen] = useState<boolean>(false);
  const [capabilitiesModalOpen, setCapabilitiesModalOpen] =
    useState<boolean>(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);
  const [dimensions, setDimensions] = useState<Dimensions>({
    videoWidth: 0,
    videoHeight: 0,
    pixelWidth: 0,
    pixelHeight: 0,
    offsetX: 0,
    offsetY: 0
  });

  /* Local storage state */
  const [drawerOpen, setDrawerOpen] = useLocalStorage('drawerOpen', true);

  /* Global context */
  const {
    widgetSupported,
    widgetLoading,
    activeWidgets,
    handleOpenAlert,
    openAlert,
    setOpenAlert,
    alertContent,
    alertSeverity,
    currentTheme,
    setCurrentTheme,
    appSettings
  } = useWidgetContext();

  /* Refs */
  const logVideoDimensionsRef = useRef<() => void | null>(null);

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  enableLogging(true);

  /* Handle screen and video box size */
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
      setScreenHeight(window.innerHeight);
    };

    /* Add resize event listeners */
    window.addEventListener('resize', handleResize);
    window.addEventListener('resize', recalculateDimensions);

    /* Clean up */
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('resize', recalculateDimensions);
    };
  }, []);

  /* Automatically open or close drawer depending on screen size */
  useEffect(() => {
    if (!manualDrawerControl) {
      setDrawerOpen(screenWidth >= drawerWidth + drawerOffset);
    }
    if (drawerOpen) {
      setManualDrawerControl(false);
    }
  }, [screenWidth, manualDrawerControl, setDrawerOpen, drawerOpen]);

  /* App mount calls */
  useEffect(() => {
    /* Check system state */
    const fetchSystemReady = async () => {
      setAppLoading(true);
      const payload = {
        apiVersion: '1.0',
        method: 'systemready',
        params: {
          timeout: 10
        }
      };
      try {
        const resp = await jsonRequest(SR_CGI, payload);
        const systemReadyState = resp.data.systemready;
        /* If the system is not ready, wait a couple of seconds and retry */
        if (systemReadyState !== 'yes') {
          setTimeout(() => {
            fetchSystemReady();
          }, 2000); /* Wait before retrying */
        } else {
          /* Delay setting the system ready state a little bit */
          // setTimeout(() => {
          //   setSystemReady(systemReadyState);
          // }, 500);

          /* No delay just start */
          setSystemReady(systemReadyState);
        }
      } catch (error) {
        console.error(error);
        handleOpenAlert('Failed to check system status', 'error');
      } finally {
        setAppLoading(false);
      }
    };
    fetchSystemReady();
  }, []);

  /* Recalculate the video dimensions when the screen size changes */
  const recalculateDimensions = () => {
    if (logVideoDimensionsRef.current) {
      logVideoDimensionsRef.current();
    }
  };

  const handleDrawerOpen = useCallback(() => {
    setManualDrawerControl(false);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setManualDrawerControl(true);
    setDrawerOpen(false);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setCurrentTheme(newTheme);
  }, [currentTheme, setCurrentTheme]);

  /* Modal open/close handlers */
  const handleOpenAboutModal = () => setAboutModalOpen(true);
  const handleCloseAboutModal = () => setAboutModalOpen(false);

  const handleOpenCapabilitiesModal = () => setCapabilitiesModalOpen(true);
  const handleCloseCapabilitiesModal = () => setCapabilitiesModalOpen(false);

  const handleOpenSettingsModal = () => setSettingsModalOpen(true);
  const handleCloseSettingsModal = () => setSettingsModalOpen(false);

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

  /* Update video dimensions
   * Passed as callback to VideoPlayer, also runs via ref at drawer toggle
   */
  const handleDimensionsUpdate = (
    videoWidth: number,
    videoHeight: number,
    pixelWidth: number,
    pixelHeight: number,
    offsetX: number,
    offsetY: number
  ) => {
    // console.log('---------- handleDimensionsUpdate ---------------');
    // console.log('Video Dimensions (stream):', {
    //   videoWidth,
    //   videoHeight
    // });
    // console.log('Pixel Dimensions (rendered):', {
    //   pixelWidth,
    //   pixelHeight
    // });
    // console.log('Offsets:', {
    //   offsetX,
    //   offsetY
    // });
    // console.log('-------------------------------------------------');

    setDimensions({
      videoWidth,
      videoHeight,
      pixelWidth,
      pixelHeight,
      offsetX,
      offsetY
    });
  };

  const contentMain = () => {
    // log('MAIN CONTENT');
    return (
      <>
        {/* Application header bar */}
        <AppBar position="fixed" open={drawerOpen}>
          <Toolbar
            sx={{
              display: 'flex',
              justifyContent: 'space-between'
            }}
          >
            {/* Menu button (left-aligned) */}
            <Tooltip title="Open the menu" arrow placement="right">
              <IconButton
                color="inherit"
                aria-label="open drawer"
                onClick={handleDrawerOpen}
                edge="start"
                sx={[
                  {
                    marginRight: 2
                  },
                  drawerOpen || screenWidth < drawerWidth + drawerOffset
                    ? { display: 'none' }
                    : {}
                ]}
              >
                <MenuIcon />
              </IconButton>
            </Tooltip>

            {/* Title and Logo */}
            <Box
              sx={{
                flexGrow: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              {/* Widget loading progress */}
              <CircularProgress
                size={30}
                sx={{
                  color: '#ffcc33',
                  marginRight: 2,
                  visibility: widgetLoading ? 'visible' : 'hidden'
                }}
              />
              {/* Title */}
              <Fade in={true} timeout={1000} mountOnEnter unmountOnExit>
                <Typography
                  variant="h5"
                  noWrap
                  component="div"
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  {appSettings.debug && (
                    <ScienceOutlinedIcon style={{ marginRight: '8px' }} />
                  )}{' '}
                  {import.meta.env.VITE_WEBSITE_NAME} @{' '}
                  <GetParam param="Brand.ProdFullName" />
                </Typography>
              </Fade>
              {/* Logo */}
              <Box sx={{ marginLeft: 1 }}>
                <img src={logo} alt="Logo" style={{ height: '40px' }} />
              </Box>
            </Box>

            {/* Show Widget Capabilities JSON button */}
            <Tooltip title="Show Widget Capabilities JSON" arrow>
              <IconButton
                color="inherit"
                aria-label="Show Widget Capabilities JSON"
                onClick={handleOpenCapabilitiesModal}
                edge="end"
                sx={{ marginRight: '0px' }}
              >
                <DataObjectIcon />
              </IconButton>
            </Tooltip>

            {/* Toggle Bounding Boxes Button */}
            <Tooltip
              title={
                showBoundingBoxes
                  ? 'Hide Bounding Boxes'
                  : 'Show Bounding Boxes'
              }
              arrow
            >
              <IconButton
                color="inherit"
                aria-label="toggle bounding boxes"
                onClick={() => setShowBoundingBoxes((prev) => !prev)}
                edge="end"
                sx={{ marginRight: '0px' }}
              >
                {showBoundingBoxes ? (
                  <VisibilityOutlinedIcon />
                ) : (
                  <VisibilityOffOutlinedIcon />
                )}
              </IconButton>
            </Tooltip>

            {/* Info Button (left of theme icon) */}
            <Tooltip title="About Info" arrow>
              <IconButton
                color="inherit"
                aria-label="about info"
                onClick={handleOpenAboutModal}
                edge="end"
                sx={{ marginRight: '0px' }}
              >
                <InfoOutlinedIcon />
              </IconButton>
            </Tooltip>

            {/* Theme Toggle Button */}
            <Tooltip title="Toggle Theme" arrow>
              <IconButton
                color="inherit"
                aria-label="toggle theme"
                onClick={toggleTheme}
                edge="end"
                sx={{ marginRight: '0px' }}
              >
                <ContrastIcon />
              </IconButton>
            </Tooltip>

            {/* Settings button */}
            <Tooltip title="Application Settings" arrow>
              <IconButton
                color="inherit"
                aria-label="settings"
                onClick={handleOpenSettingsModal}
                edge="end"
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        {/* Drawer menu */}
        <Drawer
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              overflow: 'auto',
              '&::-webkit-scrollbar': {
                width: '10px',
                backgroundColor: 'transparent'
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: grey[500],
                borderRadius: '8px'
              },
              '&::-webkit-scrollbar-thumb:hover': {
                backgroundColor: grey[600]
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: grey[300]
              }
            }
          }}
          variant="persistent"
          anchor="left"
          open={drawerOpen}
        >
          <DrawerHeader
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative'
            }}
          >
            {/* Left-aligned icon */}
            <WidgetsOutlinedIcon
              sx={{
                position: 'absolute',
                left: 16
              }}
            />
            {/* Centered text */}
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: 'text.primary',
                display: 'flex',
                justifyContent: 'center',
                flexGrow: 1
              }}
            >
              Active Widgets: {activeWidgets.length}
            </Typography>
            {/* Close button on the right */}
            <Tooltip title="Close the menu" arrow placement="right">
              <IconButton onClick={handleDrawerClose}>
                {theme.direction === 'ltr' ? (
                  <ChevronLeftIcon />
                ) : (
                  <ChevronRightIcon />
                )}
              </IconButton>
            </Tooltip>
          </DrawerHeader>
          <Divider />
          {/* Drawer content here */}
          <Box sx={{ paddingBottom: 1 }}>
            {widgetSupported ? (
              <WidgetHandler />
            ) : (
              <Fade in={true} timeout={1000} mountOnEnter unmountOnExit>
                <Alert
                  severity="warning"
                  sx={{ marginTop: 2, marginLeft: 1, marginRight: 1 }}
                >
                  <Typography>This device does not support widgets</Typography>
                </Alert>
              </Fade>
            )}
          </Box>
        </Drawer>

        {/* Main content */}
        <Main open={drawerOpen}>
          <DrawerHeader />
          {/* Video Player */}
          <Box sx={{ position: 'relative' }}>
            {/* Video Player */}
            <VideoPlayer
              height={window.innerHeight}
              onDimensionsUpdate={handleDimensionsUpdate}
              logVideoDimensionsRef={logVideoDimensionsRef}
            />
            {/* Overlay Surface aligned with the video element */}
            {showBoundingBoxes && (
              /* BBox surface */
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
            )}
          </Box>
        </Main>

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

        {/* About Modal */}
        <AboutModal open={aboutModalOpen} handleClose={handleCloseAboutModal} />

        {/* Capabilities Modal */}
        <CapabilitiesModal
          open={capabilitiesModalOpen}
          handleClose={handleCloseCapabilitiesModal}
        />

        {/* Settings Modal */}
        <SettingsModal
          open={settingsModalOpen}
          handleClose={handleCloseSettingsModal}
        />
      </>
    );
  };

  const loadingSystem = () => {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          width: '100%'
        }}
      >
        <Fade in={true} timeout={1000} mountOnEnter unmountOnExit>
          <Typography variant="h6" sx={{ marginBottom: 2 }}>
            {import.meta.env.VITE_WEBSITE_NAME} is getting ready
          </Typography>
        </Fade>
        <CircularProgress size={50} sx={{ color: '#ffcc33' }} />
      </Box>
    );
  };

  const checkSystemState = () => {
    let content;
    if (!appLoading && systemReady === 'yes') {
      content = contentMain();
    } else {
      content = loadingSystem();
    }
    return content;
  };

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex' }}>
        <CssBaseline />
        {checkSystemState()}
      </Box>
    </ThemeProvider>
  );
};

export default App;
