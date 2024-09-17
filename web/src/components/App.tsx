import React, { useEffect, useRef, useState, useCallback } from 'react';
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

const DraggableBoundingBox = styled('div')(({ theme }) => ({
  width: 100,
  height: 100,
  border: '2px solid red',
  position: 'absolute',
  cursor: 'move'
}));

const OverlaySurface = styled('div')(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: -1 /* TODO: FIXME: overlays above player */
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
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });
  const [openAlert, setOpenAlert] = useState<boolean>(false);
  const [alertContent, setAlertContent] = useState<string>('');
  const [alertSeverity, setAlertSeverity] = useState<
    'info' | 'success' | 'error' | 'warning'
  >('info');

  /* TODO: REMOVE: */
  const [boundingBoxes, setBoundingBoxes] = useState([
    { id: 1, x: 50, y: 100 },
    { id: 2, x: 200, y: 100 }
  ]);

  /* Local storage state */
  const [drawerOpen, setDrawerOpen] = useLocalStorage('drawerOpen', true);
  const [currentTheme, setCurrentTheme] = useLocalStorage('theme', 'light');

  /* Refs */
  const videoBoxRef = useRef<HTMLDivElement>(null);

  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  enableLogging(true);

  /* Handle screen and video box size */
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
      setScreenHeight(window.innerHeight);
    };
    /* Get the pixel size of the video Box */
    const updateBoxSize = () => {
      if (videoBoxRef.current) {
        const { width, height } = videoBoxRef.current.getBoundingClientRect();
        setBoxSize({ width, height });
      }
    };
    /* Call updateBoxSize as soon as videoBoxRef becomes available */
    const observer = new MutationObserver((mutations) => {
      if (videoBoxRef.current) {
        updateBoxSize();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    /* Add resize event listeners */
    window.addEventListener('resize', handleResize);
    window.addEventListener('resize', updateBoxSize);

    /* Clean up */
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('resize', updateBoxSize);
    };
  }, []);

  // log(screenWidth, screenHeight);
  // log(boxSize.width, boxSize.height);

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
          <Box ref={videoBoxRef} sx={{ position: 'relative' }}>
            <VideoPlayer height={screenHeight} />

            {/* FIXME: Draggable Surface */}
            <OverlaySurface>
              {boundingBoxes.map((box) => (
                <Draggable
                  key={box.id}
                  defaultPosition={{ x: box.x, y: box.y }}
                  bounds="parent"
                >
                  <DraggableBoundingBox />
                </Draggable>
              ))}
            </OverlaySurface>
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
