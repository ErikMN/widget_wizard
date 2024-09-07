import React, { useEffect, useState, useCallback } from 'react';
import GetParam from './GetParam';
import VideoPlayer from './VideoPlayer';
import { lightTheme, darkTheme } from '../theme';
import { useLocalStorage } from '../helpers/hooks.jsx';
/* MUI */
import { styled } from '@mui/material/styles';
import { ThemeProvider, CssBaseline } from '@mui/material';
import MuiAppBar, { AppBarProps as MuiAppBarProps } from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';

// import '../assets/css/App.css';

const drawerWidth = 500;

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
        marginLeft: 0
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
  const [screenWidth, setScreenWidth] = useState<number>(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState<number>(window.innerHeight);
  const [manualDrawerControl, setManualDrawerControl] =
    useState<boolean>(false);

  /* Local storage state */
  const [drawerOpen, setDrawerOpen] = useLocalStorage('drawerOpen', false);
  const [currentTheme, setCurrentTheme] = useLocalStorage(
    'selectedTheme',
    'light'
  );

  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  /* Handle screen size */
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
      setScreenHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  /* Automatically open or close drawer depending on screen size */
  useEffect(() => {
    if (!manualDrawerControl) {
      setDrawerOpen(screenWidth >= drawerWidth);
    }
  }, [screenWidth, manualDrawerControl, setDrawerOpen]);

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

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex' }}>
        <CssBaseline />

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
                drawerOpen && { display: 'none' }
              ]}
            >
              <MenuIcon />
            </IconButton>

            {/* Title */}
            <Box sx={{ flexGrow: 1, textAlign: 'center' }}>
              <Typography variant="h5" noWrap component="div">
                {import.meta.env.VITE_WEBSITE_NAME} @{' '}
                <GetParam param="Brand.ProdFullName" />
              </Typography>
            </Box>

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
              boxSizing: 'border-box'
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
          <div
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            APP CONTENT HERE
          </div>
        </Drawer>

        {/* Main content */}
        <Main open={drawerOpen}>
          <DrawerHeader />
          {/* Video Player */}
          <VideoPlayer height={screenHeight} />
        </Main>
      </Box>
    </ThemeProvider>
  );
};

export default App;
