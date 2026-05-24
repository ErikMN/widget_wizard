/* DrawControls
 *
 * Control panel for draw mode.
 * Drawing tools should be exposed here and implemented in DrawCanvas.
 */
import React, { useCallback, useState } from 'react';
import { CustomButton, CustomCheckbox } from '../CustomComponents';
import { getBackendUploadUrl } from '../backend/getBackendUploadUrl';
import { useAlertActionsContext } from '../context/AppContext';
import { useParameters } from '../context/ParametersContext';
import { useDrawContext } from './DrawContext';
import { DRAW_BRUSH_SIZES, DRAW_COLORS } from './drawUtils';
/* MUI */
import BackspaceOutlinedIcon from '@mui/icons-material/BackspaceOutlined';
import Box from '@mui/material/Box';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import Divider from '@mui/material/Divider';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import FormControlLabel from '@mui/material/FormControlLabel';
import RedoOutlinedIcon from '@mui/icons-material/RedoOutlined';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';

/* Repeated uploads replace the same file on the backend. */
const DRAW_UPLOAD_FILENAME = 'draw.png';

const DrawControls: React.FC = () => {
  /* Global state */
  const { handleOpenAlert } = useAlertActionsContext();
  const { parameters } = useParameters();

  /* Shared draw state */
  const {
    activeTool,
    setActiveTool,
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    surfaceDimensions,
    hasDrawing,
    canUndo,
    canRedo,
    undoLastEdit,
    redoLastEdit,
    clearDrawing,
    createDrawingPngExport,
    saveDrawingAsPng
  } = useDrawContext();

  /* Local state */
  const [isUploading, setIsUploading] = useState(false);
  const [saveVideoImage, setSaveVideoImage] = useState(false);

  const handleSave = useCallback(() => {
    void saveDrawingAsPng({ includeVideoImage: saveVideoImage });
  }, [saveDrawingAsPng, saveVideoImage]);

  /* ApplicationRunning is yes only when the optional backend is running. */
  const backendRunning =
    parameters?.['root.Widget_wizard.ApplicationRunning'] === 'yes';

  const exportDisabled =
    !hasDrawing ||
    !surfaceDimensions ||
    surfaceDimensions.videoWidth <= 0 ||
    surfaceDimensions.videoHeight <= 0;

  const uploadDisabled = exportDisabled || !backendRunning || isUploading;

  const handleUpload = useCallback(async () => {
    if (!backendRunning || isUploading) {
      return;
    }

    setIsUploading(true);
    try {
      /* Reuse the same PNG export path as Save PNG. */
      const pngExport = await createDrawingPngExport({
        includeVideoImage: saveVideoImage
      });
      if (!pngExport) {
        return;
      }

      /* The backend expects one multipart field named file. */
      const formData = new FormData();
      formData.append('file', pngExport.blob, DRAW_UPLOAD_FILENAME);

      const response = await fetch(getBackendUploadUrl(), {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      handleOpenAlert('Drawing uploaded as PNG', 'success');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown upload error';
      handleOpenAlert(`Failed to upload drawing: ${message}`, 'error');
    } finally {
      setIsUploading(false);
    }
  }, [
    backendRunning,
    createDrawingPngExport,
    handleOpenAlert,
    isUploading,
    saveVideoImage
  ]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '6px',
        marginTop: 2
      }}
    >
      {/* Info box */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Draw mode (experimental feature)
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Draw directly on the video surface and export the drawing as a PNG
          file at the current stream resolution.
        </Typography>
      </Box>

      {/* Select drawing tool */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <CustomButton
          variant={activeTool === 'brush' ? 'contained' : 'outlined'}
          startIcon={<BrushOutlinedIcon />}
          fullWidth
          onClick={() => setActiveTool('brush')}
        >
          Brush
        </CustomButton>
        <CustomButton
          variant={activeTool === 'eraser' ? 'contained' : 'outlined'}
          startIcon={<BackspaceOutlinedIcon />}
          fullWidth
          onClick={() => setActiveTool('eraser')}
        >
          Eraser
        </CustomButton>
      </Box>

      <Divider />

      {/* Color palette buttons */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Color
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {DRAW_COLORS.map((color) => {
            const isActive = color === brushColor;

            return (
              <Tooltip key={color} title={color} arrow>
                <Box
                  component="button"
                  type="button"
                  aria-label={`Select draw color ${color}`}
                  onClick={() => setBrushColor(color)}
                  sx={(theme) => ({
                    width: 32,
                    height: 32,
                    padding: 0,
                    borderRadius: '50%',
                    border: isActive
                      ? `2px solid ${theme.palette.primary.main}`
                      : `2px solid ${theme.palette.divider}`,
                    backgroundColor: color,
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease',
                    boxShadow: theme.shadows[1],
                    '&:hover': {
                      transform: 'scale(1.08)'
                    }
                  })}
                />
              </Tooltip>
            );
          })}
        </Box>
      </Box>

      {/* Brush size controls */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Brush size
        </Typography>
        {/* Sizes are screen-space presets and converted to native video size in DrawCanvas */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {DRAW_BRUSH_SIZES.map((size) => {
            const isActive = size === brushSize;
            return (
              <CustomButton
                key={size}
                variant={isActive ? 'contained' : 'outlined'}
                onClick={() => setBrushSize(size)}
                sx={{
                  minWidth: 56,
                  fontWeight: isActive ? 700 : 500
                }}
              >
                {size}px
              </CustomButton>
            );
          })}
        </Box>
      </Box>

      <Divider />

      {/* Export size info box */}
      <Box
        sx={{
          p: 1.5,
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          backgroundColor: 'action.hover'
        }}
      >
        {/* Export uses native stream dimensions so the saved PNG matches the camera resolution */}
        <Typography variant="subtitle2">Export size</Typography>
        <Typography variant="body2" color="text.secondary">
          {surfaceDimensions &&
          surfaceDimensions.videoWidth > 0 &&
          surfaceDimensions.videoHeight > 0
            ? `${surfaceDimensions.videoWidth} x ${surfaceDimensions.videoHeight}px`
            : 'Waiting for the video stream dimensions...'}
        </Typography>
      </Box>

      {/* This option is shared by local save and backend upload. */}
      <FormControlLabel
        control={
          <CustomCheckbox
            checked={saveVideoImage}
            onChange={(event) => setSaveVideoImage(event.target.checked)}
          />
        }
        label="Save video image with drawing"
      />

      {/* Undo and redo buttons */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <CustomButton
          variant="outlined"
          fullWidth
          startIcon={<UndoOutlinedIcon />}
          onClick={undoLastEdit}
          disabled={!canUndo}
        >
          Undo
        </CustomButton>
        <CustomButton
          variant="outlined"
          fullWidth
          startIcon={<RedoOutlinedIcon />}
          onClick={redoLastEdit}
          disabled={!canRedo}
        >
          Redo
        </CustomButton>
      </Box>

      {/* Clear and save buttons */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <CustomButton
          variant="outlined"
          color="error"
          fullWidth
          startIcon={<DeleteOutlineIcon />}
          onClick={clearDrawing}
          disabled={!hasDrawing}
        >
          Clear
        </CustomButton>
        <CustomButton
          variant="contained"
          fullWidth
          startIcon={<DownloadOutlinedIcon />}
          onClick={handleSave}
          disabled={exportDisabled}
        >
          Save PNG
        </CustomButton>
      </Box>

      <CustomButton
        variant="outlined"
        fullWidth
        startIcon={<CloudUploadOutlinedIcon />}
        onClick={() => void handleUpload()}
        disabled={uploadDisabled}
      >
        {isUploading ? 'Uploading...' : 'Upload PNG'}
      </CustomButton>
    </Box>
  );
};

export default DrawControls;
