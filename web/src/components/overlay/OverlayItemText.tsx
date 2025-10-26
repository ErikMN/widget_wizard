/*
 * OverlayItemText: Renders an individual text overlay.
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useOverlayContext } from './OverlayContext';
import { TextOverlay } from './overlayInterfaces';
import { CustomButton } from '../CustomComponents';
import { playSound } from '../../helpers/utils';
import messageSoundUrl from '../../assets/audio/message.oga';
/* MUI */
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import DeleteIcon from '@mui/icons-material/Delete';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import Typography from '@mui/material/Typography';
import UpdateIcon from '@mui/icons-material/Update';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface OverlayItemTextProps {
  overlay: TextOverlay;
  index: number;
  isOpen: boolean;
  toggleDropdown: (index: number) => void;
}

const OverlayItemText: React.FC<OverlayItemTextProps> = ({
  overlay,
  index,
  isOpen,
  toggleDropdown
}) => {
  /* Global state */
  const { removeOverlay, updateTextOverlay, activeDraggableOverlay } =
    useOverlayContext();

  /* Local state */
  const [text, setText] = useState(overlay.text ?? '');
  const [textColor, setTextColor] = useState(overlay.textColor ?? 'white');
  const [textBGColor, setTextBGColor] = useState(
    overlay.textBGColor ?? 'transparent'
  );
  const [textOLColor, setTextOLColor] = useState(
    overlay.textOLColor ?? 'black'
  );
  const [fontSize, setFontSize] = useState(overlay.fontSize ?? 100);
  const [rotation, setRotation] = useState(overlay.rotation ?? 0);
  const [reference, setReference] = useState(overlay.reference ?? 'channel');
  const [openDialog, setOpenDialog] = useState<boolean>(false);

  const [position, setPosition] = useState<
    'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'custom'
  >(
    typeof overlay.position === 'string' &&
      ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(
        overlay.position
      )
      ? (overlay.position as any)
      : 'custom'
  );

  /* Remember last known custom numeric position */
  const [customPosition, setCustomPosition] = useState<[number, number] | null>(
    Array.isArray(overlay.position) ? overlay.position : null
  );

  useEffect(() => {
    if (Array.isArray(overlay.position)) {
      setPosition('custom');
      setCustomPosition(overlay.position);
    }
  }, [overlay.position]);

  const label = useMemo(() => `Text #${overlay.identity}`, [overlay.identity]);

  const handleUpdate = useCallback(() => {
    let positionToUse: any = position;
    if (position === 'custom') {
      positionToUse = customPosition ?? overlay.position;
    }

    const updated: TextOverlay = {
      ...overlay,
      text,
      textColor,
      textBGColor,
      textOLColor,
      fontSize: Number(fontSize),
      reference,
      position: positionToUse
    };

    /* NOTE: Only include rotation if backend supports it */
    if ('rotation' in overlay) {
      updated.rotation = Number(rotation);
    }

    updateTextOverlay(updated);
  }, [
    overlay,
    text,
    textColor,
    textBGColor,
    textOLColor,
    fontSize,
    rotation,
    reference,
    position,
    customPosition,
    updateTextOverlay
  ]);

  const handleRemoveClick = useCallback(() => {
    setOpenDialog(true);
    playSound(messageSoundUrl);
  }, []);

  const handleDialogClose = useCallback(() => {
    setOpenDialog(false);
  }, []);

  const handleConfirmRemove = useCallback(() => {
    removeOverlay(overlay.identity);
    setOpenDialog(false);
  }, [overlay.identity, removeOverlay]);

  return (
    <Box key={overlay.identity} sx={{ marginBottom: 1.8 }}>
      {/* Header button */}
      <CustomButton
        variant="outlined"
        fullWidth
        onClick={() => toggleDropdown(index)}
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 1,
          color: 'text.primary',
          backgroundColor:
            (activeDraggableOverlay?.id === overlay.identity &&
              activeDraggableOverlay?.active) ||
            isOpen
              ? 'primary.light'
              : 'unset',
          borderColor:
            (activeDraggableOverlay?.id === overlay.identity &&
              activeDraggableOverlay?.active) ||
            isOpen
              ? 'primary.main'
              : 'grey.600',
          borderBottomLeftRadius: isOpen ? '0px' : '4px',
          borderBottomRightRadius: isOpen ? '0px' : '4px',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
          ...(theme.palette.mode === 'dark'
            ? { textShadow: '0px 1px 4px rgba(0,0,0,0.8)' }
            : { textShadow: '0px 1px 2px rgba(255,255,255,0.8)' })
        })}
        startIcon={<TextFieldsIcon color="primary" />}
        endIcon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      >
        <Typography
          variant="subtitle2"
          sx={{ marginRight: '12px', fontWeight: 'bold' }}
        >
          {label}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          title={text || 'Empty text'}
        >
          {text || 'Empty text'}
        </Typography>
      </CustomButton>

      {/* Expanded section */}
      <Collapse in={isOpen}>
        <Box
          sx={(theme) => ({
            backgroundColor: theme.palette.background.default,
            padding: '12px',
            border: `1px solid ${theme.palette.grey[600]}`,
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            marginTop: 0
          })}
        >
          <TextField
            fullWidth
            label="Text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            sx={{
              mb: 1.5,
              '& .MuiInputBase-root': { height: '40px' }
            }}
          />

          {/* Position selector */}
          <FormControl fullWidth sx={{ mb: 1.5 }}>
            <InputLabel
              id={`position-${overlay.identity}`}
              sx={{ top: '-4px' }}
            >
              Position
            </InputLabel>
            <Select
              labelId={`position-${overlay.identity}`}
              value={position}
              label="Position"
              onChange={(e) =>
                setPosition(
                  e.target.value as
                    | 'topLeft'
                    | 'topRight'
                    | 'bottomLeft'
                    | 'bottomRight'
                    | 'custom'
                )
              }
              sx={{
                height: '40px',
                '& .MuiOutlinedInput-root': { height: '100%' }
              }}
            >
              <MenuItem value="topLeft">Top Left</MenuItem>
              <MenuItem value="topRight">Top Right</MenuItem>
              <MenuItem value="bottomLeft">Bottom Left</MenuItem>
              <MenuItem value="bottomRight">Bottom Right</MenuItem>
              <MenuItem value="custom">Custom</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
            <TextField
              fullWidth
              type="number"
              label="Font size"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              sx={{
                '& .MuiInputBase-root': { height: '40px' }
              }}
            />

            {/* NOTE: Only render rotation input if backend supports it */}
            {'rotation' in overlay && (
              <TextField
                fullWidth
                label="Rotation"
                type="number"
                value={rotation}
                onChange={(e) => setRotation(parseFloat(e.target.value))}
                sx={{
                  '& .MuiInputBase-root': { height: '40px' }
                }}
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
            <TextField
              fullWidth
              label="Text color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              sx={{
                '& .MuiInputBase-root': { height: '40px' }
              }}
            />
            <TextField
              fullWidth
              label="Outline color"
              value={textOLColor}
              onChange={(e) => setTextOLColor(e.target.value)}
              sx={{
                '& .MuiInputBase-root': { height: '40px' }
              }}
            />
          </Box>

          <TextField
            fullWidth
            label="Background color"
            value={textBGColor}
            onChange={(e) => setTextBGColor(e.target.value)}
            sx={{
              mb: 1.5,
              '& .MuiInputBase-root': { height: '40px' }
            }}
          />

          <FormControl fullWidth sx={{ mb: 1.5 }}>
            <InputLabel
              id={`reference-${overlay.identity}`}
              sx={{ top: '-4px' }}
            >
              Reference
            </InputLabel>
            <Select
              labelId={`reference-${overlay.identity}`}
              value={reference}
              label="Reference"
              onChange={(e) => setReference(e.target.value)}
              sx={{
                height: '40px',
                '& .MuiOutlinedInput-root': { height: '100%' }
              }}
            >
              <MenuItem value="channel">Channel</MenuItem>
              <MenuItem value="time">Time</MenuItem>
              <MenuItem value="date">Date</MenuItem>
            </Select>
          </FormControl>

          {/* Action buttons */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1.5,
              mt: 2
            }}
          >
            <CustomButton
              color="error"
              variant="contained"
              onClick={handleRemoveClick}
              startIcon={<DeleteIcon />}
              sx={{
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden'
              }}
            >
              Remove
            </CustomButton>
            <CustomButton
              color="primary"
              variant="contained"
              onClick={handleUpdate}
              startIcon={<UpdateIcon />}
              sx={{
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden'
              }}
            >
              Update
            </CustomButton>
          </Box>

          {/* Remove overlay confirmation dialog */}
          <Dialog
            open={openDialog}
            onClose={(event, reason) => {
              if (reason === 'backdropClick') return;
              handleDialogClose();
            }}
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
          >
            <DialogTitle id="alert-dialog-title">
              <Box display="flex" alignItems="center">
                <WarningAmberIcon style={{ marginRight: '8px' }} />
                {`Remove Text Overlay`}
              </Box>
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="alert-dialog-description">
                Are you sure you want to remove this text overlay? This action
                cannot be undone.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <CustomButton
                variant="outlined"
                onClick={handleDialogClose}
                color="primary"
              >
                No
              </CustomButton>
              <CustomButton
                variant="contained"
                onClick={handleConfirmRemove}
                color="error"
                autoFocus
              >
                Yes
              </CustomButton>
            </DialogActions>
          </Dialog>
        </Box>
      </Collapse>
    </Box>
  );
};

export default OverlayItemText;
