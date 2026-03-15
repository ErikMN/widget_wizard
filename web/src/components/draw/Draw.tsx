/* Draw
 *
 * Drawer content for the draw route.
 * Keep this wrapper light and let DrawControls own the feature UI.
 */
import React, { useEffect, useRef } from 'react';
import { useOnScreenMessage } from '../context/OnScreenMessageContext';
import DrawControls from './DrawControls';
/* MUI */
import Box from '@mui/material/Box';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';

const Draw: React.FC = () => {
  /* Global state */
  const { showMessage } = useOnScreenMessage();

  /* Refs */
  const drawHelpShownRef = useRef(false);

  /* Show on-screen message help message each time draw mode is entered */
  useEffect(() => {
    if (drawHelpShownRef.current) {
      return;
    }
    drawHelpShownRef.current = true;
    showMessage({
      title: 'Draw Mode',
      icon: <BrushOutlinedIcon fontSize="small" />,
      content: (
        <div>
          <div style={{ marginBottom: '8px' }}>
            Draw directly over the video surface with the selected brush or
            eraser.
          </div>
          <div style={{ marginBottom: '8px' }}>
            Change color and brush size in the drawer. The drawing scales with
            the video area.
          </div>
          <div>
            Save export the drawing as a PNG at the current stream resolution.
          </div>
        </div>
      ),
      duration: 10000
    });
  }, [showMessage]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}
    >
      <DrawControls />
    </Box>
  );
};

export default Draw;
