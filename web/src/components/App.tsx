import React, { useEffect, useState } from 'react';
import GetParam from './GetParam';
import VideoPlayer from './VideoPlayer';
/* MUI */
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';

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
    <Box
      sx={{
        backgroundColor: 'green',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
        // justifyContent: 'start',
        // width: '100%',
        // height: '100vh'
      }}
    >
      {/* Menu Button and Param Display */}
      <Box
        sx={{
          display: 'flex'
          // alignItems: 'center',
          // width: '100%',
          // padding: 2
        }}
      >
        <IconButton onClick={toggleDrawer}>
          {drawerOpen ? <CloseIcon /> : <MenuIcon />}
        </IconButton>
        <GetParam param="Brand.ProdFullName" />
      </Box>

      {/* Video Player and Drawer */}
      <Box sx={{ display: 'flex', width: '100%', flexGrow: 1 }}>
        {/* Video Player */}
        <Box
          sx={{
            // flexGrow: 1,
            // transition: 'width 0.3s',
            marginRight: drawerOpen ? `${drawerWidth}px` : 0
          }}
        >
          <VideoPlayer
            width={drawerOpen ? screenWidth - drawerWidth : screenWidth}
            height={screenHeight - 64}
          />
        </Box>

        {/* Drawer */}
        <Drawer
          variant="persistent"
          anchor="right"
          open={drawerOpen}
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              backgroundColor: 'blue'
            }
          }}
        >
          HELLO DRAWER
        </Drawer>
      </Box>
    </Box>
  );
};

export default App;
