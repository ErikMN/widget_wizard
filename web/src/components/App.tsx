import { useEffect, useState } from 'react';
import GetParam from './GetParam';
import VideoPlayer from './VideoPlayer.jsx';
import '../assets/css/App.css';

function App() {
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState(window.innerHeight);

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
    <div className="App">
      <GetParam param="Brand.ProdFullName" />
      <VideoPlayer width={screenWidth} height={screenHeight} />
    </div>
  );
}

export default App;
