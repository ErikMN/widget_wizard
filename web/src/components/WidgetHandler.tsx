import React, { useEffect, useState } from 'react';
import { jsonRequest } from '../helpers/cgihelper';
import { ApiResponse, Widget, WidgetCapabilities } from '../widgetInterfaces';
import { W_CGI } from './constants';
import { log, enableLogging } from '../helpers/logger';
import WidgetItem from './WidgetItem';
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
import Typography from '@mui/material/Typography';

interface WidgetHandlerProps {
  handleOpenAlert: (
    content: string,
    severity: 'info' | 'success' | 'error' | 'warning'
  ) => void;
  activeWidgets: Widget[];
  setActiveWidgets: React.Dispatch<React.SetStateAction<Widget[]>>;
  updateWidget: (widgetItem: Widget) => Promise<void>;
}

const WidgetHandler: React.FC<WidgetHandlerProps> = ({
  handleOpenAlert,
  activeWidgets,
  setActiveWidgets,
  updateWidget
}) => {
  /* Local state */
  const [widgetCapabilities, setWidgetCapabilities] =
    useState<WidgetCapabilities | null>(null);
  const [selectedWidget, setSelectedWidget] = useState<string>('');
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(
    null
  );

  enableLogging(true);

  /* Lists all currently active widgets and their parameter values.
   * NOTE: This needs to be done after add, remove, update
   */
  const listWidgets = async () => {
    const payload = {
      apiVersion: '2.0',
      method: 'listWidgets'
    };
    try {
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);

      // log('*** LIST ACTIVE WIDGETS', { resp });
      if (resp?.data?.widgets && Array.isArray(resp.data.widgets)) {
        setActiveWidgets(resp.data.widgets);
      }
    } catch (error) {
      handleOpenAlert('Failed to list active widgets', 'error');
      console.error('Error:', error);
    }
  };

  /* Lists all available widget types and the parameters they take.
   */
  const listWidgetCapabilities = async () => {
    const payload = {
      apiVersion: '2.0',
      method: 'listCapabilities'
    };
    try {
      const resp: WidgetCapabilities = await jsonRequest(W_CGI, payload);
      // log('*** WIDGET CAPABILITIES', { resp });
      if (resp?.data?.widgets && Array.isArray(resp.data.widgets)) {
        /* Set the entire listCapabilities response object */
        setWidgetCapabilities(resp);
        /* Set the first widget type as selected if available */
        if (resp.data.widgets.length > 0) {
          setSelectedWidget(resp.data.widgets[0].type);
        }
      }
    } catch (error) {
      handleOpenAlert('Failed to list widget capabilities', 'error');
      console.error('Error:', error);
    }
  };

  /* Removes all currently active widgets. */
  const removeAllWidgets = async () => {
    const payload = {
      apiVersion: '2.0',
      method: 'removeAllWidgets'
    };
    try {
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      // log('*** REMOVE ALL WIDGETS', { resp });
      handleOpenAlert('Removed all widgets', 'success');
    } catch (error) {
      handleOpenAlert('Failed to remove all widgets', 'error');
      console.error('Error:', error);
    }
    /* After removing all widgets, refresh the active widgets list */
    listWidgets();
    /* After removing all widgets, reset the dropdown state */
    setOpenDropdownIndex(null);
  };

  /* Removes a specified widget. */
  const removeWidget = async (widgetID: number) => {
    const payload = {
      apiVersion: '2.0',
      method: 'removeWidget',
      params: {
        generalParams: {
          id: widgetID
        }
      }
    };
    try {
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      // log('*** REMOVE WIDGET', { resp });
      /* Instead of calling listWidgets, remove the widget from activeWidgets */
      setActiveWidgets((prevWidgets) =>
        prevWidgets.filter((widget) => widget.generalParams.id !== widgetID)
      );
      handleOpenAlert(`Removed widget ${widgetID}`, 'success');
    } catch (error) {
      handleOpenAlert(`Failed to remove widget ${widgetID}`, 'error');
      console.error('Error:', error);
    }
  };

  /* Effect triggering on activeWidgets */
  useEffect(() => {
    // log('[DEBUG] Active Widgets:', activeWidgets);
    /* After removing all widgets, reset the dropdown state */
    if (activeWidgets.length === 0) {
      log('No more widgets: reset dropdown state');
      setOpenDropdownIndex(null);
    }
  }, [activeWidgets]);

  /* Adds a new widget and returns the widget ID. */
  const addWidget = async (widgetType: string) => {
    const payload = {
      apiVersion: '2.0',
      method: 'addWidget',
      params: {
        generalParams: {
          type: widgetType,
          anchor: 'topLeft',
          channel: 1,
          isVisible: true,
          position: { x: 0, y: 0 },
          size: 'small',
          transparency: 0,
          updateTime: 1
        }
      }
    };
    try {
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      // log('*** ADD WIDGET', { resp });
      if (resp?.data) {
        /* After adding the widget, refresh the active widgets list */
        await listWidgets();
      }
      handleOpenAlert(`Added ${widgetType}`, 'success');
    } catch (error) {
      handleOpenAlert(`Failed to add ${widgetType}`, 'error');
      console.error('Error:', error);
    }
  };

  /* Component mount: Calls listWidgetCapabilities and listWidgets */
  useEffect(() => {
    const fetchData = async () => {
      await listWidgetCapabilities();
      await listWidgets();
    };
    fetchData();
  }, []);

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
    setOpenDropdownIndex(openDropdownIndex === index ? null : index);
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
      <Typography variant="h6" sx={{ textAlign: 'center' }}>
        Widgets menu | Active widgets: {activeWidgets.length}
      </Typography>

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
            widgetCapabilities={widgetCapabilities}
            openDropdownIndex={openDropdownIndex}
            toggleDropdown={toggleDropdown}
            removeWidget={removeWidget}
            updateWidget={updateWidget}
          />
        ))}
      </Box>
    </Box>
  );
};

export default WidgetHandler;
