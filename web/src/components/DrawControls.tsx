import React from 'react';
import type { DrawingOverlayHandle } from './DrawingOverlay';
import {
  Box,
  Stack,
  Tooltip,
  IconButton,
  Divider,
  Typography
} from '@mui/material';
/* MUI */
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import UndoIcon from '@mui/icons-material/Undo';

interface DrawControlsProps {
  overlayRef: React.RefObject<DrawingOverlayHandle | null>;
  onExit: () => void;
}

const DrawControls: React.FC<DrawControlsProps> = ({ overlayRef, onExit }) => {
  const handleUndo = () => overlayRef.current?.undo?.();
  const handleClear = () => overlayRef.current?.clear?.();
  const handleSave = () => overlayRef.current?.saveSVG?.('annotation.svg');

  return (
    <Box sx={{ p: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Typography variant="h6">Draw Controls</Typography>
        <Tooltip title="Stop drawing" arrow>
          <IconButton
            color="secondary"
            onClick={onExit}
            aria-label="stop drawing"
          >
            <StopCircleIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      <Stack direction="row" spacing={1} alignItems="center">
        <Tooltip title="Undo last stroke" arrow>
          <span>
            <IconButton onClick={handleUndo} aria-label="undo">
              <UndoIcon />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Clear all" arrow>
          <span>
            <IconButton onClick={handleClear} aria-label="clear">
              <DeleteOutlineIcon />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Save drawing as SVG" arrow>
          <span>
            <IconButton onClick={handleSave} aria-label="save">
              <SaveAltIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
};

export default DrawControls;
