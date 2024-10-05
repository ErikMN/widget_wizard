/* Widget Wizard main component */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import logo from '../assets/img/widgy2.png';
import Draggable from 'react-draggable';
import GetParam from './GetParam';
import VideoPlayer from './VideoPlayer';
import WidgetHandler from './WidgetHandler';
import AboutModal from './AboutModal';
import CapabilitiesModal from './CapabilitiesModal';
import SettingsModal from './SettingsModal.js';
import { Widget } from '../widgetInterfaces';
import { lightTheme, darkTheme } from '../theme';
import { useLocalStorage } from '../helpers/hooks.jsx';
import { jsonRequest } from '../helpers/cgihelper';
import { SR_CGI } from './constants';
import { log, enableLogging } from '../helpers/logger';
import { useWidgetContext } from './WidgetContext';
import { capitalizeFirstLetter } from '../helpers/utils';
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
import SettingsIcon from '@mui/icons-material/Settings';
import Snackbar from '@mui/material/Snackbar';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';

const drawerWidth = 500;
const drawerOffset = 400;

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

interface BoundingBox {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  const [dimensions, setDimensions] = useState({
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
    widgetLoading,
    activeWidgets,
    setActiveWidgets,
    updateWidget,
    handleOpenAlert,
    openAlert,
    setOpenAlert,
    alertContent,
    alertSeverity,
    currentTheme,
    setCurrentTheme,
    activeDraggableWidget,
    setActiveDraggableWidget,
    openDropdownIndex,
    setOpenDropdownIndex,
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

    /* Clean up */
    return () => {
      window.removeEventListener('resize', handleResize);
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
          setTimeout(() => {
            setSystemReady(systemReadyState);
          }, 500);
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

  const recalculateDimensions = () => {
    /* The delay allows the DOM to settle before recalculating dimensions. */
    if (logVideoDimensionsRef.current) {
      setTimeout(() => {
        if (logVideoDimensionsRef.current) {
          logVideoDimensionsRef.current();
        }
      }, 300);
    }
  };

  const handleDrawerOpen = () => {
    setManualDrawerControl(false);
    setDrawerOpen(true);
    recalculateDimensions();
  };

  const handleDrawerClose = () => {
    setManualDrawerControl(true);
    setDrawerOpen(false);
    recalculateDimensions();
  };

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

  /* Widget backend uses 1920x1080 HD resolution */
  const HD_WIDTH = 1920;
  const scaleFactor = dimensions.pixelWidth / HD_WIDTH || 1;

  const getWidgetPixelPosition = (
    position: { x: number; y: number },
    widgetWidth: number,
    widgetHeight: number
  ) => {
    const widgetWidthPx = widgetWidth * scaleFactor;
    const widgetHeightPx = widgetHeight * scaleFactor;
    const Xmin = -1.0;
    const Xmax = 1.0 - 2 * (widgetWidthPx / dimensions.pixelWidth);
    const Ymin = -1.0;
    const Ymax = 1.0 - 2 * (widgetHeightPx / dimensions.pixelHeight);

    const widgetX =
      ((position.x - Xmin) / (Xmax - Xmin)) *
      (dimensions.pixelWidth - widgetWidthPx);
    const widgetY =
      ((position.y - Ymin) / (Ymax - Ymin)) *
      (dimensions.pixelHeight - widgetHeightPx);

    // console.log('getWidgetPixelPosition:', { x: widgetX, y: widgetY });

    return { x: widgetX, y: widgetY };
  };

  const handleDragStop = (widget: Widget, newX: number, newY: number) => {
    // console.log(
    //   `handleDragStop called for widget ${widget.generalParams.id} at position (${newX}, ${newY})`
    // );
    const widgetWidthPx = widget.width * scaleFactor;
    const widgetHeightPx = widget.height * scaleFactor;
    const Xmin = -1.0;
    const Xmax = 1.0 - 2 * (widgetWidthPx / dimensions.pixelWidth);
    const Ymin = -1.0;
    const Ymax = 1.0 - 2 * (widgetHeightPx / dimensions.pixelHeight);

    const posX =
      (newX / (dimensions.pixelWidth - widgetWidthPx)) * (Xmax - Xmin) + Xmin;
    const posY =
      (newY / (dimensions.pixelHeight - widgetHeightPx)) * (Ymax - Ymin) + Ymin;

    /* Compare with current position */
    const EPSILON = 1e-6;
    const currentPosX = widget.generalParams.position.x;
    const currentPosY = widget.generalParams.position.y;

    /* Only update if the position has changed */
    if (
      Math.abs(posX - currentPosX) > EPSILON ||
      Math.abs(posY - currentPosY) > EPSILON
    ) {
      const updatedWidget = {
        ...widget,
        generalParams: {
          ...widget.generalParams,
          position: {
            x: posX,
            y: posY
          }
        }
      };
      /* Update the active widget state */
      setActiveWidgets((prevWidgets) =>
        prevWidgets.map((w) =>
          w.generalParams.id === widget.generalParams.id ? updatedWidget : w
        )
      );
      /* Update the widget */
      updateWidget(updatedWidget);
    }

    setActiveDraggableWidget({
      id: widget.generalParams.id,
      active: false,
      doubleClick: false
    });
  };

  const handleDragStart = (widget: Widget, x: number, y: number) => {
    // console.log(
    //   `Dragging started for widget ${widget.generalParams.id} at position (${x}, ${y})`
    // );
    setActiveDraggableWidget({
      id: widget.generalParams.id,
      active: true,
      doubleClick: false
    });
  };

  const handleDoubleClick = (widget: Widget) => {
    // console.log(`Double clicked widget ${widget.generalParams.id}`);
    const index = activeWidgets.findIndex(
      (w) => w.generalParams.id === widget.generalParams.id
    );
    if (index !== -1) {
      const isCurrentlyOpen = openDropdownIndex === index;
      setActiveDraggableWidget({
        id: widget.generalParams.id,
        active: false,
        doubleClick: !isCurrentlyOpen
      });
      /* Toggle dropdown: close if open, open if closed */
      setOpenDropdownIndex(isCurrentlyOpen ? null : index);
    }
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
                    mr: 2
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
                <Typography variant="h5" noWrap component="div">
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
              alignItems: 'center'
            }}
          >
            <Typography
              variant="h6"
              sx={{
                textAlign: 'center',
                flexGrow: 1,
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: 'text.primary',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <WidgetsOutlinedIcon sx={{ mr: 1 }} />
              Widgets Menu | Active Widgets: {activeWidgets.length}
            </Typography>
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
          <WidgetHandler />
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
                  /* Only render the bounding box if anchor is set to "none" and visible */
                  if (
                    widget.generalParams.anchor === 'none' &&
                    widget.generalParams.isVisible
                  ) {
                    const { x, y } = getWidgetPixelPosition(
                      widget.generalParams.position,
                      widget.width,
                      widget.height
                    );

                    return (
                      /* Wrap Draggable in div to handle double-click events */
                      <div onDoubleClick={(e) => handleDoubleClick(widget)}>
                        <Draggable
                          key={`${widget.generalParams.id}-${x}-${y}`}
                          position={{ x, y }}
                          bounds={{
                            left: 0,
                            top: 0,
                            right:
                              dimensions.pixelWidth -
                              widget.width * scaleFactor,
                            bottom:
                              dimensions.pixelHeight -
                              widget.height * scaleFactor
                          }}
                          onStart={(e, data) =>
                            handleDragStart(widget, data.x, data.y)
                          }
                          onStop={(e, data) =>
                            handleDragStop(widget, data.x, data.y)
                          }
                        >
                          {/* BBox */}
                          <Box
                            sx={{
                              width: `${widget.width * scaleFactor}px`,
                              height: `${widget.height * scaleFactor}px`,
                              border: '2px solid #ffcc33',
                              borderRadius: appSettings.roundedBboxCorners
                                ? '8px'
                                : '0px',
                              position: 'absolute',
                              pointerEvents: 'auto',
                              cursor: 'move'
                            }}
                          >
                            {/* Widget info note above the bbox */}
                            <Typography
                              sx={{
                                position: 'absolute',
                                top: '-20px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                                padding: '2px 4px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                color: '#333',
                                pointerEvents: 'none'
                              }}
                            >
                              {capitalizeFirstLetter(widget.generalParams.type)}
                              {' ID: '}
                              {widget.generalParams.id}
                            </Typography>
                          </Box>
                        </Draggable>
                      </div>
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
