/* Widget Wizard main component */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import Logo from './Logo';
import VideoPlayer from './VideoPlayer';
import WidgetHandler from './widget/WidgetHandler.js';
import AboutModal from './AboutModal';
import CapabilitiesModal from './CapabilitiesModal';
import BBox from './BBox';
import { useParameters } from './ParametersContext';
import { CustomStyledIconButton } from './CustomComponents';
import { lightTheme, darkTheme } from '../theme';
import { useLocalStorage } from '../helpers/hooks.jsx';
import { jsonRequest } from '../helpers/cgihelper';
import { SR_CGI, drawerWidth, drawerHeight } from './constants';
import { log, enableLogging } from '../helpers/logger';
import { useGlobalContext } from './GlobalContext';
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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
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
import { Widget } from '../widgetInterfaces.js';

/******************************************************************************/

const Main = styled('main', {
  shouldForwardProp: (prop) => prop !== 'open' && prop !== 'isMobile'
})<{
  open?: boolean;
  isMobile?: boolean;
}>(({ theme, open, isMobile }) => ({
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
  padding: theme.spacing(isMobile ? 0 : '4px'),
  transition: theme.transitions.create('margin', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen
  }),
  ...(isMobile
    ? { marginBottom: open ? drawerHeight : 0 }
    : { marginLeft: open ? drawerWidth : 0 }),
  ...(open && {
    transition: theme.transitions.create('margin', {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen
    }),
    position: 'relative'
  })
}));

interface AppBarProps extends MuiAppBarProps {
  open?: boolean;
  isMobile?: boolean;
}

const AppBar = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== 'open' && prop !== 'isMobile'
})<AppBarProps>(({ theme, open, isMobile }) => ({
  overflowX: 'auto',
  backgroundColor: theme.palette.background.paper,
  backgroundImage: 'none',
  whiteSpace: 'nowrap',
  transition: theme.transitions.create(
    isMobile ? 'margin' : ['margin', 'width'],
    {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen
    }
  ),
  ...(open &&
    !isMobile && {
      width: `calc(100% - ${drawerWidth}px)`,
      marginLeft: `${drawerWidth}px`,
      transition: theme.transitions.create(['margin', 'width'], {
        easing: theme.transitions.easing.easeOut,
        duration: theme.transitions.duration.enteringScreen
      })
    }),
  /* Horizontal scrollbar style */
  '&::-webkit-scrollbar': {
    height: '8px',
    backgroundColor: 'transparent'
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: theme.palette.grey[600],
    borderRadius: '6px'
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: theme.palette.grey[800]
  },
  '& .MuiToolbar-root': {
    minHeight: '54px'
  }
}));

const DrawerHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0, 1),
  height: '54px',
  // necessary for content to be below app bar
  // ...theme.mixins.toolbar,
  justifyContent: 'flex-end'
}));

/******************************************************************************/

const App: React.FC = () => {
  /* Local state */
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [appLoading, setAppLoading] = useState<boolean>(true);
  const [systemReady, setSystemReady] = useState<string>('no');
  const [aboutModalOpen, setAboutModalOpen] = useState<boolean>(false);
  const [capabilitiesModalOpen, setCapabilitiesModalOpen] =
    useState<boolean>(false);

  /* Local storage state */
  const [drawerOpen, setDrawerOpen] = useLocalStorage('drawerOpen', true);

  /* Global context */
  const {
    dimensions,
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
  } = useGlobalContext();

  /* Global parameter list */
  const { parameters, paramsLoading } = useParameters();
  const ProdFullName = parameters?.['root.Brand.ProdFullName'];

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  /* Mobile mode */
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const navigate = useNavigate();

  enableLogging(true);

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

  const handleDrawerOpen = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const toggleDrawerOpen = useCallback(() => {
    setDrawerOpen(!drawerOpen);
  }, [drawerOpen]);

  const toggleTheme = useCallback(() => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setCurrentTheme(newTheme);
  }, [currentTheme, setCurrentTheme]);

  /* Modal open/close handlers */
  const handleOpenAboutModal = () => setAboutModalOpen(true);
  const handleCloseAboutModal = () => setAboutModalOpen(false);

  const handleOpenCapabilitiesModal = () => setCapabilitiesModalOpen(true);
  const handleCloseCapabilitiesModal = () => setCapabilitiesModalOpen(false);

  /* App routes navigation handlers */
  const handleNavigateToSettings = () => {
    navigate('/settings');
  };

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

  const contentMain = () => {
    // log('MAIN CONTENT');
    return (
      <>
        {/* Application header bar */}
        <AppBar position="fixed" open={drawerOpen} isMobile={isMobile}>
          <Toolbar
            sx={{
              display: 'flex',
              justifyContent: 'space-between'
            }}
          >
            {/* Menu button (left-aligned) */}
            <Tooltip title="Open the menu" arrow placement="right">
              <CustomStyledIconButton
                color="inherit"
                aria-label="open drawer"
                onClick={toggleDrawerOpen}
                edge="start"
                sx={{ ...(!isMobile && drawerOpen ? { display: 'none' } : {}) }}
              >
                <MenuIcon
                  sx={{
                    width: '20px',
                    height: '20px',
                    color: 'text.secondary'
                  }}
                />
              </CustomStyledIconButton>
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
                  marginRight: 2,
                  visibility: widgetLoading ? 'visible' : 'hidden'
                }}
              />
              {/* Title */}
              <Fade in={true} timeout={1000} mountOnEnter unmountOnExit>
                <Typography
                  variant={isMobile ? 'h6' : 'h5'}
                  noWrap
                  component="div"
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  {/* Debug Icon */}
                  {appSettings.debug && (
                    <ScienceOutlinedIcon
                      sx={{
                        marginRight: '8px',
                        width: '20px',
                        height: '20px',
                        color: 'text.secondary'
                      }}
                    />
                  )}
                  {/* Website Name and Product Full Name */}
                  {import.meta.env.VITE_WEBSITE_NAME} @ {ProdFullName}
                  {/* Logo */}
                  {!isMobile && (
                    <Box sx={{ marginLeft: 1 }}>
                      <Logo style={{ height: '40px' }} />
                    </Box>
                  )}
                </Typography>
              </Fade>
            </Box>

            {/* Show Widget Capabilities JSON button */}
            <Tooltip title="Show Widget Capabilities JSON" arrow>
              <CustomStyledIconButton
                color="inherit"
                aria-label="Show Widget Capabilities JSON"
                onClick={handleOpenCapabilitiesModal}
                edge="end"
                sx={{ marginRight: '0px' }}
              >
                <DataObjectIcon
                  sx={{
                    width: '20px',
                    height: '20px',
                    color: 'text.secondary'
                  }}
                />
              </CustomStyledIconButton>
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
              <CustomStyledIconButton
                color="inherit"
                aria-label="toggle bounding boxes"
                onClick={() => setShowBoundingBoxes((prev) => !prev)}
                edge="end"
                sx={{ marginRight: '0px' }}
              >
                {showBoundingBoxes ? (
                  <VisibilityOutlinedIcon
                    sx={{
                      width: '20px',
                      height: '20px',
                      color: 'text.secondary'
                    }}
                  />
                ) : (
                  <VisibilityOffOutlinedIcon
                    sx={{
                      width: '20px',
                      height: '20px',
                      color: 'text.secondary'
                    }}
                  />
                )}
              </CustomStyledIconButton>
            </Tooltip>

            {/* Info Button (left of theme icon) */}
            <Tooltip title="About Info" arrow>
              <CustomStyledIconButton
                color="inherit"
                aria-label="about info"
                onClick={handleOpenAboutModal}
                edge="end"
                sx={{ marginRight: '0px' }}
              >
                <InfoOutlinedIcon
                  sx={{
                    width: '20px',
                    height: '20px',
                    color: 'text.secondary'
                  }}
                />
              </CustomStyledIconButton>
            </Tooltip>

            {/* Theme Toggle Button */}
            <Tooltip title="Toggle Theme" arrow>
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
            </Tooltip>

            {/* Settings button */}
            <Tooltip title="Application Settings" arrow>
              <CustomStyledIconButton
                color="inherit"
                aria-label="settings"
                onClick={handleNavigateToSettings}
                edge="end"
              >
                <SettingsIcon
                  sx={{
                    width: '20px',
                    height: '20px',
                    color: 'text.secondary'
                  }}
                />
              </CustomStyledIconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        {/* Drawer menu */}
        <Drawer
          sx={{
            ...(isMobile
              ? {
                  flexShrink: 0,
                  '& .MuiDrawer-paper': {
                    height: drawerHeight,
                    boxSizing: 'border-box',
                    overflow: 'auto',
                    position: 'fixed',
                    bottom: 0,
                    width: '100%',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                      backgroundColor: 'transparent'
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: grey[600],
                      borderRadius: '6px'
                    },
                    '&::-webkit-scrollbar-track': {
                      backgroundColor: grey[800]
                    }
                  }
                }
              : {
                  width: drawerWidth,
                  flexShrink: 0,
                  '& .MuiDrawer-paper': {
                    width: drawerWidth,
                    boxSizing: 'border-box',
                    overflow: 'auto',
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    height: '100%',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                      backgroundColor: 'transparent'
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: grey[600],
                      borderRadius: '6px'
                    },
                    '&::-webkit-scrollbar-track': {
                      backgroundColor: grey[800]
                    }
                  }
                })
          }}
          variant="persistent"
          anchor={isMobile ? 'bottom' : 'left'}
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
                width: '20px',
                height: '20px',
                color: 'text.secondary'
              }}
            />
            {/* Centered text */}
            <Typography
              variant="inherit"
              sx={{
                letterSpacing: '0.05em',
                color: 'palette.secondary.main',
                display: 'flex',
                justifyContent: 'center',
                flexGrow: 1,
                ...(isMobile && { marginBottom: 1 })
              }}
            >
              Active Widgets: {activeWidgets.length}
            </Typography>
            {/* Menu close button */}
            <Tooltip title="Close the menu" arrow placement={'right'}>
              <CustomStyledIconButton onClick={handleDrawerClose}>
                {isMobile ? (
                  <KeyboardArrowDownIcon />
                ) : theme.direction === 'ltr' ? (
                  <ChevronLeftIcon />
                ) : (
                  <ChevronRightIcon />
                )}
              </CustomStyledIconButton>
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
                  sx={{
                    marginTop: 2,
                    marginLeft: 1,
                    marginRight: 1,
                    alignItems: 'center'
                  }}
                >
                  <Typography>
                    Widgets are not supported on this device, or the widget
                    backend is disabled.
                  </Typography>
                </Alert>
              </Fade>
            )}
          </Box>
        </Drawer>

        {/* Main content */}
        <Main open={drawerOpen} isMobile={isMobile}>
          <DrawerHeader />
          {/* Video Player */}
          <Box
            sx={{
              position: 'relative',
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Video Player */}
            <VideoPlayer />
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
                {activeWidgets.map((widget: Widget) => {
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
        <CircularProgress size={50} />
      </Box>
    );
  };

  const checkSystemState = () => {
    let content;
    if (!appLoading && !paramsLoading && systemReady === 'yes') {
      content = contentMain();
    } else {
      content = loadingSystem();
    }
    return content;
  };

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <CssBaseline />
        {checkSystemState()}
      </Box>
    </ThemeProvider>
  );
};

export default App;
