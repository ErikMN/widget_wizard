/* Widget Wizard main component */
import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import Logo from './Logo';
import VideoStage from './VideoStage';
import AboutModal from './AboutModal';
import AlertSnackbar from './AlertSnackbar';
import DrawerContent from './DrawerContent';
import { useParameters } from './ParametersContext';
import { CustomStyledIconButton } from './CustomComponents';
import { lightTheme, darkTheme } from '../theme';
import { useLocalStorage, useScreenSizes } from '../helpers/hooks.jsx';
import { playSound } from '../helpers/utils';
import { drawerWidth, drawerHeight, appbarHeight } from './constants';
import { log, enableLogging } from '../helpers/logger';
import { useGlobalContext } from './GlobalContext';
import messageSoundUrl from '../assets/audio/message.oga';
/* Widgets */
import WidgetInfo from './widget/WidgetInfo';
/* Draw mode */
import DrawMode from './draw/DrawMode';
import { DrawProvider } from './draw/DrawContext';
/* MUI */
import { styled } from '@mui/material/styles';
import MuiAppBar, { AppBarProps as MuiAppBarProps } from '@mui/material/AppBar';
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
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import VolumeOffOutlinedIcon from '@mui/icons-material/VolumeOffOutlined';
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined';

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
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'none',
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
  const [aboutModalOpen, setAboutModalOpen] = useState<boolean>(false);

  /* Local storage state */
  const [drawerOpen, setDrawerOpen] = useLocalStorage('drawerOpen', true);
  const [isMuted, setIsMuted] = useLocalStorage('mute', false);

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
  const handleOpenAboutModal = () => {
    setAboutModalOpen(true);
    playSound(messageSoundUrl);
  };
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

  const handleToggleMute = () => {
    setIsMuted((prev: boolean) => !prev);
  };

  /****************************************************************************/

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
                  {/* App logo (on desktop only) */}
                  <Box
                    sx={{ marginLeft: 1, display: { xs: 'none', md: 'block' } }}
                  >
                    <Logo style={{ height: '40px' }} />
                  </Box>
                </Typography>
              </Fade>
            </Box>

            {/* Mute button */}
            <Tooltip title={isMuted ? 'Unmute audio' : 'Mute audio'} arrow>
              <div>
                <CustomStyledIconButton
                  color="inherit"
                  aria-label="mute/unmute audio"
                  onClick={handleToggleMute}
                  edge="end"
                  sx={{ marginRight: '0px' }}
                >
                  {isMuted ? (
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

            {/* Draw toolbar (context-driven, no props) */}
            <DrawMode />

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
              /* Prevent horizontal overflow */
              overflowX: 'hidden',
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
            <DrawerContent />
          </Box>
        </Drawer>

        {/* Main content */}
        <Main open={drawerOpen} isMobile={isMobile}>
          <DrawerHeader />
          {/* Video Stage (Video + Drawing Overlay) via context */}
          <VideoStage
            strokeColor={theme.palette.primary.main}
            strokeWidth={3}
          />
        </Main>

        {/* Alert Snackbar */}
        <AlertSnackbar
          openAlert={openAlert}
          alertSeverity={alertSeverity}
          alertContent={alertContent}
          handleCloseAlert={handleCloseAlert}
        />

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
      <DrawProvider>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <CssBaseline />
          {contentMain()}
        </Box>
      </DrawProvider>
    </ThemeProvider>
  );
};

export default App;
