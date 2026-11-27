/*
 * PrivacyMaskHandler: Drawer content for the privacy masks route.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppSettingsContext } from '../context/AppContext';
import { useOnScreenMessage } from '../context/OnScreenMessageContext';
import { useParameters } from '../context/ParametersContext';
import { useTabVisibility } from '../../helpers/hooks.jsx';
import { capitalizeFirstLetter } from '../../helpers/utils';
import { usePrivacyMaskContext } from './PrivacyMaskContext';
import { MASK_COLORS, MaskColor } from './privacyMaskInterfaces';
import { getRotatedSize } from './privacyMaskUtils';
import PrivacyMaskItem from './PrivacyMaskItem';
import PrivacyMasksDisabled from './PrivacyMasksDisabled';
import { CustomButton, CustomSlider } from '../CustomComponents';
/* MUI */
import { green } from '@mui/material/colors';
import AddIcon from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import DeleteIcon from '@mui/icons-material/Delete';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

const PrivacyMaskHandler: React.FC = () => {
  /* Global state */
  const {
    capabilities,
    frame,
    rotation,
    appearance,
    masks,
    selectedMaskId,
    setSelectedMaskId,
    streamSize,
    refresh,
    addMask,
    removeAllMasks,
    setAppearance
  } = usePrivacyMaskContext();
  const { appSettings } = useAppSettingsContext();
  const { showMessage } = useOnScreenMessage();
  const { paramsInitialized } = useParameters();

  /* Local state */
  const [openDialog, setOpenDialog] = useState(false);
  const [mosaicScale, setMosaicScale] = useState(appearance.mosaicScale);
  const helpShownRef = useRef(false);

  useEffect(() => {
    setMosaicScale(appearance.mosaicScale);
  }, [appearance.mosaicScale]);

  /* Fetch masks, rotation and appearance on mount and when the source changes */
  useEffect(() => {
    refresh();
  }, [refresh]);

  useTabVisibility(refresh);

  /* Deselect when leaving the route */
  useEffect(() => () => setSelectedMaskId(null), [setSelectedMaskId]);

  /* Show help on mount (only once) */
  useEffect(() => {
    if (helpShownRef.current) {
      return;
    }
    helpShownRef.current = true;
    showMessage({
      title: 'Privacy Masks',
      icon: <VisibilityOffIcon fontSize="small" />,
      content: (
        <div>
          <div style={{ marginBottom: '8px' }}>
            Click a mask to select it and drag to move it.
          </div>
          <div style={{ marginBottom: '8px' }}>
            Drag corners to reshape, drag edge midpoints to add corners and
            double-click a corner to remove it.
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Delete:</strong> Remove selected mask
          </div>
          <div>
            <strong>Shift + Delete:</strong> Remove all masks
          </div>
        </div>
      ),
      duration: 10000
    });
  }, [showMessage]);

  /* Keyboard Shift+Delete shortcut: remove all masks (but not when typing) */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (isTyping || masks.length === 0) {
        return;
      }
      if (!event.shiftKey || event.key !== 'Delete') {
        return;
      }
      setOpenDialog(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [masks.length]);

  const toggleDropdown = useCallback(
    (id: number) => {
      setSelectedMaskId(selectedMaskId === id ? null : id);
    },
    [selectedMaskId, setSelectedMaskId]
  );

  const handleConfirmRemoveAll = () => {
    removeAllMasks();
    setOpenDialog(false);
  };

  /* Wait for parameters before deciding support to avoid flashing a warning */
  if (!paramsInitialized) {
    return null;
  }

  if (!capabilities.supported || !frame) {
    return <PrivacyMasksDisabled />;
  }

  /* Streams are a center crop of the rotated sensor, so they must share its
   * orientation. A mismatch means the rotation could not be determined.
   */
  let orientationMismatch = false;
  if (
    streamSize &&
    streamSize.width > 0 &&
    streamSize.height > 0 &&
    streamSize.width !== streamSize.height
  ) {
    const rotated = getRotatedSize(frame, rotation);
    orientationMismatch =
      rotated.width > rotated.height !== streamSize.width > streamSize.height;
  }

  const maxReached = masks.length >= capabilities.maxMasks;

  const sortedMasks = masks.slice().sort((a, b) => {
    const result =
      appSettings.sortBy === 'type'
        ? a.name.localeCompare(b.name)
        : a.id - b.id;
    return appSettings.sortAscending ? result : -result;
  });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '6px'
      }}
    >
      {/* Mask color (applies to all masks) */}
      <Box sx={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
        <FormControl fullWidth variant="outlined">
          <InputLabel id="privacy-mask-color-label" sx={{ top: '-4px' }}>
            Mask color
          </InputLabel>
          <Select
            labelId="privacy-mask-color-label"
            id="privacy-mask-color"
            value={appearance.color}
            label="Mask color"
            onChange={(e) =>
              setAppearance({ color: e.target.value as MaskColor })
            }
            sx={{
              height: '40px',
              '& .MuiOutlinedInput-root': { height: '100%' }
            }}
          >
            {MASK_COLORS.map((color) => (
              <MenuItem key={color} value={color}>
                {capitalizeFirstLetter(color)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Tooltip
          title={
            maxReached
              ? `Maximum of ${capabilities.maxMasks} masks reached`
              : 'Add privacy mask'
          }
          arrow
          placement="right"
        >
          <div>
            <IconButton
              color="primary"
              aria-label="add privacy mask"
              onClick={() => addMask()}
              disableRipple
              disabled={maxReached}
              sx={{
                marginLeft: 1,
                backgroundColor: green[500],
                color: 'white',
                width: 40,
                height: 40,
                borderRadius: '8px',
                '&:hover': { backgroundColor: green[700] }
              }}
            >
              <AddIcon />
            </IconButton>
          </div>
        </Tooltip>
      </Box>

      {/* Mosaic scale */}
      {appearance.color === 'mosaic' && (
        <Box sx={{ mt: 1, px: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Mosaic scale: {mosaicScale}
          </Typography>
          <CustomSlider
            value={mosaicScale}
            min={appearance.mosaicScaleMin}
            max={appearance.mosaicScaleMax}
            step={1}
            marks
            valueLabelDisplay="auto"
            onChange={(_e, value) => setMosaicScale(value as number)}
            onChangeCommitted={(_e, value) =>
              setAppearance({ mosaicScale: value as number })
            }
          />
        </Box>
      )}

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 1, textAlign: 'center' }}
      >
        Masks: {masks.length} / {capabilities.maxMasks} · Max corners:{' '}
        {capabilities.maxCorners}
      </Typography>

      {orientationMismatch && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          The stream orientation does not match the image rotation. Mask
          positions shown on the video may be inaccurate.
        </Alert>
      )}

      {/* Confirm Remove All Dialog */}
      <Dialog
        open={openDialog}
        onClose={(_event, reason) => {
          if (reason === 'backdropClick') {
            return;
          }
          setOpenDialog(false);
        }}
        aria-labelledby="remove-masks-title"
        aria-describedby="remove-masks-description"
      >
        <DialogTitle id="remove-masks-title">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <WarningAmberIcon sx={{ mr: 1 }} />
            Remove all privacy masks
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="remove-masks-description">
            Are you sure you want to remove all privacy masks? This action
            cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <CustomButton
            variant="outlined"
            onClick={() => setOpenDialog(false)}
            color="primary"
          >
            No
          </CustomButton>
          <CustomButton
            variant="contained"
            onClick={handleConfirmRemoveAll}
            color="error"
            autoFocus
          >
            Yes
          </CustomButton>
        </DialogActions>
      </Dialog>

      {/* List of privacy masks */}
      <Box sx={{ marginTop: 2 }}>
        {sortedMasks.map((mask) => (
          <PrivacyMaskItem
            key={mask.id}
            mask={mask}
            isOpen={mask.id === selectedMaskId}
            toggleDropdown={toggleDropdown}
          />
        ))}
      </Box>

      {/* Remove all masks button */}
      <CustomButton
        color="error"
        variant="contained"
        onClick={() => setOpenDialog(true)}
        disabled={masks.length === 0}
        startIcon={<DeleteIcon />}
      >
        Remove all privacy masks
      </CustomButton>
    </Box>
  );
};

export default PrivacyMaskHandler;
