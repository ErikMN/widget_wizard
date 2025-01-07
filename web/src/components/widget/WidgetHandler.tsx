/* Widget Wizard
 * WidgetHandler: Handler of widgets.
 */
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { log, enableLogging } from '../../helpers/logger';
import WidgetItem from './WidgetItem';
import WidgetsDisabled from './WidgetsDisabled';
import { useGlobalContext } from '../GlobalContext';
import { capitalizeFirstLetter } from '../../helpers/utils';
import { Widget } from './widgetInterfaces';
/* MUI */
import { SelectChangeEvent } from '@mui/material/Select';
import { green } from '@mui/material/colors';
import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
  const [IsBBoxClick, setIsBBoxClick] = useState<boolean>(false);

  /* Global context */
  const {
    appSettings,
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
    openDropdownIndex,
    setOpenDropdownIndex,
    widgetSupported,
    updateWidget
  } = useGlobalContext();

  /* Refs */
  const previousWidgetIdsRef = useRef<Set<number>>(new Set());

  enableLogging(false);

  /* Component mount: Calls listWidgetCapabilities and listWidgets */
  useEffect(() => {
    const fetchData = async () => {
      await listWidgetCapabilities();
      await listWidgets();
    };
    fetchData();
  }, []);

  useEffect(() => {
    // log('[DEBUG] Active Widgets:', activeWidgets);
    /* After removing all widgets, reset the dropdown state */
    if (activeWidgets.length === 0) {
      log('No more widgets: reset dropdown state');
      setOpenDropdownIndex(null);
    } else if (activeDraggableWidget?.clickBBox) {
      const index = activeWidgets.findIndex(
        (widget) => widget.generalParams.id === activeDraggableWidget.id
      );
      if (index !== -1) {
        /* Indicate that the dropdown was opened by a click */
        setIsBBoxClick(true);
        /* Reset click flag to be able to open dropdown with click */
        setIsBBoxClick(false);
      }
    }
  }, [activeDraggableWidget, activeWidgets]);

  /* Effect for opening last added widget by default */
  useEffect(() => {
    const currentWidgetIds = new Set(
      activeWidgets.map((widget) => widget.generalParams.id)
    );
    const previousWidgetIds = previousWidgetIdsRef.current;
    const newWidgetIds = [...currentWidgetIds].filter(
      (id) => !previousWidgetIds.has(id)
    );
    if (
      newWidgetIds.length > 0 &&
      (previousWidgetIds.size !== 0 || currentWidgetIds.size === 1)
    ) {
      const latestWidgetId = newWidgetIds[newWidgetIds.length - 1];
      setActiveDraggableWidget((prev) => ({
        ...prev,
        id: latestWidgetId
      }));
      const index = activeWidgets.findIndex(
        (widget) => widget.generalParams.id === latestWidgetId
      );
      if (index !== -1) {
        setOpenDropdownIndex(index);
      }
    }
    /* Update the previous IDs for the next comparison */
    previousWidgetIdsRef.current = currentWidgetIds;
  }, [activeWidgets, setActiveDraggableWidget, setOpenDropdownIndex]);

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
    (index: number) => {
      // console.log(index, openDropdownIndex);
      /* Set id of activeWidgets to current for updating bbox zIndex */
      setActiveDraggableWidget((prev) => ({
        ...prev,
        id: activeWidgets[index].generalParams.id
      }));
      if (!IsBBoxClick) {
        const newIndex = openDropdownIndex === index ? null : index;
        setOpenDropdownIndex(newIndex);
        /* If no widget is open reset activeDraggableWidget.id */
        if (newIndex === null) {
          setActiveDraggableWidget((prev) => ({
            ...prev,
            id: -1,
            active: false,
            highlight: false,
            clickBBox: false
          }));
        }
      }
      if (appSettings.widgetAutoBringFront) {
        setDepth('front', activeWidgets[index]);
      }
    },
    [
      activeWidgets,
      IsBBoxClick,
      openDropdownIndex,
      setActiveDraggableWidget,
      setOpenDropdownIndex,
      appSettings.widgetAutoBringFront,
      setDepth
    ]
  );

  const handleRemoveAllClick = () => {
    setOpenDialog(true);
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

      {/* Remove all widgets confirmation dialog */}
      <Dialog
        open={openDialog}
        onClose={handleDialogClose}
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
          <Button
            variant="outlined"
            onClick={handleDialogClose}
            color="primary"
          >
            No
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmRemoveAll}
            color="error"
            autoFocus
          >
            Yes
          </Button>
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
          .map((widget, index) => (
            <WidgetItem
              key={widget.generalParams.id}
              widget={widget}
              index={index}
              toggleDropdown={toggleDropdown}
            />
          ))}
      </Box>

      {/* Remove all widgets button */}
      <Button
        color="error"
        variant="contained"
        onClick={handleRemoveAllClick}
        disabled={activeWidgets.length === 0}
        startIcon={<DeleteIcon />}
      >
        Remove all widgets
      </Button>
    </Box>
  );
};

export default WidgetHandler;
