/* Widget Wizard main component */
import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import Logo from './Logo';
import VideoPlayer from './VideoPlayer';
import AboutModal from './AboutModal';
import { useParameters } from './ParametersContext';
import { CustomStyledIconButton } from './CustomComponents';
import { lightTheme, darkTheme } from '../theme';
import { useLocalStorage, useScreenSizes } from '../helpers/hooks.jsx';
import { drawerWidth, drawerHeight, appbarHeight } from './constants';
import { log, enableLogging } from '../helpers/logger';
import { useGlobalContext } from './GlobalContext';
/* Widgets */
import WidgetHandler from './widget/WidgetHandler';
import WidgetInfo from './widget/WidgetInfo';
/* MUI */
import { styled } from '@mui/material/styles';
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
import Fab from '@mui/material/Fab';
import Fade from '@mui/material/Fade';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import MenuIcon from '@mui/icons-material/Menu';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import Snackbar from '@mui/material/Snackbar';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

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
    ? { marginBottom: open ? drawerHeight : appbarHeight }
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
    backgroundColor:
      theme.palette.mode === 'dark'
        ? theme.palette.grey[600]
        : theme.palette.grey[400],
    borderRadius: '6px'
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor:
      theme.palette.mode === 'dark'
        ? theme.palette.grey[800]
        : theme.palette.grey[200]
  },
  '& .MuiToolbar-root': {
    minHeight: appbarHeight
  }
}));

const DrawerHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0, 1),
  height: appbarHeight,
  justifyContent: 'flex-end',
  flexShrink: 0
}));

/******************************************************************************/

const App: React.FC = () => {
  /* Local state */
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [aboutModalOpen, setAboutModalOpen] = useState<boolean>(false);

  /* Local storage state */
  const [drawerOpen, setDrawerOpen] = useLocalStorage('drawerOpen', true);

  /* Global context */
  const {
    widgetLoading,
    openAlert,
    setOpenAlert,
    alertContent,
    alertSeverity,
    currentTheme,
    setCurrentTheme,
    appSettings
  } = useGlobalContext();

  /* Refs */
  const drawerRef = useRef<HTMLDivElement>(null);

  /* Global parameter list */
  const { parameters } = useParameters();
  const ProdFullName = parameters?.['root.Brand.ProdFullName'];
  const ProdShortName = parameters?.['root.Brand.ProdShortName'];

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  /* Screen size */
  const { isMobile } = useScreenSizes();

  const navigate = useNavigate();

  enableLogging(true);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
  }, [setDrawerOpen]);

  const toggleDrawerOpen = useCallback(() => {
    setDrawerOpen(!drawerOpen);
    /* Scroll drawer to top if closed in mobile mode */
    if (drawerOpen && drawerRef.current) {
      drawerRef.current.scrollTo({ top: 0 });
    }
  }, [drawerOpen, setDrawerOpen]);

  const toggleTheme = useCallback(() => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setCurrentTheme(newTheme);
  }, [currentTheme, setCurrentTheme]);

  /* Modal open/close handlers */
  const handleOpenAboutModal = () => setAboutModalOpen(true);
  const handleCloseAboutModal = () => setAboutModalOpen(false);

  /* App routes navigation handlers */
  const handleNavigateToSettings = () => {
    navigate('/settings');
  };

  const handleNavigateToCapabilities = () => {
    navigate('/capabilities');
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
            <Tooltip
              title={drawerOpen ? 'Close the menu' : 'Open the menu'}
              arrow
              placement="right"
            >
              <div>
                <CustomStyledIconButton
                  color="inherit"
                  aria-label="open drawer"
                  onClick={toggleDrawerOpen}
                  edge="start"
                  sx={{
                    ...(!isMobile && drawerOpen ? { display: 'none' } : {})
                  }}
                >
                  <MenuIcon
                    sx={{
                      width: '20px',
                      height: '20px',
                      color: 'text.secondary'
                    }}
                  />
                </CustomStyledIconButton>
              </div>
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
                  {import.meta.env.VITE_WEBSITE_NAME} @{' '}
                  {isMobile ? ProdShortName : ProdFullName}
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
            <Tooltip title="Show widget capabilities JSON" arrow>
              <div>
                <CustomStyledIconButton
                  color="inherit"
                  aria-label="Show Widget Capabilities JSON"
                  onClick={handleNavigateToCapabilities}
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
              </div>
            </Tooltip>

            {/* Toggle Bounding Boxes Button */}
            <Tooltip
              title={
                showBoundingBoxes
                  ? 'Hide bounding boxes'
                  : 'Show bounding boxes'
              }
              arrow
            >
              <div>
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
              </div>
            </Tooltip>

            {/* Info Button (left of theme icon) */}
            <Tooltip title="About info" arrow>
              <div>
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
              </div>
            </Tooltip>

            {/* Theme Toggle Button */}
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

            {/* Settings button */}
            <Tooltip title="Application settings" arrow>
              <div>
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
              </div>
            </Tooltip>
          </Toolbar>
        </AppBar>

        {/* Drawer menu */}
        <Drawer
          PaperProps={{ ref: drawerRef }}
          sx={{
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              overflow: isMobile && !drawerOpen ? 'hidden' : 'auto',
              position: 'fixed',
              '&::-webkit-scrollbar': {
                width: '8px',
                backgroundColor: 'transparent'
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: (theme) =>
                  theme.palette.mode === 'dark'
                    ? theme.palette.grey[600]
                    : theme.palette.grey[400],
                borderRadius: '6px'
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: (theme) =>
                  theme.palette.mode === 'dark'
                    ? theme.palette.grey[800]
                    : theme.palette.grey[200]
              },
              ...(isMobile
                ? {
                    height: drawerOpen ? drawerHeight : appbarHeight,
                    bottom: 0,
                    width: '100%'
                  }
                : {
                    width: drawerWidth,
                    left: 0,
                    top: 0,
                    height: '100%'
                  })
            }
          }}
          variant="persistent"
          anchor={isMobile ? 'bottom' : 'left'}
          /* Menu always open to show drawer header in mobile mode */
          open={isMobile ? true : drawerOpen}
        >
          <DrawerHeader
            sx={{
              display: 'flex',
              justifyContent: 'flex-start',
              alignItems: 'center',
              position: 'relative',
              width: '100%'
            }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexGrow: 1
              }}
            >
              <WidgetInfo />
            </Box>
            {/* Menu toggle button */}
            <Tooltip
              title={drawerOpen ? 'Close the menu' : 'Open the menu'}
              arrow
              placement={'right'}
            >
              <div>
                <CustomStyledIconButton
                  onClick={isMobile ? toggleDrawerOpen : handleDrawerClose}
                >
                  {isMobile ? (
                    drawerOpen ? (
                      <KeyboardArrowDownIcon />
                    ) : (
                      <KeyboardArrowUpIcon />
                    )
                  ) : theme.direction === 'ltr' ? (
                    <ChevronLeftIcon />
                  ) : (
                    <ChevronRightIcon />
                  )}
                </CustomStyledIconButton>
              </div>
            </Tooltip>
          </DrawerHeader>
          <Divider />
          {/* Drawer content here */}
          <Box sx={{ paddingBottom: 1 }}>
            <WidgetHandler />
          </Box>
        </Drawer>

        {/* Main content */}
        <Main open={drawerOpen} isMobile={isMobile}>
          <DrawerHeader />
          {/* Video Player */}
          <VideoPlayer showBoundingBoxes={showBoundingBoxes} />
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

        {/* Scroll-to-Top Button for mobile */}
        {isMobile && drawerOpen && (
          <Fab
            color="primary"
            size="small"
            onClick={() => {
              if (drawerRef.current) {
                drawerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            sx={{
              position: 'fixed',
              bottom: '16px',
              right: '16px',
              zIndex: 2000
            }}
          >
            <KeyboardArrowUpIcon />
          </Fab>
        )}
      </>
    );
  };

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <CssBaseline />
        {contentMain()}
      </Box>
    </ThemeProvider>
  );
};

export default App;
