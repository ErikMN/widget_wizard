import React from 'react';
import { CustomStyledIconButton } from '../CustomComponents';
import { useGlobalContext } from '../GlobalContext';
/* MUI */
import { Stack, Tooltip } from '@mui/material';
import GestureIcon from '@mui/icons-material/Gesture';
import StopCircleIcon from '@mui/icons-material/StopCircle';

const DrawMode: React.FC = () => {
  const { drawModeActive, toggleDrawMode } = useGlobalContext();

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Tooltip title={drawModeActive ? 'Stop drawing' : 'Start drawing'} arrow>
        <CustomStyledIconButton
          color={drawModeActive ? 'error' : 'default'}
          onClick={toggleDrawMode}
          aria-label="toggle draw"
        >
          {drawModeActive ? <StopCircleIcon /> : <GestureIcon />}
        </CustomStyledIconButton>
      </Tooltip>
    </Stack>
  );
};

export default DrawMode;
