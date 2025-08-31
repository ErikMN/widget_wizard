import React from 'react';
import { CustomStyledIconButton } from '../CustomComponents';
/* MUI */
import { Stack, Tooltip } from '@mui/material';
import GestureIcon from '@mui/icons-material/Gesture';
import StopCircleIcon from '@mui/icons-material/StopCircle';

interface DrawModeProps {
  active: boolean;
  onToggle: () => void;
  onUndo?: () => void;
  onClear?: () => void;
  onSave?: () => void;
}

const DrawMode: React.FC<DrawModeProps> = ({ active, onToggle }) => {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Tooltip title={active ? 'Stop drawing' : 'Start drawing'} arrow>
        <CustomStyledIconButton
          color={active ? 'error' : 'default'}
          onClick={onToggle}
          aria-label="toggle draw"
        >
          {active ? <StopCircleIcon /> : <GestureIcon />}
        </CustomStyledIconButton>
      </Tooltip>
    </Stack>
  );
};

export default DrawMode;
