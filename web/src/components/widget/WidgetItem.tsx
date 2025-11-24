/* Widget Wizard
 * WidgetItem: Represent one widget.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Widget } from './widgetInterfaces';
import { useWidgetContext } from './WidgetContext';
import { capitalizeFirstLetter, playSound } from '../../helpers/utils';
import { CustomButton } from './../CustomComponents';
import JsonEditor from '../JsonEditor';
import WidgetGeneralParams from './WidgetGeneralParams';
import WidgetSpecificParams from './WidgetSpecificParams';
import messageSoundUrl from '../../assets/audio/message.oga';
import { saveWidgetBackup, loadWidgetBackups } from './widgetBackupStorage';
import { useAppContext } from '../AppContext';
import { MAX_LS_BACKUPS } from '../constants';
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
import SaveIcon from '@mui/icons-material/Save';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WidgetsIcon from '@mui/icons-material/Widgets';

import '../../assets/css/prism-theme.css';

interface WidgetItemProps {
  widget: Widget;
  toggleDropdown: (id: number) => void;
  onBackupRequested: () => void;
}

const WidgetItem: React.FC<WidgetItemProps> = ({
  widget,
  toggleDropdown,
  onBackupRequested
}) => {
  /* Local state */
  const [widgetParamsVisible, setWidgetParamsVisible] =
    useState<boolean>(false);
  const [jsonInput, setJsonInput] = useState<string>(
    JSON.stringify(widget, null, 2)
  );
  const [parsedJSON, setParsedJSON] = useState<any | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  /* Combined widget general param state */
  const [widgetState, setWidgetState] = useState({
    isVisible: widget.generalParams.isVisible,
    widgetId: null as number | null,
    sliderValue: widget.generalParams.transparency,
    datasource: widget.generalParams.datasource,
    channel: widget.generalParams.channel,
    updateTime: widget.generalParams.updateTime
  });

  /* Global context */
  const {
    removeWidget,
    updateWidget,
    addCustomWidget,
    openWidgetId,
    setOpenWidgetId,
    activeDraggableWidget
  } = useWidgetContext();

  const { handleOpenAlert } = useAppContext();

  const backupCount = loadWidgetBackups().length;

  /* Safe JSON parser */
  const safeParseJson = (json: string) => {
    try {
      return JSON.parse(json);
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  /* Update jsonInput whenever widget prop changes */
  useEffect(() => {
    /* Store the widget's id */
    if (widget.generalParams && widget.generalParams.id) {
      setWidgetState((prevState) => ({
        ...prevState,
        widgetId: widget.generalParams.id
      }));
    }
    /* Deep widget copy */
    const widgetCopy = safeParseJson(JSON.stringify(widget));
    if (widgetCopy == null) {
      return;
    }
    /* Remove ID in order to not edit other widgets */
    if (widgetCopy.generalParams && widgetCopy.generalParams.id) {
      delete widgetCopy.generalParams.id;
    }
    setJsonInput(JSON.stringify(widgetCopy, null, 2));
    setJsonError(null);
  }, [widget]);

  /* Keyboard Delete shortcut: remove active widget (but not when typing) */
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
      /* Trigger only on the Delete key */
      if (event.key !== 'Delete') {
        return;
      }
      /* Only the active widget reacts */
      if (activeDraggableWidget.id !== widget.generalParams.id) {
        return;
      }
      /* Open delete dialog */
      setOpenDialog(true);
    };

    window.addEventListener('keydown', handleKeyDown);

    /* Unmount cleanup */
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDraggableWidget.id, widget.generalParams.id]);

  /****************************************************************************/

  /* Toggle Widget Params */
  const toggleWidgetParams = useCallback(() => {
    setWidgetParamsVisible((prev) => !prev);
  }, []);

  /****************************************************************************/

  const handleUpdateJSON = () => {
    try {
      const parsedWidget = parsedJSON;
      if (parsedWidget == null) {
        setJsonError('Invalid JSON format');
        return;
      }
      /* Re-attach the widget ID */
      if (widgetState.widgetId !== null) {
        parsedWidget.generalParams.id = widgetState.widgetId;
      }
      updateWidget(parsedWidget);
      setJsonError(null);
      /* NOTE: Update UI controls for manual JSON updates */
      setWidgetState((prevState) => ({
        ...prevState,
        isVisible: parsedWidget.generalParams.isVisible,
        sliderValue: parsedWidget.generalParams.transparency,
        datasource: parsedWidget.generalParams.datasource,
        channel: parsedWidget.generalParams.channel,
        updateTime: parsedWidget.generalParams.updateTime
      }));
    } catch (err) {
      console.error(err);
      setJsonError('Invalid JSON format');
    }
  };

  /****************************************************************************/
  /* Remove widget dialog handlers */
  const [openDialog, setOpenDialog] = useState<boolean>(false);

  const handleRemoveClick = () => {
    setOpenDialog(true);
    playSound(messageSoundUrl);
  };

  const handleDialogClose = () => {
    setOpenDialog(false);
  };

  const handleConfirmRemove = () => {
    removeWidget(widget.generalParams.id);
    setOpenDialog(false);
  };

  /****************************************************************************/

  return (
    <Box key={widget.generalParams.id} sx={{ marginBottom: 1.4 }}>
      <CustomButton
        variant="outlined"
        fullWidth
        onClick={() => toggleDropdown(widget.generalParams.id)}
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 1,
          color: 'text.primary',
          /* Highlight selected widget */
          backgroundColor:
            (activeDraggableWidget.id === widget.generalParams.id &&
              activeDraggableWidget.active) ||
            openWidgetId === widget.generalParams.id
              ? 'primary.light'
              : 'unset',
          borderColor:
            (activeDraggableWidget.id === widget.generalParams.id &&
              activeDraggableWidget.active) ||
            openWidgetId === widget.generalParams.id
              ? 'primary.main'
              : 'grey.600',
          borderBottomLeftRadius:
            openWidgetId === widget.generalParams.id ? '0px' : '4px',
          borderBottomRightRadius:
            openWidgetId === widget.generalParams.id ? '0px' : '4px',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
          /* Text shadow */
          ...(theme.palette.mode === 'dark'
            ? { textShadow: '0px 1px 4px rgba(0, 0, 0, 0.8)' }
            : { textShadow: '0px 1px 2px rgba(255, 255, 255, 0.8)' })
        })}
        startIcon={<WidgetsIcon color="primary" />}
        endIcon={
          openWidgetId === widget.generalParams.id ? (
            <ExpandLessIcon />
          ) : (
            <ExpandMoreIcon />
          )
        }
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flex: 1,
            /* Don't break line, don't show scrollbar */
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
          title={`${capitalizeFirstLetter(widget.generalParams.type)} (${widget.width}x${widget.height}) ID: ${widget.generalParams.id}`}
        >
          {/* Widget title and info */}
          <Typography
            variant="subtitle2"
            sx={{ marginRight: '12px', fontWeight: 'bold' }}
          >
            {capitalizeFirstLetter(widget.generalParams.type)} ({widget.width}x
            {widget.height})
          </Typography>
          <Chip
            label={`ID: ${widget.generalParams.id}`}
            size="small"
            sx={{ fontWeight: 'bold' }}
          />
        </div>
      </CustomButton>

      {/* Dropdown for current widget settings */}
      <Collapse in={openWidgetId === widget.generalParams.id}>
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
          {/* General Params */}
          <WidgetGeneralParams
            widget={widget}
            widgetState={widgetState}
            setWidgetState={setWidgetState}
          />

          {/* Widget Params */}
          <CustomButton
            variant={widgetParamsVisible ? 'contained' : 'outlined'}
            fullWidth
            onClick={toggleWidgetParams}
            startIcon={<WidgetsIcon />}
            endIcon={
              widgetParamsVisible ? <ExpandLessIcon /> : <ExpandMoreIcon />
            }
            sx={{
              color: 'text.secondary',
              backgroundColor: 'background.default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 1,
              height: '32px',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden'
            }}
          >
            {widgetParamsVisible
              ? 'Hide widget parameters'
              : 'Show widget parameters'}
          </CustomButton>
          <Collapse in={widgetParamsVisible}>
            <WidgetSpecificParams widget={widget} />
          </Collapse>
          {/* Widget Params End */}

          {/* JSON editor */}
          <JsonEditor
            jsonInput={jsonInput}
            setJsonInput={setJsonInput}
            jsonError={jsonError}
            setJsonError={setJsonError}
            onUpdate={handleUpdateJSON}
            onParseJson={setParsedJSON}
            updateLabel={`Update ${capitalizeFirstLetter(widget.generalParams.type)}`}
          />

          {/* Remove this widget confirmation dialog */}
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
                {`Remove ${capitalizeFirstLetter(widget.generalParams.type)}`}
              </Box>
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="alert-dialog-description">
                Are you sure you want to remove{' '}
                {capitalizeFirstLetter(widget.generalParams.type)}? This action
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

          {/* Remove, Backup and Duplicate buttons*/}
          <Box
            sx={{
              marginTop: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1.5
            }}
          >
            {/* Remove widget button */}
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
            {/* Backup widget button */}
            <CustomButton
              color="secondary"
              variant="contained"
              startIcon={<SaveIcon />}
              disabled={backupCount >= MAX_LS_BACKUPS}
              onClick={() => {
                if (backupCount >= MAX_LS_BACKUPS) {
                  return;
                }
                saveWidgetBackup(widget);
                onBackupRequested();
                handleOpenAlert('Widget backup created', 'success');
              }}
              sx={{
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden'
              }}
            >
              Backup
            </CustomButton>
            {/* Duplicate widget button */}
            <CustomButton
              color="secondary"
              variant="contained"
              onClick={() => addCustomWidget({ ...widget })}
              startIcon={<ContentCopyIcon />}
              sx={{
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden'
              }}
            >
              Duplicate
            </CustomButton>
          </Box>
          {/* Remove and Duplicate buttons end */}
        </Box>
      </Collapse>
      {/* Dropdown for current widget settings end */}
    </Box>
  );
};

export default WidgetItem;
