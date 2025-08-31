import React, { useEffect, useState } from 'react';
import type { DrawingOverlayHandle } from './DrawingOverlay';
import { CustomStyledIconButton, CustomSlider } from '../CustomComponents';
/* MUI */
import {
  Box,
  Stack,
  Tooltip,
  Divider,
  Typography,
  IconButton
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import UndoIcon from '@mui/icons-material/Undo';

/**
 * All brush state (color, width) lives here.
 * We push values to CSS vars so DrawingOverlay can read them dynamically.
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

const DrawControls: React.FC<DrawControlsProps> = ({ overlayRef, onExit }) => {
  const [strokeColor, setStrokeColor] = useState<string>('#00E5FF');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [uploading, setUploading] = useState<boolean>(false);

  /* Push brush settings to CSS variables so the overlay can read them. */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--draw-stroke', strokeColor);
    root.style.setProperty('--draw-width', String(strokeWidth));
  }, [strokeColor, strokeWidth]);

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
      console.warn(
        'exportPNG() not available on overlay. Ensure DrawingOverlay exposes this method.'
      );
      return;
    }

    try {
      setUploading(true);

      /* Get PNG from overlay */
      const pngBlob = await anyRef.exportPNG();
      if (!pngBlob) {
        console.warn('Failed to render overlay PNG.');
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

      /* POST to device-local CGI */
      const res = await fetch('/axis-cgi/uploadoverlayimage.cgi', {
        method: 'POST',
        body: form,
        credentials: 'include'
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('Upload failed:', res.status, text);
        return;
      }
    } catch (e) {
      console.error('Upload error', e);
    } finally {
      setUploading(false);
    }
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
              <CloudUploadIcon />
            </CustomStyledIconButton>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
};

export default DrawControls;
