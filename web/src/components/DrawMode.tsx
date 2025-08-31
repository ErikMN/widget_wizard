import React from 'react';
/* MUI */
import { Stack, Tooltip, IconButton } from '@mui/material';
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
        <IconButton
          color={active ? 'secondary' : 'default'}
          onClick={onToggle}
          aria-label="toggle draw"
        >
          {active ? <StopCircleIcon /> : <GestureIcon />}
        </IconButton>
      </Tooltip>
    </Stack>
  );
};

export default DrawMode;
