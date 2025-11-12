/*
 * OverlayItemImage: Renders an individual image overlay.
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useOverlayContext } from './OverlayContext';
import { useAppContext } from '../AppContext';
import { ImageOverlay } from './overlayInterfaces';
import { CustomButton, CustomStyledIconButton } from '../CustomComponents';
import { playSound } from '../../helpers/utils';
import messageSoundUrl from '../../assets/audio/message.oga';
import CodeEditor from '@uiw/react-textarea-code-editor';
import rehypePrism from 'rehype-prism-plus';
import ReactJson from 'react-json-view';
/* MUI */
import { useTheme } from '@mui/material/styles';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import DataObjectIcon from '@mui/icons-material/DataObject';
import DeleteIcon from '@mui/icons-material/Delete';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FormControl from '@mui/material/FormControl';
import ImageIcon from '@mui/icons-material/Image';
import InputLabel from '@mui/material/InputLabel';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import '../../assets/css/prism-theme.css';

const OverlayItemImage: React.FC<{
  overlay: ImageOverlay;
  index: number;
  isOpen: boolean;
  toggleDropdown: (index: number) => void;
}> = ({ overlay, index, isOpen, toggleDropdown }) => {
  /* Global state */
  const {
    removeOverlay,
    updateImageOverlay,
    imageFiles,
    activeDraggableOverlay,
    setActiveDraggableOverlay
  } = useOverlayContext();

  const { jsonTheme, appSettings } = useAppContext();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  /* Local state */
  const [selectedImage, setSelectedImage] = useState(overlay.overlayPath);
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

  /* Sync position from context safely */
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

  const label = useMemo(
    () => overlay.overlayPath.split('/').pop() ?? 'Image',
    [overlay]
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let positionToUse: any =
      position === 'custom' ? (customPosition ?? overlay.position) : position;

    const updated: ImageOverlay = {
      ...overlay,
      overlayPath: selectedImage,
      position: positionToUse
    };

    /* Prevent infinite spam if values didn’t change */
    if (JSON.stringify(updated) !== JSON.stringify(overlay)) {
      updateImageOverlay(updated);
    }
  }, [isReady, selectedImage, position, customPosition, overlay.identity]);

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
  const [jsonVisible, setJsonVisible] = useState<boolean>(false);
  const [useJsonEditorPro, setUseJsonEditorPro] = useState(false);
  const [jsonInput, setJsonInput] = useState<string>(
    JSON.stringify(overlay, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonInput(JSON.stringify(overlay, null, 2));
    setJsonError(null);
  }, [overlay]);

  const codeStyles: Record<string, string> = useMemo(
    () => ({
      '--json-key': isDarkMode ? '#ffcb6b' : '#d35400',
      '--json-string': isDarkMode ? '#c3e88d' : '#388e3c',
      '--json-number': isDarkMode ? '#f78c6c' : '#d80080',
      '--json-boolean': isDarkMode ? '#82aaff' : '#1565c0',
      '--json-null': isDarkMode ? '#ff5370' : '#c62828',
      '--json-punctuation': isDarkMode ? '#89ddff' : '#546e7a',
      '--json-operator': isDarkMode ? '#ff9cac' : '#ff6f61',
      '--background': theme.palette.background.paper,
      '--text-color': theme.palette.text.primary,
      '--border-color': jsonError ? '#d32f2f' : theme.palette.divider
    }),
    [isDarkMode, theme, jsonError]
  );

  const safeParseJson = (json: string) => {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const toggleJsonVisibility = useCallback(() => {
    setJsonVisible((prev) => !prev);
  }, []);

  const toggleJsonEditor = useCallback(() => {
    setUseJsonEditorPro((prev) => !prev);
  }, []);

  const handleJsonChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonInput(event.target.value);
  };

  const handleUpdateJSON = useCallback(() => {
    const parsed = safeParseJson(jsonInput);
    if (parsed == null) {
      setJsonError('Invalid JSON format');
      return;
    }
    if (parsed.identity == null) {
      parsed.identity = overlay.identity;
    }

    setJsonError(null);
    updateImageOverlay(parsed as ImageOverlay);

    /* Keep UI state in sync with JSON */
    setSelectedImage(parsed.overlayPath ?? overlay.overlayPath);

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
      setCustomPosition(null);
    }
  }, [jsonInput, overlay.identity, updateImageOverlay, overlay.overlayPath]);

  return (
    <Box key={overlay.identity} sx={{ marginBottom: 1.4 }}>
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
        startIcon={<ImageIcon color="primary" />}
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
          title={`Image Overlay (ID: ${overlay.identity}) ${label}`}
        >
          {/* Title and ID chip */}
          <Typography
            variant="subtitle2"
            sx={{ marginRight: '12px', fontWeight: 'bold' }}
          >
            Image Overlay
          </Typography>
          <Chip
            label={`ID: ${overlay.identity}`}
            size="small"
            sx={{ fontWeight: 'bold', marginRight: '12px' }}
          />
          {/* File name */}
          <Typography
            variant="body2"
            color="text.secondary"
            noWrap
            sx={{ flexShrink: 0 }}
          >
            {label}
          </Typography>
        </div>
      </CustomButton>

      <Collapse in={isOpen}>
        <Box
          sx={(theme) => ({
            backgroundColor: theme.palette.background.default,
            padding: '10px',
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
            <Typography variant="h6">Image parameters</Typography>
            <Tooltip title="Highlight Image" arrow placement="top">
              <div>
                <CustomStyledIconButton
                  width="32px"
                  height="32px"
                  aria-label="highlight-image"
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

          {/* Image selector */}
          <FormControl fullWidth sx={{ mb: 1.5 }}>
            <InputLabel
              id={`image-select-${overlay.identity}`}
              sx={{ top: '-4x' }}
            >
              Image
            </InputLabel>
            <Select
              labelId={`image-select-${overlay.identity}`}
              value={selectedImage}
              label="Image"
              onChange={(e) => setSelectedImage(e.target.value)}
              sx={{
                height: '40px',
                '& .MuiOutlinedInput-root': { height: '100%' }
              }}
            >
              {imageFiles.length > 0 ? (
                imageFiles.map((path, idx) => (
                  <MenuItem key={idx} value={path}>
                    {path.split('/').pop()}
                  </MenuItem>
                ))
              ) : (
                <MenuItem disabled>No images available</MenuItem>
              )}
            </Select>
          </FormControl>

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

          {/* JSON editor */}
          <CustomButton
            variant={jsonVisible ? 'contained' : 'outlined'}
            fullWidth
            onClick={toggleJsonVisibility}
            startIcon={<DataObjectIcon />}
            endIcon={jsonVisible ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{
              color: 'text.secondary',
              backgroundColor: 'background.default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 1,
              marginTop: 2,
              marginBottom: 1,
              height: '32px',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden'
            }}
          >
            {jsonVisible ? 'Hide JSON editor' : 'Show JSON editor'}
          </CustomButton>

          <Collapse in={jsonVisible}>
            {!useJsonEditorPro ? (
              <div style={codeStyles}>
                <CodeEditor
                  value={jsonInput}
                  onChange={handleJsonChange}
                  language="json"
                  data-color-mode={isDarkMode ? 'dark' : 'light'}
                  className="custom-json-theme"
                  style={{
                    color: theme.palette.text.primary,
                    backgroundColor: isDarkMode
                      ? theme.palette.background.paper
                      : '#ffffe6',
                    marginTop: 8,
                    width: '100%',
                    fontSize: 14,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace',
                    borderRadius: 8,
                    border: jsonError
                      ? '1px solid red'
                      : `1px solid ${theme.palette.background.paper}`
                  }}
                  rehypePlugins={[[rehypePrism, { ignoreMissing: true }]]}
                  placeholder="JSON"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
            ) : (
              <ReactJson
                src={safeParseJson(jsonInput)}
                onEdit={(edit) =>
                  setJsonInput(JSON.stringify(edit.updated_src, null, 2))
                }
                onAdd={(add) =>
                  setJsonInput(JSON.stringify(add.updated_src, null, 2))
                }
                onDelete={(del) =>
                  setJsonInput(JSON.stringify(del.updated_src, null, 2))
                }
                enableClipboard={false}
                displayDataTypes={false}
                theme={jsonTheme as any}
              />
            )}
            {jsonError && (
              <Alert severity="error" sx={{ marginTop: 1 }}>
                {jsonError}
              </Alert>
            )}
            {appSettings.debug && (
              <CustomButton
                onClick={toggleJsonEditor}
                variant="contained"
                startIcon={<ImageIcon />}
                sx={{ marginTop: 1, width: '100%', height: '30px' }}
              >
                {useJsonEditorPro ? 'JSON editor' : 'JSON editor PRO'}
              </CustomButton>
            )}
            <CustomButton
              onClick={handleUpdateJSON}
              variant="outlined"
              startIcon={<DataObjectIcon />}
              sx={{ marginTop: 1, marginRight: 1, width: '100%' }}
            >
              Update Overlay
            </CustomButton>
          </Collapse>

          {/* Action buttons */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 1.5,
              mt: 2
            }}
          >
            <CustomButton
              color="error"
              variant="contained"
              onClick={handleRemoveClick}
              startIcon={<DeleteIcon />}
            >
              Remove
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
                Remove Image Overlay
              </Box>
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="alert-dialog-description">
                Are you sure you want to remove this image overlay? This action
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

export default OverlayItemImage;
