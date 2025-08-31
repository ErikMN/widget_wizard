import React from 'react';
/* MUI */
import { Stack, Tooltip, IconButton, Divider } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GestureIcon from '@mui/icons-material/Gesture';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import UndoIcon from '@mui/icons-material/Undo';

interface DrawModeProps {
  active: boolean;
  onToggle: () => void;
  onUndo: () => void;
  onClear: () => void;
  onSave: () => void;
}

const DrawMode: React.FC<DrawModeProps> = ({
  active,
  onToggle,
  onUndo,
  onClear,
  onSave
}) => {
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
      <Divider orientation="vertical" flexItem />
      <Tooltip title="Undo last stroke" arrow>
        <span>
          <IconButton onClick={onUndo} aria-label="undo" disabled={!active}>
            <UndoIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Clear all" arrow>
        <span>
          <IconButton onClick={onClear} aria-label="clear" disabled={!active}>
            <DeleteOutlineIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Save drawing as SVG" arrow>
        <span>
          <IconButton onClick={onSave} aria-label="save" disabled={!active}>
            <SaveAltIcon />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
};

export default DrawMode;
