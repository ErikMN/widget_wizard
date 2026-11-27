/*
 * PrivacyMaskItem: Renders an individual privacy mask in the drawer.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  MAX_MASK_NAME_LENGTH,
  usePrivacyMaskContext
} from './PrivacyMaskContext';
import { PrivacyMask } from './privacyMaskInterfaces';
import {
  CustomButton,
  CustomStyledIconButton,
  CustomSwitch
} from '../CustomComponents';
import { playSound } from '../../helpers/utils';
import messageSoundUrl from '../../assets/audio/message.oga';
/* MUI */
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

const PrivacyMaskItem: React.FC<{
  mask: PrivacyMask;
  isOpen: boolean;
  toggleDropdown: (id: number) => void;
}> = ({ mask, isOpen, toggleDropdown }) => {
  /* Global state */
  const {
    capabilities,
    frame,
    selectedMaskId,
    renameMask,
    setMaskEnabled,
    duplicateMask,
    removeMask,
    validateMaskName,
    masks
  } = usePrivacyMaskContext();

  /* Local state */
  const [name, setName] = useState(mask.name);
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    setName(mask.name);
  }, [mask.name]);

  const nameError = name === mask.name ? null : validateMaskName(name, mask.id);

  /* Keyboard Delete shortcut: remove selected mask (but not when typing) */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (isTyping || event.shiftKey || event.key !== 'Delete') {
        return;
      }
      if (selectedMaskId !== mask.id) {
        return;
      }
      setOpenDialog(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedMaskId, mask.id]);

  const commitName = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed === mask.name) {
      setName(mask.name);
      return;
    }
    if (validateMaskName(trimmed, mask.id)) {
      setName(mask.name);
      return;
    }
    renameMask(mask.id, trimmed);
  }, [name, mask.id, mask.name, renameMask, validateMaskName]);

  const handleRemoveClick = useCallback(() => {
    setOpenDialog(true);
    playSound(messageSoundUrl);
  }, []);

  const handleConfirmRemove = useCallback(() => {
    removeMask(mask.id);
    setOpenDialog(false);
  }, [mask.id, removeMask]);

  const isActive = isOpen || selectedMaskId === mask.id;
  const canDuplicate = masks.length < capabilities.maxMasks;

  return (
    <Box sx={{ marginBottom: 1.4 }}>
      {/* Header button */}
      <CustomButton
        variant="outlined"
        fullWidth
        onClick={() => toggleDropdown(mask.id)}
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 1,
          color: 'text.primary',
          backgroundColor: isActive ? 'primary.light' : 'unset',
          borderColor: isActive ? 'primary.main' : 'grey.600',
          borderBottomLeftRadius: isOpen ? '0px' : '4px',
          borderBottomRightRadius: isOpen ? '0px' : '4px',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
          ...(theme.palette.mode === 'dark'
            ? { textShadow: '0px 1px 4px rgba(0,0,0,0.8)' }
            : { textShadow: '0px 1px 2px rgba(255,255,255,0.8)' })
        })}
        startIcon={
          mask.enabled ? (
            <VisibilityOffIcon color="primary" />
          ) : (
            <VisibilityIcon color="disabled" />
          )
        }
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
          title={`Privacy mask (ID: ${mask.id}) ${mask.name}`}
        >
          <Typography
            variant="subtitle2"
            sx={{ marginRight: '12px', fontWeight: 'bold' }}
          >
            {mask.name}
          </Typography>
          <Chip
            label={`ID: ${mask.id}`}
            size="small"
            sx={{ fontWeight: 'bold', marginRight: '12px' }}
          />
          {!mask.enabled && (
            <Typography variant="body2" color="text.secondary" noWrap>
              Disabled
            </Typography>
          )}
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
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
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
            <Typography variant="h6">Mask parameters</Typography>
            <Tooltip title="Duplicate mask" arrow placement="top">
              <div>
                <CustomStyledIconButton
                  width="32px"
                  height="32px"
                  aria-label="duplicate-mask"
                  disabled={!canDuplicate}
                  onClick={() => duplicateMask(mask)}
                >
                  <ContentCopyIcon fontSize="small" />
                </CustomStyledIconButton>
              </div>
            </Tooltip>
          </Box>

          {/* Name */}
          <TextField
            label="Name"
            size="small"
            fullWidth
            value={name}
            error={!!nameError}
            helperText={nameError ?? ' '}
            slotProps={{ htmlInput: { maxLength: MAX_MASK_NAME_LENGTH } }}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              } else if (e.key === 'Escape') {
                setName(mask.name);
              }
            }}
            sx={{ mt: 1 }}
          />

          {/* Enabled */}
          <FormControlLabel
            control={
              <CustomSwitch
                checked={mask.enabled}
                onChange={(_e, checked) => setMaskEnabled(mask.id, checked)}
              />
            }
            label="Enabled"
          />

          {/* Corners */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mt: 1,
              mb: 0.5
            }}
          >
            <Typography variant="subtitle2">Corners</Typography>
            <Chip
              label={`${mask.points.length} / ${capabilities.maxCorners}`}
              size="small"
              color={
                mask.points.length >= capabilities.maxCorners
                  ? 'warning'
                  : 'default'
              }
              sx={{ fontWeight: 'bold' }}
            />
          </Box>
          <Box
            role="table"
            aria-label={`Corners of ${mask.name}`}
            sx={(theme) => ({
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '4px',
              overflow: 'hidden',
              fontSize: '0.8rem',
              fontVariantNumeric: 'tabular-nums'
            })}
          >
            {[{ key: 'header', cells: ['#', 'X', 'Y'] }]
              .concat(
                mask.points.map((p, index) => ({
                  key: String(index),
                  cells: [String(index + 1), String(p.x), String(p.y)]
                }))
              )
              .map((row, rowIndex) => (
                <Box
                  key={row.key}
                  role="row"
                  sx={(theme) => ({
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 1fr',
                    px: 1,
                    py: 0.25,
                    ...(rowIndex === 0
                      ? {
                          fontWeight: 'bold',
                          color: 'text.secondary',
                          borderBottom: `1px solid ${theme.palette.divider}`,
                          backgroundColor: theme.palette.action.hover
                        }
                      : rowIndex % 2 === 0
                        ? { backgroundColor: theme.palette.action.hover }
                        : {})
                  })}
                >
                  {row.cells.map((cell, cellIndex) => (
                    <Box
                      key={cellIndex}
                      role={rowIndex === 0 ? 'columnheader' : 'cell'}
                      sx={{
                        textAlign: cellIndex === 0 ? 'left' : 'right',
                        color:
                          cellIndex === 0 && rowIndex > 0
                            ? 'text.secondary'
                            : undefined
                      }}
                    >
                      {cell}
                    </Box>
                  ))}
                </Box>
              ))}
          </Box>
          {frame && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.5 }}
            >
              Pixel coordinates in the full {frame.width}×{frame.height} image
            </Typography>
          )}

          {/* Remove */}
          <CustomButton
            color="error"
            variant="contained"
            fullWidth
            onClick={handleRemoveClick}
            startIcon={<DeleteIcon />}
            sx={{ mt: 2 }}
          >
            Remove
          </CustomButton>
        </Box>
      </Collapse>

      {/* Confirm remove dialog */}
      <Dialog
        open={openDialog}
        onClose={(_event, reason) => {
          if (reason === 'backdropClick') {
            return;
          }
          setOpenDialog(false);
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <WarningAmberIcon sx={{ mr: 1 }} />
            Remove privacy mask
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to remove the privacy mask "{mask.name}"? This
            action cannot be undone.
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
            onClick={handleConfirmRemove}
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

export default PrivacyMaskItem;
