import React, { useEffect, useState } from 'react';
import GetParam from './GetParam';
import VideoPlayer from './VideoPlayer';
/* MUI */
import { Container, Box, Drawer, IconButton } from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon } from '@mui/icons-material';
import '../assets/css/App.css';

const drawerWidth = 400;

const App: React.FC = () => {
  /* Local state */
  const [screenWidth, setScreenWidth] = useState<number>(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState<number>(window.innerHeight);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

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

  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  return (
    <Container>
      <Box
        className="App"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh'
        }}
      >
        <Drawer
          variant="persistent"
          anchor="right"
          open={drawerOpen}
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box'
            }
          }}
        >
          HELLO DRAWER
        </Drawer>

        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={toggleDrawer}>
            {drawerOpen ? <CloseIcon /> : <MenuIcon />}
          </IconButton>
          <GetParam param="Brand.ProdFullName" />
        </Box>

        <VideoPlayer width={screenWidth} height={screenHeight} />
      </Box>
    </Container>
  );
};

export default App;
