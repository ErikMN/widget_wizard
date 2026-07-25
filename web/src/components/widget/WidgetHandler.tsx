/* Widget Wizard
 * WidgetHandler: Handler of widgets.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { log, enableLogging } from '../../helpers/logger';
import WidgetItem, { WidgetItemHandle } from './WidgetItem';
import WidgetsDisabled from './WidgetsDisabled';
import { useAppSettingsContext } from '../context/AppContext';
import { useWidgetActions, useWidgetData, useWidgetUi } from './WidgetContext';
import { useOnScreenMessage } from '../context/OnScreenMessageContext';
import { capitalizeFirstLetter, playSound } from '../../helpers/utils';
import { Widget } from './widgetInterfaces';
import { CustomButton } from './../CustomComponents';
import WidgetBackupList from './WidgetBackupList';
import { loadWidgetBackups } from './widgetBackupStorage';
import messageSoundUrl from '../../assets/audio/message.oga';
import { MAX_LS_BACKUPS } from '../constants';
/* MUI */
import { SelectChangeEvent } from '@mui/material/Select';
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
import WidgetsIcon from '@mui/icons-material/Widgets';

const WidgetHandler: React.FC = () => {
  /* Local state */
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [pendingDeleteWidgetId, setPendingDeleteWidgetId] = useState<
    number | null
  >(null);
  const [backupList, setBackupList] = useState(loadWidgetBackups());
  const widgetHotkeysShownRef = useRef(false);
  const widgetItemRefs = useRef<Map<number, WidgetItemHandle>>(new Map());
  const widgetItemRefCallbacks = useRef<
    Map<number, (handle: WidgetItemHandle | null) => void>
  >(new Map());

  const registerWidgetItemRef = useCallback(
    (id: number, handle: WidgetItemHandle | null) => {
      if (handle) {
        widgetItemRefs.current.set(id, handle);
      } else {
        widgetItemRefs.current.delete(id);
        widgetItemRefCallbacks.current.delete(id);
      }
    },
    []
  );

  const getWidgetItemRefCallback = useCallback(
    (id: number) => {
      let callback = widgetItemRefCallbacks.current.get(id);
      if (!callback) {
        callback = (handle) => registerWidgetItemRef(id, handle);
        widgetItemRefCallbacks.current.set(id, callback);
      }
      return callback;
    },
    [registerWidgetItemRef]
  );

  /* Global context */
  const { activeWidgets, widgetCapabilities, widgetSupported, selectedWidget } =
    useWidgetData();
  const {
    activeDraggableWidget,
    setActiveDraggableWidget,
    openWidgetId,
    setOpenWidgetId,
    setSelectedWidget
  } = useWidgetUi();
  const {
    listWidgets,
    listWidgetCapabilities,
    addWidget,
    removeWidget,
    removeAllWidgets,
    updateWidget
  } = useWidgetActions();
  const { appSettings } = useAppSettingsContext();
  const { showMessage } = useOnScreenMessage();

  const backupLimitReached = backupList.length >= MAX_LS_BACKUPS;

  const sortedWidgets = useMemo(() => {
    return [...activeWidgets].sort((a, b) => {
      let sortResult = 0;
      switch (appSettings.sortBy) {
        case 'id':
          sortResult = a.generalParams.id - b.generalParams.id;
          break;
        case 'type':
          sortResult = a.generalParams.type.localeCompare(b.generalParams.type);
          break;
        default:
          break;
      }
      return appSettings.sortAscending ? sortResult : -sortResult;
    });
  }, [activeWidgets, appSettings.sortBy, appSettings.sortAscending]);

  const handleBackupRequested = useCallback(() => {
    setBackupList(loadWidgetBackups());
  }, []);

  enableLogging(false);

  /* Component mount: Calls listWidgetCapabilities and listWidgets */
  useEffect(() => {
    const fetchData = async () => {
      await listWidgetCapabilities();
      await listWidgets();
    };
    fetchData();
  }, []);

  /* Show widget hotkeys hint on mount (only once) */
  useEffect(() => {
    if (widgetHotkeysShownRef.current) {
      return;
    }
    widgetHotkeysShownRef.current = true;
    showMessage({
      title: 'Widget Hotkeys',
      icon: <WidgetsIcon fontSize="small" />,
      content: (
        <div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Delete:</strong> Remove active widget
          </div>
          <div>
            <strong>Shift + Delete:</strong> Remove all widgets
          </div>
        </div>
      ),
      duration: 8000
    });
  }, [showMessage]);

  /* Keyboard Delete shortcuts */
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
      if (event.key !== 'Delete') {
        return;
      }

      if (event.shiftKey) {
        if (activeWidgets.length === 0) {
          return;
        }
        setOpenDialog(true);
        return;
      }

      if (activeDraggableWidget.id == null) {
        return;
      }
      setPendingDeleteWidgetId(activeDraggableWidget.id);
      playSound(messageSoundUrl);
    };

    window.addEventListener('keydown', handleKeyDown);

    /* Unmount cleanup */
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeWidgets.length, activeDraggableWidget.id]);

  /* Handle dropdown change */
  const handleWidgetChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      setSelectedWidget(event.target.value);
    },
    [setSelectedWidget]
  );

  /* Handle add button click */
  const handleAddClick = useCallback(() => {
    log('Add widget:', selectedWidget);
    addWidget(selectedWidget);
  }, [selectedWidget, addWidget]);

  const setDepth = useCallback(
    (mode: string, widget: Widget) => {
      updateWidget(widget.generalParams.id, (current) => ({
        ...current,
        generalParams: {
          ...current.generalParams,
          depth: mode
        }
      }));
    },
    [updateWidget]
  );

  /* Handle dropdown toggle */
  const toggleDropdown = useCallback(
    (widget: Widget, isOpen: boolean) => {
      const newId = isOpen ? null : widget.generalParams.id;

      setActiveDraggableWidget((prev) => ({
        ...prev,
        id: newId ?? -1,
        active: false,
        highlight: false,
        clickBBox: false
      }));

      setOpenWidgetId(newId);

      if (appSettings.widgetAutoBringFront) {
        setDepth('front', widget);
      }
    },
    [
      setActiveDraggableWidget,
      setOpenWidgetId,
      appSettings.widgetAutoBringFront,
      setDepth
    ]
  );

  const handleRemoveAllClick = () => {
    setOpenDialog(true);
    playSound(messageSoundUrl);
  };

  const handleDialogClose = () => {
    setOpenDialog(false);
  };

  const handleConfirmRemoveAll = () => {
    widgetItemRefs.current.forEach((handle) => handle.cancelPendingChanges());
    removeAllWidgets();
    setOpenDialog(false);
  };

  const handleRemoveRequested = useCallback((widgetId: number) => {
    setPendingDeleteWidgetId(widgetId);
    playSound(messageSoundUrl);
  }, []);

  const handleCancelDeleteWidget = useCallback(() => {
    setPendingDeleteWidgetId(null);
  }, []);

  const handleConfirmDeleteWidget = useCallback(() => {
    if (pendingDeleteWidgetId != null) {
      widgetItemRefs.current.get(pendingDeleteWidgetId)?.cancelPendingChanges();
      removeWidget(pendingDeleteWidgetId);
    }
    setPendingDeleteWidgetId(null);
  }, [pendingDeleteWidgetId, removeWidget]);

  const pendingDeleteWidget = activeWidgets.find(
    (widget) => widget.generalParams.id === pendingDeleteWidgetId
  );

  if (!widgetSupported) {
    return <WidgetsDisabled />;
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
      {/* Container for dropdown and button */}
      <Box sx={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
        {/* Dropdown for widget names */}
        <FormControl fullWidth variant="outlined">
          <InputLabel id="widget-select-label" sx={{ top: '-4px' }}>
            Select widget
          </InputLabel>
          <Select
            labelId="widget-select-label"
            id="widget-select"
            value={selectedWidget}
            onChange={handleWidgetChange}
            label="Select Widget"
            sx={{
              height: '40px',
              '& .MuiOutlinedInput-root': {
                height: '100%'
              }
            }}
          >
            {widgetCapabilities?.data.widgets.map((widget, index) => (
              <MenuItem key={index} value={widget.type}>
                {capitalizeFirstLetter(widget.type)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Plus sign button */}
        <Tooltip title="Add a widget" arrow placement="right">
          <div>
            <IconButton
              color="primary"
              aria-label="add widget"
              onClick={handleAddClick}
              disableRipple
              sx={{
                marginLeft: 1,
                backgroundColor: green[500],
                color: 'white',
                width: 40,
                height: 40,
                borderRadius: '8px',
                '&:hover': {
                  backgroundColor: green[700]
                }
              }}
            >
              <AddIcon />
            </IconButton>
          </div>
        </Tooltip>
      </Box>

      {/* Global widget backup list */}
      <WidgetBackupList backupList={backupList} setBackupList={setBackupList} />

      {/* Remove all widgets confirmation dialog */}
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
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <WarningAmberIcon style={{ marginRight: '8px' }} />
            {'Remove all widgets'}
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to remove all widgets? This action cannot be
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

      {/* Remove single widget confirmation dialog */}
      <Dialog
        open={pendingDeleteWidgetId != null}
        onClose={(event, reason) => {
          if (reason === 'backdropClick') {
            return;
          }
          handleCancelDeleteWidget();
        }}
        aria-labelledby="remove-widget-dialog-title"
        aria-describedby="remove-widget-dialog-description"
      >
        <DialogTitle id="remove-widget-dialog-title">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <WarningAmberIcon style={{ marginRight: '8px' }} />
            {`Remove ${
              pendingDeleteWidget
                ? capitalizeFirstLetter(pendingDeleteWidget.generalParams.type)
                : 'widget'
            }`}
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="remove-widget-dialog-description">
            Are you sure you want to remove{' '}
            {pendingDeleteWidget
              ? capitalizeFirstLetter(pendingDeleteWidget.generalParams.type)
              : 'this widget'}
            ? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <CustomButton
            variant="outlined"
            onClick={handleCancelDeleteWidget}
            color="primary"
          >
            No
          </CustomButton>
          <CustomButton
            variant="contained"
            onClick={handleConfirmDeleteWidget}
            color="error"
            autoFocus
          >
            Yes
          </CustomButton>
        </DialogActions>
      </Dialog>

      {/* List of Active Widgets */}
      <Box sx={{ marginTop: 2 }}>
        {sortedWidgets.map((widget) => (
          <WidgetItem
            key={widget.generalParams.id}
            ref={getWidgetItemRefCallback(widget.generalParams.id)}
            widget={widget}
            toggleDropdown={toggleDropdown}
            onBackupRequested={handleBackupRequested}
            onRemoveRequested={handleRemoveRequested}
            backupLimitReached={backupLimitReached}
            isOpen={openWidgetId === widget.generalParams.id}
            isActive={
              activeDraggableWidget.id === widget.generalParams.id &&
              activeDraggableWidget.active
            }
          />
        ))}
      </Box>

      {/* Remove all widgets button */}
      <CustomButton
        color="error"
        variant="contained"
        onClick={handleRemoveAllClick}
        disabled={activeWidgets.length === 0}
        startIcon={<DeleteIcon />}
      >
        Remove all widgets
      </CustomButton>
    </Box>
  );
};

export default WidgetHandler;
