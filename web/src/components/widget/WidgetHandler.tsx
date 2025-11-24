/* Widget Wizard
 * WidgetHandler: Handler of widgets.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { log, enableLogging } from '../../helpers/logger';
import WidgetItem from './WidgetItem';
import WidgetsDisabled from './WidgetsDisabled';
import { useAppContext } from '../AppContext';
import { useWidgetContext } from './WidgetContext';
import { capitalizeFirstLetter, playSound } from '../../helpers/utils';
import { Widget } from './widgetInterfaces';
import { CustomButton } from './../CustomComponents';
import WidgetBackupList from './WidgetBackupList';
import { loadWidgetBackups } from './widgetBackupStorage';
import messageSoundUrl from '../../assets/audio/message.oga';
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

const WidgetHandler: React.FC = () => {
  /* Local state */
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [backupList, setBackupList] = useState(loadWidgetBackups());

  /* Global context */
  const {
    activeDraggableWidget,
    setActiveDraggableWidget,
    activeWidgets,
    listWidgets,
    listWidgetCapabilities,
    addWidget,
    removeAllWidgets,
    selectedWidget,
    setSelectedWidget,
    widgetCapabilities,
    openWidgetId,
    setOpenWidgetId,
    widgetSupported,
    updateWidget
  } = useWidgetContext();
  const { appSettings } = useAppContext();

  enableLogging(false);

  /* Component mount: Calls listWidgetCapabilities and listWidgets */
  useEffect(() => {
    const fetchData = async () => {
      await listWidgetCapabilities();
      await listWidgets();
    };
    fetchData();
  }, []);

  /* Keyboard Shift+Delete shortcut: remove all widgets (but not when typing) */
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
      /* Do nothing if no widgets exist */
      if (activeWidgets.length === 0) {
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
  }, [activeWidgets.length]);

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
      const updatedWidget = {
        ...widget,
        generalParams: {
          ...widget.generalParams,
          depth: mode
        }
      };
      updateWidget(updatedWidget);
    },
    [updateWidget]
  );

  /* Handle dropdown toggle */
  const toggleDropdown = useCallback(
    (widgetId: number) => {
      const newId = openWidgetId === widgetId ? null : widgetId;

      setActiveDraggableWidget((prev) => ({
        ...prev,
        id: newId ?? -1,
        active: false,
        highlight: false,
        clickBBox: false
      }));

      setOpenWidgetId(newId);

      if (appSettings.widgetAutoBringFront) {
        const widget = activeWidgets.find(
          (w) => w.generalParams.id === widgetId
        );
        if (widget) {
          setDepth('front', widget);
        }
      }
    },
    [
      openWidgetId,
      activeWidgets,
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
    removeAllWidgets();
    setOpenDialog(false);
  };

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
          <Box display="flex" alignItems="center">
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

      {/* List of Active Widgets */}
      <Box sx={{ marginTop: 2 }}>
        {activeWidgets
          .sort((a, b) => {
            let sortResult = 0;
            switch (appSettings.sortBy) {
              case 'id':
                sortResult = a.generalParams.id - b.generalParams.id;
                break;
              case 'type':
                sortResult = a.generalParams.type.localeCompare(
                  b.generalParams.type
                );
                break;
              default:
                break;
            }
            return appSettings.sortAscending ? sortResult : -sortResult;
          })
          .map((widget) => (
            <WidgetItem
              key={widget.generalParams.id}
              widget={widget}
              toggleDropdown={toggleDropdown}
              onBackupRequested={() => setBackupList(loadWidgetBackups())}
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
