import React from 'react';
import { CustomStyledIconButton } from '../CustomComponents';
import { useGlobalContext } from '../GlobalContext';
/* MUI */
import { Stack, Tooltip } from '@mui/material';
import GestureIcon from '@mui/icons-material/Gesture';
import StopCircleIcon from '@mui/icons-material/StopCircle';

const DrawMode: React.FC = () => {
  const { drawActive, toggle } = useGlobalContext();

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Tooltip title={drawActive ? 'Stop drawing' : 'Start drawing'} arrow>
        <CustomStyledIconButton
          color={drawActive ? 'error' : 'default'}
          onClick={toggle}
          aria-label="toggle draw"
        >
          {drawActive ? <StopCircleIcon /> : <GestureIcon />}
        </CustomStyledIconButton>
      </Tooltip>
    </Stack>
  );
};

export default DrawMode;
