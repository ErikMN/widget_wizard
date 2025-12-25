/*
 * OverlayBackupList: Backup and restore list for overlays.
 */
import React, { useState, useCallback } from 'react';
import {
  restoreOverlayBackup,
  deleteOverlayBackup,
  clearOverlayBackups
} from './overlayBackupStorage';
import { useOverlayContext } from './OverlayContext';
import { CustomButton, CustomStyledIconButton } from '../CustomComponents';
import { useAppContext } from '../AppContext';
import { MAX_LS_BACKUPS } from '../constants';
/* MUI */
import ArchiveIcon from '@mui/icons-material/Archive';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import DeleteIcon from '@mui/icons-material/Delete';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RestoreIcon from '@mui/icons-material/Restore';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

const OverlayBackupList: React.FC<{
  backupList: any[];
  setBackupList: (list: any[]) => void;
}> = ({ backupList, setBackupList }) => {
  /* Global context */
  const { duplicateOverlay } = useOverlayContext();
  const { handleOpenAlert } = useAppContext();

  /* Local state */
  const [isOpen, setIsOpen] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [openRestoreDialog, setOpenRestoreDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openDeleteMarkedDialog, setOpenDeleteMarkedDialog] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [visibleCheckbox, setVisibleCheckbox] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [marked, setMarked] = useState<Set<number>>(new Set());

  const toggleMarked = useCallback((index: number) => {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  /* Restore one backup */
  const handleRestore = useCallback(
    (index: number) => {
      const restored = restoreOverlayBackup(index);
      if (!restored) {
        return;
      }

      duplicateOverlay(restored);

      /* Parent manages the actual list */
      setBackupList([...backupList]);

      /* Selection of indices may no longer match: clear */
      setMarked(new Set());
      setExpandedIndex(null);

      handleOpenAlert('Backup restored', 'success');
    },
    [duplicateOverlay, backupList, setBackupList, handleOpenAlert]
  );

  /* Delete one backup */
  const handleDelete = useCallback(
    (index: number) => {
      deleteOverlayBackup(index);

      const updated = [...backupList];
      updated.splice(index, 1);
      setBackupList(updated);

      /* Selection of indices no longer valid: clear it */
      setMarked(new Set());
      setExpandedIndex(null);

      handleOpenAlert('Backup deleted', 'success');
    },
    [backupList, setBackupList, handleOpenAlert]
  );

  /* Delete all marked backups */
  const handleDeleteMarked = useCallback(() => {
    if (marked.size === 0) {
      return;
    }

    /* Delete from storage in descending index order so indices stay valid */
    const indices = Array.from(marked).sort((a, b) => b - a);
    indices.forEach((idx) => deleteOverlayBackup(idx));

    /* Update local list by filtering out marked indices */
    const updated = backupList.filter((_, idx) => !marked.has(idx));
    setBackupList(updated);

    setMarked(new Set());
    setExpandedIndex(null);

    handleOpenAlert('Marked backups deleted', 'success');
  }, [marked, backupList, setBackupList, handleOpenAlert]);

  const handleOpenRestoreDialog = useCallback((index: number) => {
    setSelectedIndex(index);
    setOpenRestoreDialog(true);
  }, []);

  const handleOpenDeleteDialog = useCallback((index: number) => {
    setSelectedIndex(index);
    setOpenDeleteDialog(true);
  }, []);

  const handleCloseRestoreDialog = useCallback(() => {
    setOpenRestoreDialog(false);
    setSelectedIndex(null);
  }, []);

  const handleCloseDeleteDialog = useCallback(() => {
    setOpenDeleteDialog(false);
    setSelectedIndex(null);
  }, []);

  const handleConfirmRestore = useCallback(() => {
    if (selectedIndex == null) {
      return;
    }
    handleRestore(selectedIndex);
    setOpenRestoreDialog(false);
    setSelectedIndex(null);
  }, [selectedIndex, handleRestore]);

  const handleConfirmDelete = useCallback(() => {
    if (selectedIndex == null) {
      return;
    }
    handleDelete(selectedIndex);
    setOpenDeleteDialog(false);
    setSelectedIndex(null);
  }, [selectedIndex, handleDelete]);

  /* Clear all backups */
  const handleClearAll = useCallback(() => {
    setOpenDialog(true);
  }, []);

  const handleDialogClose = useCallback(() => {
    setOpenDialog(false);
  }, []);

  const handleConfirmClearAll = useCallback(() => {
    clearOverlayBackups();
    setBackupList([]);
    setMarked(new Set());
    setExpandedIndex(null);

    handleOpenAlert('All backups cleared', 'success');
    setOpenDialog(false);
  }, [setBackupList, handleOpenAlert]);

  return (
    <Box sx={{ marginTop: 2 }}>
      {/* Header button */}
      <CustomButton
        variant="outlined"
        fullWidth
        onClick={() => setIsOpen((prev) => !prev)}
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 1,
          color: 'text.primary',
          backgroundColor: isOpen ? 'primary.light' : 'unset',
          borderColor: isOpen ? 'primary.main' : 'grey.600',
          borderBottomLeftRadius: isOpen ? '0px' : '4px',
          borderBottomRightRadius: isOpen ? '0px' : '4px',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
          ...(theme.palette.mode === 'dark'
            ? { textShadow: '0px 1px 4px rgba(0,0,0,0.8)' }
            : { textShadow: '0px 1px 2px rgba(255,255,255,0.8)' })
        })}
        startIcon={<ArchiveIcon color="primary" />}
        endIcon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
          Overlay backups ({backupList.length} of {MAX_LS_BACKUPS})
        </Typography>
      </CustomButton>

      {/* Contents */}
      <Collapse in={isOpen}>
        <Box
          sx={(theme) => ({
            backgroundColor: theme.palette.background.default,
            padding: '8px',
            border: `1px solid ${theme.palette.grey[600]}`,
            borderTop: 'none',
            borderRadius: '0 0 4px 4px'
          })}
        >
          {/* List of backups */}
          {backupList.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No backups available
            </Typography>
          ) : (
            <Box
              sx={{
                maxHeight: 240,
                overflowY: 'auto',
                marginBottom: 1
              }}
            >
              {backupList.map((backup, index) => {
                const isSelected = visibleCheckbox === index;
                const isMarked = marked.has(index);
                const isExpanded = expandedIndex === index;

                const overlayLabel = backup.overlayPath
                  ? backup.overlayPath.split('/').pop()
                  : 'Text overlay';

                return (
                  <Box key={index} sx={{ marginBottom: 1 }}>
                    <Box
                      onClick={() => setVisibleCheckbox(index)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        borderBottomLeftRadius: isExpanded ? '0px' : '4px',
                        borderBottomRightRadius: isExpanded ? '0px' : '4px',
                        backgroundColor: (theme) =>
                          theme.palette.mode === 'dark'
                            ? theme.palette.grey[800]
                            : theme.palette.grey[200],
                        border: (theme) => {
                          let color = theme.palette.grey[600];
                          if (isMarked) {
                            color = theme.palette.error.main;
                          } else if (isSelected || isExpanded) {
                            color = theme.palette.primary.main;
                          }
                          return `1px solid ${color}`;
                        }
                      }}
                    >
                      {(isSelected || isMarked) && (
                        <Checkbox
                          disableRipple
                          size="small"
                          checked={isMarked}
                          onChange={() => toggleMarked(index)}
                          sx={{ marginRight: 1 }}
                        />
                      )}

                      <CustomStyledIconButton
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedIndex((prev) =>
                            prev === index ? null : index
                          );
                        }}
                        sx={{ marginRight: 1 }}
                      >
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </CustomStyledIconButton>

                      <Tooltip title={overlayLabel} arrow>
                        <Typography
                          variant="body2"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            marginRight: 1,
                            fontWeight: 500
                          }}
                        >
                          {overlayLabel}
                        </Typography>
                      </Tooltip>

                      <Tooltip title="Restore" arrow>
                        <CustomStyledIconButton
                          size="small"
                          onClick={() => handleOpenRestoreDialog(index)}
                        >
                          <RestoreIcon />
                        </CustomStyledIconButton>
                      </Tooltip>

                      <Tooltip title="Delete" arrow>
                        <CustomStyledIconButton
                          size="small"
                          onClick={() => handleOpenDeleteDialog(index)}
                        >
                          <DeleteIcon color="error" />
                        </CustomStyledIconButton>
                      </Tooltip>
                    </Box>

                    <Collapse in={isExpanded}>
                      <Box
                        sx={(theme) => ({
                          backgroundColor:
                            theme.palette.mode === 'dark'
                              ? theme.palette.grey[900]
                              : theme.palette.grey[100],
                          border: `1px solid ${theme.palette.grey[600]}`,
                          borderTop: 'none',
                          borderRadius: '0 0 4px 4px',
                          padding: '6px 8px',
                          marginBottom: 1
                        })}
                      >
                        <Typography
                          variant="body2"
                          component="pre"
                          sx={{
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            margin: 0
                          }}
                        >
                          {JSON.stringify(backup, null, 2)}
                        </Typography>
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
            </Box>
          )}
          {/* Delete buttons */}
          {backupList.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {marked.size > 0 && (
                <CustomButton
                  color="error"
                  variant="outlined"
                  size="small"
                  startIcon={<DeleteIcon />}
                  onClick={() => setOpenDeleteMarkedDialog(true)}
                >
                  Delete marked
                </CustomButton>
              )}
              <CustomButton
                color="error"
                variant="contained"
                size="small"
                startIcon={<DeleteIcon />}
                onClick={handleClearAll}
              >
                Clear all
              </CustomButton>
            </Box>
          )}
        </Box>
      </Collapse>

      {/* Restore confirmation dialog */}
      <Dialog
        open={openRestoreDialog}
        onClose={(event, reason) => {
          if (reason === 'backdropClick') {
            return;
          }
          handleCloseRestoreDialog();
        }}
        aria-labelledby="restore-dialog-title"
        aria-describedby="restore-dialog-description"
      >
        <DialogTitle id="restore-dialog-title">
          <Box display="flex" alignItems="center">
            <WarningAmberIcon style={{ marginRight: '8px' }} />
            {`Restore Backup`}
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="restore-dialog-description">
            Are you sure you want to restore this overlay backup?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <CustomButton
            variant="outlined"
            onClick={handleCloseRestoreDialog}
            color="primary"
          >
            No
          </CustomButton>
          <CustomButton
            variant="contained"
            onClick={handleConfirmRestore}
            color="error"
            autoFocus
          >
            Yes
          </CustomButton>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={openDeleteDialog}
        onClose={(event, reason) => {
          if (reason === 'backdropClick') {
            return;
          }
          handleCloseDeleteDialog();
        }}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">
          <Box display="flex" alignItems="center">
            <WarningAmberIcon style={{ marginRight: '8px' }} />
            {`Delete Backup`}
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete this overlay backup? This action
            cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <CustomButton
            variant="outlined"
            onClick={handleCloseDeleteDialog}
            color="primary"
          >
            No
          </CustomButton>
          <CustomButton
            variant="contained"
            onClick={handleConfirmDelete}
            color="error"
            autoFocus
          >
            Yes
          </CustomButton>
        </DialogActions>
      </Dialog>

      {/* Clear all confirmation dialog */}
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
            {`Clear All Backups`}
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to remove all overlay backups? This action
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
            onClick={handleConfirmClearAll}
            color="error"
            autoFocus
          >
            Yes
          </CustomButton>
        </DialogActions>
      </Dialog>

      {/* Delete marked confirmation dialog */}
      <Dialog
        open={openDeleteMarkedDialog}
        onClose={(event, reason) => {
          if (reason === 'backdropClick') {
            return;
          }
          setOpenDeleteMarkedDialog(false);
        }}
        aria-labelledby="delete-marked-dialog-title"
        aria-describedby="delete-marked-dialog-description"
      >
        <DialogTitle id="delete-marked-dialog-title">
          <Box display="flex" alignItems="center">
            <WarningAmberIcon style={{ marginRight: '8px' }} />
            {`Delete Marked Backups`}
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-marked-dialog-description">
            Are you sure you want to delete all marked backups? This action
            cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <CustomButton
            variant="outlined"
            onClick={() => setOpenDeleteMarkedDialog(false)}
            color="primary"
          >
            No
          </CustomButton>
          <CustomButton
            variant="contained"
            onClick={() => {
              handleDeleteMarked();
              setOpenDeleteMarkedDialog(false);
            }}
            color="error"
            autoFocus
          >
            Yes
          </CustomButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OverlayBackupList;
