/*
 * OverlayItemImage: Renders an individual image overlay.
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useOverlayContext } from './OverlayContext';
import { ImageOverlay } from './overlayInterfaces';
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
import ImageIcon from '@mui/icons-material/Image';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import UpdateIcon from '@mui/icons-material/Update';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

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
    activeDraggableOverlay
  } = useOverlayContext();

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

  useEffect(() => {
    if (Array.isArray(overlay.position)) {
      setPosition('custom');
      setCustomPosition(overlay.position);
    }
  }, [overlay.position]);

  const label = useMemo(
    () => overlay.overlayPath.split('/').pop() ?? 'Image',
    [overlay]
  );

  const handleUpdate = useCallback(() => {
    let positionToUse: any = position;

    if (position === 'custom') {
      positionToUse = customPosition ?? overlay.position;
    }

    updateImageOverlay({
      ...overlay,
      overlayPath: selectedImage,
      position: positionToUse
    });
  }, [overlay, position, selectedImage, updateImageOverlay, customPosition]);

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
        startIcon={<ImageIcon color="primary" />}
        endIcon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
          Overlay #{overlay.identity}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {label}
        </Typography>
      </CustomButton>

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
          {/* Image selector */}
          <FormControl fullWidth sx={{ mb: 1.5 }}>
            <InputLabel
              id={`image-select-${overlay.identity}`}
              sx={{ top: '-4px' }}
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
            <CustomButton
              color="primary"
              variant="contained"
              onClick={handleUpdate}
              startIcon={<UpdateIcon />}
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
                {`Remove Image Overlay`}
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
