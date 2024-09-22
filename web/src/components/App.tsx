/* Widget Wizard main component */
import React, { useEffect, useState, useCallback } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import Draggable from 'react-draggable';
import GetParam from './GetParam';
import VideoPlayer from './VideoPlayer';
import WidgetHandler from './WidgetHandler';
import AboutModal from './AboutModal';
import { Widget } from '../widgetInterfaces';
import { lightTheme, darkTheme } from '../theme';
import { useLocalStorage } from '../helpers/hooks.jsx';
import { jsonRequest } from '../helpers/cgihelper';
import { SR_CGI } from './constants';
import { log, enableLogging } from '../helpers/logger';
import { useWidgetContext } from './WidgetContext';
/* MUI */
import { styled } from '@mui/material/styles';
import MuiAppBar, { AppBarProps as MuiAppBarProps } from '@mui/material/AppBar';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import InfoIcon from '@mui/icons-material/Info';
import MenuIcon from '@mui/icons-material/Menu';
import Snackbar from '@mui/material/Snackbar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';

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
  isMoved: boolean;
}

/******************************************************************************/

const App: React.FC = () => {
  /* Local state */
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [initialBoxes, setInitialBoxes] = useState(boundingBoxes);
  const [appLoading, setAppLoading] = useState<boolean>(true);
  const [systemReady, setSystemReady] = useState<string>('no');
  const [screenWidth, setScreenWidth] = useState<number>(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState<number>(window.innerHeight);
  const [manualDrawerControl, setManualDrawerControl] = useState<boolean>(true);
  const [aboutModalOpen, setAboutModalOpen] = useState<boolean>(false);
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
  const [currentTheme, setCurrentTheme] = useLocalStorage('theme', 'light');

  /* Global context */
  const {
    activeWidgets,
    setActiveWidgets,
    updateWidget,
    handleOpenAlert,
    openAlert,
    setOpenAlert,
    alertContent,
    alertSeverity
  } = useWidgetContext();

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

  const handleDrawerOpen = () => {
    setManualDrawerControl(false);
    setDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setManualDrawerControl(true);
    setDrawerOpen(false);
  };

  const toggleTheme = useCallback(() => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setCurrentTheme(newTheme);
  }, [currentTheme, setCurrentTheme]);

  const handleOpenAboutModal = () => setAboutModalOpen(true);
  const handleCloseAboutModal = () => setAboutModalOpen(false);

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

  const handleDimensionsUpdate = (
    videoWidth: number,
    videoHeight: number,
    pixelWidth: number,
    pixelHeight: number,
    offsetX: number,
    offsetY: number
  ) => {
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

  /* Adjust bounding box positions and sizes when video size changes */
  useEffect(() => {
    if (dimensions.videoWidth && dimensions.pixelWidth) {
      setBoundingBoxes((prevBoxes) =>
        prevBoxes.map((box, index) => {
          if (!box.isMoved) {
            return {
              ...box,
              x: initialBoxes[index].x * scaleFactor,
              y: initialBoxes[index].y * scaleFactor,
              width: initialBoxes[index].width * scaleFactor,
              height: initialBoxes[index].height * scaleFactor
            };
          } else {
            return box;
          }
        })
      );
    }
  }, [dimensions.videoWidth, dimensions.pixelWidth, scaleFactor, initialBoxes]);

  const getWidgetPixelPosition = (
    position: { x: number; y: number },
    widgetWidth: number,
    widgetHeight: number
  ) => {
    const widgetWidthPx = widgetWidth * scaleFactor;
    const widgetHeightPx = widgetHeight * scaleFactor;
    const availableWidth = dimensions.pixelWidth - widgetWidthPx;
    const availableHeight = dimensions.pixelHeight - widgetHeightPx;
    const widgetX = ((position.x + 1) / 2) * availableWidth;
    const widgetY = ((position.y + 1) / 2) * availableHeight;

    return { x: widgetX, y: widgetY };
  };

  const handleDrag = (widget: Widget, newX: number, newY: number) => {
    // console.log(
    //   `handleDrag called for widget ${widget.generalParams.id} at position (${newX}, ${newY})`
    // );
    const widgetWidthPx = widget.width * scaleFactor;
    const widgetHeightPx = widget.height * scaleFactor;
    const availableWidth = dimensions.pixelWidth - widgetWidthPx;
    const availableHeight = dimensions.pixelHeight - widgetHeightPx;
    const posX = (2 * newX) / availableWidth - 1;
    const posY = (2 * newY) / availableHeight - 1;

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
            <IconButton
              color="inherit"
              aria-label="open drawer"
              onClick={handleDrawerOpen}
              edge="start"
              sx={[
                {
                  mr: 2
                },
                (drawerOpen || screenWidth < drawerWidth + drawerOffset) && {
                  display: 'none'
                }
              ]}
            >
              <MenuIcon />
            </IconButton>

            {/* Title */}
            <Box sx={{ flexGrow: 1, textAlign: 'center' }}>
              <Fade in={true} timeout={1000} mountOnEnter unmountOnExit>
                <Typography variant="h5" noWrap component="div">
                  {import.meta.env.VITE_WEBSITE_NAME} @{' '}
                  <GetParam param="Brand.ProdFullName" />
                </Typography>
              </Fade>
            </Box>

            {/* Info Button (left of theme icon) */}
            <IconButton
              color="inherit"
              aria-label="about info"
              onClick={handleOpenAboutModal}
              edge="end"
              sx={{ marginRight: '0px' }}
            >
              <InfoIcon />
            </IconButton>

            {/* Theme Toggle Button (right-aligned) */}
            <IconButton
              color="inherit"
              aria-label="toggle theme"
              onClick={toggleTheme}
              edge="end"
            >
              {currentTheme === 'dark' ? (
                <Brightness7Icon />
              ) : (
                <Brightness4Icon />
              )}
            </IconButton>
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
                backgroundColor: 'primary.light',
                borderRadius: '8px'
              },
              '&::-webkit-scrollbar-thumb:hover': {
                backgroundColor: 'secondary.dark'
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: 'primary.dark'
              }
            }
          }}
          variant="persistent"
          anchor="left"
          open={drawerOpen}
        >
          <DrawerHeader>
            <IconButton onClick={handleDrawerClose}>
              {theme.direction === 'ltr' ? (
                <ChevronLeftIcon />
              ) : (
                <ChevronRightIcon />
              )}
            </IconButton>
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
            />

            {/* Overlay Surface aligned with the video element */}
            <Box
              sx={{
                // backgroundColor: 'blue',
                position: 'absolute',
                top: `${dimensions.offsetY}px`,
                left: `${dimensions.offsetX}px`,
                width: `${dimensions.pixelWidth}px`,
                /* Cut out a stripe for the videoplayer toolbar */
                height: `${dimensions.pixelHeight - 32}px`,
                zIndex: 1
              }}
            >
              {activeWidgets.map((widget) => {
                /* Only render the bounding box if anchor is set to "none" */
                if (widget.generalParams.anchor === 'none') {
                  const { x, y } = getWidgetPixelPosition(
                    widget.generalParams.position,
                    widget.width,
                    widget.height
                  );

                  return (
                    <Draggable
                      key={`${widget.generalParams.id}-${x}-${y}`}
                      position={{ x, y }}
                      bounds={{
                        left: 0,
                        top: 0,
                        right:
                          dimensions.pixelWidth - widget.width * scaleFactor,
                        bottom:
                          dimensions.pixelHeight - widget.height * scaleFactor
                      }}
                      onStop={(e, data) => handleDrag(widget, data.x, data.y)}
                    >
                      <Box
                        sx={{
                          width: `${widget.width * scaleFactor}px`,
                          height: `${widget.height * scaleFactor}px`,
                          border: '2px solid #ffcc33',
                          position: 'absolute',
                          cursor: 'move'
                        }}
                      />
                    </Draggable>
                  );
                }
                return null;
              })}
            </Box>
          </Box>
        </Main>

        {/* Alert Snackbar */}
        <Snackbar
          open={openAlert}
          autoHideDuration={2000}
          onClose={handleCloseAlert}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
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
