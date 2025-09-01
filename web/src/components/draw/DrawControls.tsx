import React, { useEffect, useState } from 'react';
import type { DrawingOverlayHandle } from './DrawingOverlay';
import { CustomStyledIconButton, CustomSlider } from '../CustomComponents';
import { useGlobalContext } from '../GlobalContext';
import { UO_CGI } from '../constants';
/* MUI */
import {
  Box,
  Stack,
  Tooltip,
  Divider,
  Typography,
  IconButton,
  CircularProgress
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GestureIcon from '@mui/icons-material/Gesture';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import UndoIcon from '@mui/icons-material/Undo';

/**
 * All brush/tool state lives here.
 * We push values to CSS variables so DrawingOverlay can read them dynamically.
 */
interface DrawControlsProps {
  overlayRef: React.RefObject<DrawingOverlayHandle | null>;
  onExit: () => void;
}

const COLORS = [
  '#00E5FF',
  '#FF5252',
  '#4CAF50',
  '#FFD600',
  '#FFFFFF',
  '#000000'
];

type Tool = 'freehand' | 'rect';

const DrawControls: React.FC<DrawControlsProps> = ({ overlayRef, onExit }) => {
  /* Local state */
  const [strokeColor, setStrokeColor] = useState<string>('#00E5FF');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [tool, setTool] = useState<Tool>('freehand');
  const [uploading, setUploading] = useState<boolean>(false);

  /* Global context */
  const { handleOpenAlert } = useGlobalContext();

  /* Push brush & tool settings to CSS variables so the overlay can read them. */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--draw-stroke', strokeColor);
    root.style.setProperty('--draw-width', String(strokeWidth));
    root.style.setProperty('--draw-tool', tool);
  }, [strokeColor, strokeWidth, tool]);

  const handleUndo = () => overlayRef.current?.undo?.();
  const handleClear = () => overlayRef.current?.clear?.();
  const handleSave = () => overlayRef.current?.saveSVG?.('annotation.svg');

  const handleUpload = async () => {
    const anyRef = overlayRef.current as
      | (DrawingOverlayHandle & {
          exportPNG?: () => Promise<Blob | null>;
        })
      | null;

    if (!anyRef?.exportPNG) {
      console.warn('exportPNG() not available on overlay.');
      handleOpenAlert('Export not supported by overlay', 'error');
      return;
    }

    try {
      setUploading(true);

      /* Get PNG from overlay */
      const pngBlob = await anyRef.exportPNG();
      if (!pngBlob) {
        handleOpenAlert('Failed to render overlay PNG', 'error');
        return;
      }

      /* Build form-data parts */
      const payload = {
        apiVersion: '1.0',
        method: 'uploadOverlayImage',
        params: { scaleToResolution: false }
      };
      const form = new FormData();
      form.append(
        'json',
        new Blob([JSON.stringify(payload)], { type: 'application/json' }),
        'request.json'
      );
      form.append('image', pngBlob, 'overlay.png');

      const res = await fetch(UO_CGI, {
        method: 'POST',
        body: form,
        credentials: 'include'
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('Upload failed:', res.status, text);
        handleOpenAlert(
          `Upload failed (${res.status}) ${text}`.trim(),
          'error'
        );
        return;
      }
      handleOpenAlert('Overlay uploaded successfully', 'success');
    } catch (e) {
      console.error('Upload error', e);
      handleOpenAlert('Upload error', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Typography variant="h6">Draw Controls</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {/* Tool switch: freehand or rectangle */}
          <Tooltip title="Freehand" arrow>
            <span>
              <CustomStyledIconButton
                onClick={() => setTool('freehand')}
                aria-label="tool freehand"
                color={tool === 'freehand' ? 'primary' : 'default'}
              >
                <GestureIcon />
              </CustomStyledIconButton>
            </span>
          </Tooltip>
          <Tooltip title="Rectangle (hold Shift for square)" arrow>
            <span>
              <CustomStyledIconButton
                onClick={() => setTool('rect')}
                aria-label="tool rectangle"
                color={tool === 'rect' ? 'primary' : 'default'}
              >
                <CropSquareIcon />
              </CustomStyledIconButton>
            </span>
          </Tooltip>

          <Tooltip title="Stop drawing" arrow>
            <CustomStyledIconButton
              color="error"
              onClick={onExit}
              aria-label="stop drawing"
            >
              <StopCircleIcon />
            </CustomStyledIconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {/* Colors */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Colors
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        {COLORS.map((c) => (
          <IconButton
            key={c}
            onClick={() => setStrokeColor(c)}
            sx={{
              bgcolor: c,
              border: strokeColor === c ? '2px solid #000' : '1px solid #888',
              width: 32,
              height: 32,
              '&:hover': { opacity: 0.85 }
            }}
            aria-label={`set color ${c}`}
          />
        ))}
      </Stack>

      {/* Brush size */}
      <Typography variant="subtitle2">Brush Size</Typography>
      <CustomSlider
        min={1}
        max={20}
        step={1}
        value={strokeWidth}
        onChange={(_, v) => setStrokeWidth(v as number)}
        sx={{ mb: 2 }}
        aria-label="brush size"
      />

      {/* Actions */}
      <Stack direction="row" spacing={1} alignItems="center">
        <Tooltip title="Undo last stroke" arrow>
          <span>
            <CustomStyledIconButton onClick={handleUndo} aria-label="undo">
              <UndoIcon />
            </CustomStyledIconButton>
          </span>
        </Tooltip>

        <Tooltip title="Clear all" arrow>
          <span>
            <CustomStyledIconButton onClick={handleClear} aria-label="clear">
              <DeleteOutlineIcon />
            </CustomStyledIconButton>
          </span>
        </Tooltip>

        <Tooltip title="Save drawing as SVG" arrow>
          <span>
            <CustomStyledIconButton onClick={handleSave} aria-label="save">
              <SaveAltIcon />
            </CustomStyledIconButton>
          </span>
        </Tooltip>

        {/* Upload as overlay */}
        <Tooltip title="Upload as overlay" arrow>
          <span>
            <CustomStyledIconButton
              onClick={handleUpload}
              aria-label="upload as overlay"
              disabled={uploading}
            >
              {uploading ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <CloudUploadIcon />
              )}
            </CustomStyledIconButton>
          </span>
        </Tooltip>

        {/* Reload app */}
        <Tooltip title="Reload app" arrow>
          <span>
            <CustomStyledIconButton
              onClick={handleReload}
              aria-label="reload app"
            >
              <RefreshIcon />
            </CustomStyledIconButton>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
};

export default DrawControls;
