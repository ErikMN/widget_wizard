/*
 * Overlay Wizard
 * OverlayHandler: Handler of overlays.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';
import { useOverlayContext } from './OverlayContext';
import OverlayBackupList from './OverlayBackupList';
import { loadOverlayBackups } from './overlayBackupStorage';
import OverlayItemImage from './OverlayItemImage';
import OverlayItemText from './OverlayItemText';
import OverlaysDisabled from './OverlaysDisabled';
import { CustomButton } from '../CustomComponents';
/* MUI */
import { green } from '@mui/material/colors';
import AddIcon from '@mui/icons-material/Add';
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
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

const OverlayHandler: React.FC = () => {
  /* Global state */
  const {
    overlaySupported,
    activeOverlays,
    activeOverlayId,
    onSelectOverlay,
    addImageOverlay,
    addTextOverlay,
    removeAllOverlays,
    listOverlayCapabilities,
    listOverlays,
    setActiveDraggableOverlay,
    imageFiles
  } = useOverlayContext();
  const { appSettings } = useAppContext();

  /* Local state */
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedType, setSelectedType] = useState<'image' | 'text'>('image');
  const [selectedImageFile, setSelectedImageFile] = useState<string>('');
  const [backupList, setBackupList] = useState(loadOverlayBackups());

  /* Component mount: Calls listOverlayCapabilities and listOverlays */
  useEffect(() => {
    const fetchData = async () => {
      await listOverlayCapabilities();
      await listOverlays();
    };
    fetchData();
  }, []);

  /* Keyboard Shift+Delete shortcut: remove all overlays (but not when typing) */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      /* Ignore if typing in input, textarea, or contenteditable */
      const target = event.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (isTyping) {
        return;
      }
      /* Do nothing if no overlays exist */
      if (activeOverlays.length === 0) {
        return;
      }
      /* Trigger only on Shift + Delete */
      if (!event.shiftKey || event.key !== 'Delete') {
        return;
      }
      /* Open remove-all dialog */
      setOpenDialog(true);
    };

    window.addEventListener('keydown', handleKeyDown);

    /* Unmount cleanup */
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeOverlays.length]);

  /* Toggle overlay expand/collapse */
  const toggleDropdown = useCallback(
    (identity: number) => {
      const newId = activeOverlayId === identity ? null : identity;

      onSelectOverlay(newId);

      setActiveDraggableOverlay({
        id: newId,
        active: false,
        highlight: false
      });
    },
    [activeOverlayId, onSelectOverlay, setActiveDraggableOverlay]
  );

  /* Remove all dialog */
  const handleRemoveAllClick = useCallback(() => {
    setOpenDialog(true);
  }, []);

  const handleDialogClose = () => setOpenDialog(false);

  const handleConfirmRemoveAll = () => {
    removeAllOverlays();
    setOpenDialog(false);
  };

  /* Handle add overlay click */
  const handleAddOverlay = useCallback(async () => {
    if (selectedType === 'image') {
      await addImageOverlay({ overlayPath: selectedImageFile });
    } else {
      await addTextOverlay({});
    }
  }, [selectedType, addImageOverlay, addTextOverlay, selectedImageFile]);

  /* Disable Add when creating image overlay without a selected file */
  const disableAdd =
    selectedType === 'image' && (!selectedImageFile || imageFiles.length === 0);

  if (!overlaySupported) {
    return <OverlaysDisabled />;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '6px'
      }}
    >
      {/* Add overlay section */}
      <Box sx={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
        <FormControl fullWidth variant="outlined">
          <InputLabel id="overlay-type-label" sx={{ top: '-4px' }}>
            Select overlay type
          </InputLabel>
          <Select
            labelId="overlay-type-label"
            id="overlay-type"
            value={selectedType}
            label="Select overlay type"
            onChange={(e) =>
              setSelectedType(e.target.value as 'image' | 'text')
            }
            sx={{
              height: '40px',
              '& .MuiOutlinedInput-root': { height: '100%' }
            }}
          >
            <MenuItem value="image">Image</MenuItem>
            <MenuItem value="text">Text</MenuItem>
          </Select>
        </FormControl>

        <Tooltip title="Add overlay" arrow placement="right">
          <div>
            <IconButton
              color="primary"
              aria-label="add overlay"
              onClick={handleAddOverlay}
              disableRipple
              disabled={disableAdd}
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

      {/* Dropdown for selecting image file (only when type=image) */}
      {selectedType === 'image' && (
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
          <FormControl fullWidth variant="outlined">
            <InputLabel id="image-file-label" sx={{ top: '-4px' }}>
              Select image file
            </InputLabel>
            <Select
              labelId="image-file-label"
              id="image-file"
              value={selectedImageFile}
              label="Select image file"
              onChange={(e) => setSelectedImageFile(e.target.value)}
              sx={{
                height: '40px',
                '& .MuiOutlinedInput-root': { height: '100%' }
              }}
            >
              {imageFiles.length > 0 ? (
                imageFiles.map((file) => (
                  <MenuItem key={file} value={file}>
                    {file}
                  </MenuItem>
                ))
              ) : (
                <MenuItem disabled>No image files available</MenuItem>
              )}
            </Select>
          </FormControl>
        </Box>
      )}

      {/* Global overlay backup list */}
      <OverlayBackupList
        backupList={backupList}
        setBackupList={setBackupList}
      />

      {/* Confirm Remove All Dialog */}
      <Dialog
        open={openDialog}
        onClose={(event, reason) => {
          if (reason === 'backdropClick') {
            return;
          }
          handleDialogClose();
        }}
        aria-labelledby="remove-overlays-title"
        aria-describedby="remove-overlays-description"
      >
        <DialogTitle id="remove-overlays-title">
          <Box display="flex" alignItems="center">
            <WarningAmberIcon sx={{ mr: 1 }} />
            Remove all overlays
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="remove-overlays-description">
            Are you sure you want to remove all overlays? This action cannot be
            undone.
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
            onClick={handleConfirmRemoveAll}
            color="error"
            autoFocus
          >
            Yes
          </CustomButton>
        </DialogActions>
      </Dialog>

      {/* List of Active Overlays */}
      <Box sx={{ marginTop: 2 }}>
        {activeOverlays
          .slice()
          .sort((a, b) => {
            let sortResult = 0;
            switch (appSettings.sortBy) {
              case 'id':
                sortResult = a.identity - b.identity;
                break;
              case 'type':
                const typeA = 'overlayPath' in a ? 'image' : 'text';
                const typeB = 'overlayPath' in b ? 'image' : 'text';
                sortResult = typeA.localeCompare(typeB);
                break;
              default:
                break;
            }
            return appSettings.sortAscending ? sortResult : -sortResult;
          })
          .map((overlay) => {
            const isOpen = overlay.identity === activeOverlayId;
            if ('overlayPath' in overlay) {
              /* Return Image overlay item */
              return (
                <OverlayItemImage
                  key={overlay.identity}
                  overlay={overlay}
                  isOpen={isOpen}
                  toggleDropdown={toggleDropdown}
                  onBackupRequested={() => setBackupList(loadOverlayBackups())}
                />
              );
            }
            /* Return Text overlay item */
            return (
              <OverlayItemText
                key={overlay.identity}
                overlay={overlay}
                isOpen={isOpen}
                toggleDropdown={toggleDropdown}
                onBackupRequested={() => setBackupList(loadOverlayBackups())}
              />
            );
          })}
      </Box>

      {/* Remove all overlays button */}
      <CustomButton
        color="error"
        variant="contained"
        onClick={handleRemoveAllClick}
        disabled={activeOverlays.length === 0}
        startIcon={<DeleteIcon />}
      >
        Remove all overlays
      </CustomButton>
    </Box>
  );
};

export default OverlayHandler;
