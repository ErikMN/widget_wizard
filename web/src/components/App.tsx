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
import { log, enableLogging } from '../helpers/logger';
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

/* CGI endpoints */
const SR_CGI = '/axis-cgi/systemready.cgi';

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

/******************************************************************************/

const App: React.FC = () => {
  /* Local state */
  const [activeWidgets, setActiveWidgets] = useState<Widget[]>([]);
  const [appLoading, setAppLoading] = useState<boolean>(true);
  const [systemReady, setSystemReady] = useState<string>('no');
  const [screenWidth, setScreenWidth] = useState<number>(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState<number>(window.innerHeight);
  const [manualDrawerControl, setManualDrawerControl] = useState<boolean>(true);
  const [aboutModalOpen, setAboutModalOpen] = useState<boolean>(false);
  const [openAlert, setOpenAlert] = useState<boolean>(false);
  const [alertContent, setAlertContent] = useState<string>('');
  const [alertSeverity, setAlertSeverity] = useState<
    'info' | 'success' | 'error' | 'warning'
  >('info');
  const [dimensions, setDimensions] = useState({
    videoWidth: 0,
    videoHeight: 0,
    pixelWidth: 0,
    pixelHeight: 0,
    offsetX: 0,
    offsetY: 0
  });

  /* TODO: REMOVE: */
  const [boundingBoxes, setBoundingBoxes] = useState([
    { id: 1, x: 50, y: 100, width: 100, height: 100, isMoved: false },
    { id: 2, x: 200, y: 100, width: 100, height: 100, isMoved: false }
  ]);

  const [initialBoxes, setInitialBoxes] = useState(boundingBoxes);

  /* Local storage state */
  const [drawerOpen, setDrawerOpen] = useLocalStorage('drawerOpen', true);
  const [currentTheme, setCurrentTheme] = useLocalStorage('theme', 'light');

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

  const handleOpenAlert = (
    content: string,
    severity: 'info' | 'success' | 'error' | 'warning'
  ) => {
    setAlertContent(content);
    setAlertSeverity(severity);
    setOpenAlert(true);
  };

  const handleDimensionsUpdate = (
    videoWidth: number,
    videoHeight: number,
    pixelWidth: number,
    pixelHeight: number,
    offsetX: number,
    offsetY: number
  ) => {
    console.log('Video Dimensions (stream):', {
      videoWidth,
      videoHeight
    });
    console.log('Pixel Dimensions (rendered):', {
      pixelWidth,
      pixelHeight
    });
    console.log('Offsets:', {
      offsetX,
      offsetY
    });

    setDimensions({
      videoWidth,
      videoHeight,
      pixelWidth,
      pixelHeight,
      offsetX,
      offsetY
    });
  };

  const scaleX = dimensions.pixelWidth / dimensions.videoWidth || 1;
  const scaleY = dimensions.pixelHeight / dimensions.videoHeight || 1;

  /* Adjust bounding box positions and sizes when video size changes */
  useEffect(() => {
    if (dimensions.videoWidth && dimensions.pixelWidth) {
      setBoundingBoxes((prevBoxes) =>
        prevBoxes.map((box, index) => {
          if (!box.isMoved) {
            return {
              ...box,
              x: initialBoxes[index].x * scaleX,
              y: initialBoxes[index].y * scaleY,
              width: initialBoxes[index].width * scaleX,
              height: initialBoxes[index].height * scaleY
            };
          } else {
            return box;
          }
        })
      );
    }
  }, [
    dimensions.videoWidth,
    dimensions.pixelWidth,
    scaleX,
    scaleY,
    initialBoxes
  ]);

  const handleStop = (boxId: number, newX: number, newY: number) => {
    setBoundingBoxes((prevBoxes) =>
      prevBoxes.map((b) =>
        b.id === boxId
          ? { ...b, x: newX / scaleX, y: newY / scaleY, isMoved: true }
          : b
      )
    );
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
          <WidgetHandler
            handleOpenAlert={handleOpenAlert}
            activeWidgets={activeWidgets}
            setActiveWidgets={setActiveWidgets}
          />
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
                position: 'absolute',
                top: `${dimensions.offsetY}px`,
                left: `${dimensions.offsetX}px`,
                width: `${dimensions.pixelWidth}px`,
                height: `${dimensions.pixelHeight}px`,
                zIndex: 1
              }}
            >
              {boundingBoxes.map((box) => (
                <Draggable
                  key={box.id}
                  position={{ x: box.x * scaleX, y: box.y * scaleY }}
                  bounds={{
                    left: 0,
                    top: 0,
                    right: dimensions.pixelWidth - box.width,
                    bottom: dimensions.pixelHeight - box.height
                  }}
                  onStop={(e, data) => handleStop(box.id, data.x, data.y)}
                >
                  <Box
                    sx={{
                      width: `${box.width}px`,
                      height: `${box.height}px`,
                      border: '2px solid red',
                      position: 'absolute',
                      cursor: 'move'
                    }}
                  />
                </Draggable>
              ))}
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
