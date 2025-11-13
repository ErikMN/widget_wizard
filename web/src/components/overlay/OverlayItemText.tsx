/*
 * OverlayItemText: Renders an individual text overlay.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useOverlayContext } from './OverlayContext';
import { TextOverlay } from './overlayInterfaces';
import { CustomButton, CustomStyledIconButton } from '../CustomComponents';
import { playSound } from '../../helpers/utils';
import { useDebouncedValue } from '../../helpers/hooks';
import messageSoundUrl from '../../assets/audio/message.oga';
import JsonEditor from '../JsonEditor';
/* MUI */
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
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
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import '../../assets/css/prism-theme.css';

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
  const {
    removeOverlay,
    updateTextOverlay,
    activeDraggableOverlay,
    setActiveDraggableOverlay
  } = useOverlayContext();

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

  /* HACK: Prevent update loop on mount */
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    setIsReady(true);
  }, []);

  /* Sync position from context when overlay.position changes */
  useEffect(() => {
    if (Array.isArray(overlay.position)) {
      const pos = overlay.position as [number, number];
      setPosition('custom');
      setCustomPosition((prev) => {
        if (!prev || prev[0] !== pos[0] || prev[1] !== pos[1]) {
          return pos;
        }
        return prev;
      });
    } else if (
      typeof overlay.position === 'string' &&
      ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(
        overlay.position
      )
    ) {
      setPosition(overlay.position as any);
    } else if (typeof overlay.position === 'string') {
      /* Any other string is treated as "custom" */
      setPosition('custom');
    }
  }, [overlay.position]);

  /* Sync rotation from context when overlay.rotation changes */
  useEffect(() => {
    if ('rotation' in overlay && typeof overlay.rotation === 'number') {
      setRotation(overlay.rotation);
    }
  }, [overlay.rotation]);

  /* Debounced overlay updates */
  const debouncedText = useDebouncedValue(text, 300);
  const debouncedFontSize = useDebouncedValue(fontSize, 300);
  const debouncedRotation = useDebouncedValue(rotation, 300);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let positionToUse: any =
      position === 'custom' ? (customPosition ?? overlay.position) : position;

    const updated: TextOverlay = {
      ...overlay,
      text: debouncedText,
      textColor: textColor,
      textBGColor: textBGColor,
      textOLColor: textOLColor,
      fontSize: Number(debouncedFontSize),
      reference: reference,
      position: positionToUse
    };

    if ('rotation' in overlay) {
      updated.rotation = Number(debouncedRotation);
    }

    /* Prevent infinite spam if values didn’t change */
    if (JSON.stringify(updated) !== JSON.stringify(overlay)) {
      updateTextOverlay(updated);
    }
  }, [
    isReady,
    debouncedText,
    textColor,
    textBGColor,
    textOLColor,
    debouncedFontSize,
    debouncedRotation,
    reference,
    position,
    customPosition,
    overlay.identity
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

  /* JSON editor */
  const [jsonInput, setJsonInput] = useState<string>(
    JSON.stringify(overlay, null, 2)
  );
  const [parsedJSON, setParsedJSON] = useState<any | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonInput(JSON.stringify(overlay, null, 2));
    setJsonError(null);
  }, [overlay]);

  const handleUpdateJSON = useCallback(() => {
    const parsed = parsedJSON;
    if (parsed == null) {
      setJsonError('Invalid JSON format');
      return;
    }
    if (parsed.identity == null) {
      parsed.identity = overlay.identity;
    }
    setJsonError(null);
    updateTextOverlay(parsed as TextOverlay);

    /* Keep UI state in sync with JSON */
    setText(parsed.text ?? '');
    setTextColor(parsed.textColor ?? 'white');
    setTextBGColor(parsed.textBGColor ?? 'transparent');
    setTextOLColor(parsed.textOLColor ?? 'black');
    setFontSize(parsed.fontSize ?? 100);
    setReference(parsed.reference ?? 'channel');
    if ('rotation' in parsed) {
      setRotation(parsed.rotation ?? 0);
    }

    if (Array.isArray(parsed.position)) {
      setPosition('custom');
      setCustomPosition(parsed.position);
    } else if (
      typeof parsed.position === 'string' &&
      ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(
        parsed.position
      )
    ) {
      setPosition(parsed.position);
    }
  }, [jsonInput, overlay.identity, updateTextOverlay]);

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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flex: 1,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
          title={`Text Overlay (ID: ${overlay.identity}) ${text || 'Empty text'}`}
        >
          {/* Title and ID chip */}
          <Typography
            variant="subtitle2"
            sx={{ marginRight: '12px', fontWeight: 'bold' }}
          >
            Text Overlay
          </Typography>
          <Chip
            label={`ID: ${overlay.identity}`}
            size="small"
            sx={{ fontWeight: 'bold', marginRight: '12px' }}
          />
          {/* Overlay text */}
          <Typography
            variant="body2"
            color="text.secondary"
            noWrap
            sx={{ flexShrink: 0 }}
          >
            {text || 'Empty text'}
          </Typography>
        </div>
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
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1
            }}
          >
            <Typography variant="h6">Text parameters</Typography>
            <Tooltip title="Highlight Text" arrow placement="top">
              <div>
                <CustomStyledIconButton
                  width="32px"
                  height="32px"
                  aria-label="highlight-text"
                  onMouseDown={() =>
                    setActiveDraggableOverlay({
                      id: overlay.identity,
                      active: false,
                      highlight: true
                    })
                  }
                  onMouseUp={() =>
                    setActiveDraggableOverlay((prev) => ({
                      ...prev,
                      highlight: false
                    }))
                  }
                  onMouseLeave={() =>
                    setActiveDraggableOverlay((prev) => ({
                      ...prev,
                      highlight: false
                    }))
                  }
                  onTouchStart={() =>
                    setActiveDraggableOverlay({
                      id: overlay.identity,
                      active: false,
                      highlight: true
                    })
                  }
                  onTouchEnd={() =>
                    setActiveDraggableOverlay((prev) => ({
                      ...prev,
                      highlight: false
                    }))
                  }
                >
                  {activeDraggableOverlay?.id === overlay.identity &&
                  activeDraggableOverlay?.highlight ? (
                    <LightbulbIcon />
                  ) : (
                    <LightbulbOutlinedIcon />
                  )}
                </CustomStyledIconButton>
              </div>
            </Tooltip>
          </Box>

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
            <FormControl fullWidth>
              <InputLabel
                id={`text-color-${overlay.identity}`}
                sx={{ top: '-4px' }}
              >
                Text color
              </InputLabel>
              <Select
                labelId={`text-color-${overlay.identity}`}
                value={textColor}
                label="Text color"
                onChange={(e) => setTextColor(e.target.value)}
                sx={{
                  height: '40px',
                  '& .MuiOutlinedInput-root': { height: '100%' }
                }}
              >
                <MenuItem value="black">Black</MenuItem>
                <MenuItem value="white">White</MenuItem>
                <MenuItem value="red">Red</MenuItem>
                <MenuItem value="transparent">Transparent</MenuItem>
                <MenuItem value="semiTransparent">Semi transparent</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel
                id={`outline-color-${overlay.identity}`}
                sx={{ top: '-4px' }}
              >
                Outline color
              </InputLabel>
              <Select
                labelId={`outline-color-${overlay.identity}`}
                value={textOLColor}
                label="Outline color"
                onChange={(e) => setTextOLColor(e.target.value)}
                sx={{
                  height: '40px',
                  '& .MuiOutlinedInput-root': { height: '100%' }
                }}
              >
                <MenuItem value="black">Black</MenuItem>
                <MenuItem value="white">White</MenuItem>
                <MenuItem value="red">Red</MenuItem>
                <MenuItem value="transparent">Transparent</MenuItem>
                <MenuItem value="semiTransparent">Semi transparent</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <FormControl fullWidth sx={{ mb: 1.5 }}>
            <InputLabel
              id={`background-color-${overlay.identity}`}
              sx={{ top: '-4px' }}
            >
              Background color
            </InputLabel>
            <Select
              labelId={`background-color-${overlay.identity}`}
              value={textBGColor}
              label="Background color"
              onChange={(e) => setTextBGColor(e.target.value)}
              sx={{
                height: '40px',
                '& .MuiOutlinedInput-root': { height: '100%' }
              }}
            >
              <MenuItem value="black">Black</MenuItem>
              <MenuItem value="white">White</MenuItem>
              <MenuItem value="red">Red</MenuItem>
              <MenuItem value="transparent">Transparent</MenuItem>
              <MenuItem value="semiTransparent">Semi transparent</MenuItem>
            </Select>
          </FormControl>

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

          {/* JSON editor */}
          <JsonEditor
            jsonInput={jsonInput}
            setJsonInput={setJsonInput}
            jsonError={jsonError}
            setJsonError={setJsonError}
            onUpdate={handleUpdateJSON}
            onParseJson={setParsedJSON}
            updateLabel="Update text overlay"
          />

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
          </Box>

          {/* Remove overlay confirmation dialog */}
          <Dialog
            open={openDialog}
            onClose={(event, reason) => {
              if (reason === 'backdropClick') {
                return;
              }
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
