import React, { useEffect, useState } from 'react';
import { Container, Box } from '@mui/material';
import GetParam from './GetParam';
import VideoPlayer from './VideoPlayer';
import '../assets/css/App.css';

const App: React.FC = () => {
  const [screenWidth, setScreenWidth] = useState<number>(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState<number>(window.innerHeight);

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
        <GetParam param="Brand.ProdFullName" />
        <VideoPlayer width={screenWidth} height={screenHeight} />
      </Box>
    </Container>
  );
}

export default App;
