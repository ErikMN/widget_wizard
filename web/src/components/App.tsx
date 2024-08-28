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

const drawerWidth = 500;

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

  const getDrawerStyles = () => {
    const drawerStyles = {
      bgcolor: 'purple',
      boxSizing: 'border-box',
      width: drawerWidth,
      overflow: 'auto',
      '&::-webkit-scrollbar': {
        width: '8px',
        backgroundColor: 'transparent'
      },
      '&::-webkit-scrollbar-thumb': {
        backgroundColor: 'primary.light',
        borderRadius: '6px'
      },
      '&::-webkit-scrollbar-thumb:hover': {
        backgroundColor: 'secondary.dark'
      },
      '&::-webkit-scrollbar-track': {
        backgroundColor: 'primary.dark'
      }
    };

    return { sx: drawerStyles };
  };

  return (
    <Box
      sx={{
        backgroundColor: 'blue',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}
    >
      {/* Menu Button and Param Display */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={toggleDrawer}>
          {drawerOpen ? <CloseIcon /> : <MenuIcon />}
        </IconButton>
        <GetParam param="Brand.ProdFullName" />
      </Box>

      {/* Video Player and Drawer */}
      <Box sx={{ display: 'flex', width: '100%', flexGrow: 1 }}>
        {/* Video Player */}
        <Box sx={{ marginRight: drawerOpen ? `${drawerWidth}px` : 0 }}>
          <VideoPlayer
            width={drawerOpen ? screenWidth - drawerWidth : screenWidth}
            height={screenHeight - 64}
          />
        </Box>

        {/* Drawer */}
        <Drawer
          anchor="right"
          variant="persistent"
          open={drawerOpen}
          ModalProps={{ keepMounted: true }}
          PaperProps={getDrawerStyles()}
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            HELLO DRAWER
          </div>
        </Drawer>
      </Box>
    </Box>
  );
};

export default App;
