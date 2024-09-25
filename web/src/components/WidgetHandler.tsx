/* Widget Wizard
 * WidgetHandler: Handler of widgets.
 */
import React, { useEffect, useState } from 'react';
import { log, enableLogging } from '../helpers/logger';
import WidgetItem from './WidgetItem';
import { useWidgetContext } from './WidgetContext';
/* MUI */
import { SelectChangeEvent } from '@mui/material/Select';
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

const WidgetHandler: React.FC = () => {
  /* Local state */
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [isDoubleClick, setIsDoubleClick] = useState<boolean>(false);

  /* Global context */
  const {
    activeDraggableWidget,
    activeWidgets,
    listWidgets,
    listWidgetCapabilities,
    addWidget,
    removeAllWidgets,
    selectedWidget,
    setSelectedWidget,
    widgetCapabilities,
    openDropdownIndex,
    setOpenDropdownIndex
  } = useWidgetContext();

  enableLogging(true);

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
    } else if (activeDraggableWidget?.doubleClick) {
      const index = activeWidgets.findIndex(
        (widget) => widget.generalParams.id === activeDraggableWidget.id
      );
      if (index !== -1) {
        /* Indicate that the dropdown was opened by a double-click */
        setIsDoubleClick(true);
        /* Open the dropdown for this widget */
        setOpenDropdownIndex(index);
        /* Reset double-click flag to be able to open dropdown with click */
        setIsDoubleClick(false);
      }
    }
  }, [activeDraggableWidget, activeWidgets]);

  /* Handle dropdown change */
  const handleWidgetChange = (event: SelectChangeEvent<string>) => {
    setSelectedWidget(event.target.value);
  };

  /* Handle add button click */
  const handleAddClick = () => {
    log('Add widget:', selectedWidget);
    addWidget(selectedWidget);
  };

  /* Handle dropdown toggle */
  const toggleDropdown = (index: number) => {
    // console.log(index, openDropdownIndex);
    if (!isDoubleClick) {
      setOpenDropdownIndex(openDropdownIndex === index ? null : index);
    }
  };

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

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '10px'
      }}
    >
      {/* Container for dropdown and button */}
      <Box sx={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
        {/* Dropdown for widget names */}
        <FormControl fullWidth variant="outlined">
          <InputLabel id="widget-select-label">Select Widget</InputLabel>
          <Select
            labelId="widget-select-label"
            id="widget-select"
            value={selectedWidget}
            onChange={handleWidgetChange}
            label="Select Widget"
          >
            {widgetCapabilities?.data.widgets.map((widget, index) => (
              <MenuItem key={index} value={widget.type}>
                {widget.type}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Plus sign button */}
        <IconButton
          color="primary"
          aria-label="add widget"
          onClick={handleAddClick}
          sx={{ marginLeft: 1 }}
        >
          <AddIcon />
        </IconButton>
      </Box>

      {/* Remove all widgets button */}
      <Button
        style={{ marginTop: '10px' }}
        color="error"
        variant="contained"
        onClick={handleRemoveAllClick}
        disabled={activeWidgets.length === 0}
        startIcon={<DeleteIcon />}
      >
        Remove all widgets
      </Button>

      {/* Remove all widgets confirmation dialog */}
      <Dialog
        open={openDialog}
        onClose={handleDialogClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          {'Remove all widgets'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to remove all widgets? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose} color="primary">
            No
          </Button>
          <Button onClick={handleConfirmRemoveAll} color="error" autoFocus>
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      {/* List of Active Widgets */}
      <Box sx={{ marginTop: 2 }}>
        {activeWidgets.map((widget, index) => (
          <WidgetItem
            key={widget.generalParams.id}
            widget={widget}
            index={index}
            toggleDropdown={toggleDropdown}
          />
        ))}
      </Box>
    </Box>
  );
};

export default WidgetHandler;
