import React, { useEffect, useState } from 'react';
import { jsonRequest } from '../helpers/cgihelper';
/* MUI */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import IconButton from '@mui/material/IconButton';
import AddIcon from '@mui/icons-material/Add';
import { SelectChangeEvent } from '@mui/material/Select';

/* CGI endpoints */
const W_CGI = '/axis-cgi/overlaywidget/overlaywidget.cgi';

interface Widget {
  type: string;
  widgetParams?: object;
}

interface ApiResponse {
  apiVersion: string;
  data: {
    widgets: Widget[];
  };
}

const WidgetHandler: React.FC = () => {
  /* Local state */
  const [widgetNames, setWidgetNames] = useState<string[]>([]);
  const [selectedWidget, setSelectedWidget] = useState<string>('');

  /* Component mount calls */
  useEffect(() => {
    /* Lists all available widget types and the parameters they take. */
    const listCapabilities = async () => {
      const payload = {
        apiVersion: '2.0',
        method: 'listCapabilities'
      };
      try {
        const resp: ApiResponse = await jsonRequest(W_CGI, payload);
        console.log({ resp });
        if (resp?.data?.widgets && Array.isArray(resp.data.widgets)) {
          const widgetTypes = resp.data.widgets.map(
            (widget: Widget) => widget.type
          );
          setWidgetNames(widgetTypes);
          if (widgetTypes.length > 0) {
            setSelectedWidget(widgetTypes[0]);
          }
        }
      } catch (error) {
        console.error('Error:', error);
      }
    };

    listCapabilities();
  }, []);

  /* Handle dropdown change */
  const handleWidgetChange = (event: SelectChangeEvent<string>) => {
    setSelectedWidget(event.target.value);
  };

  /* Handle add button click */
  const handleAddClick = () => {
    console.log('Add widget:', selectedWidget);
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
      <Typography>Widgets</Typography>

      {/* Container for dropdown and button */}
      <Box sx={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
        {/* Plus sign button */}
        <IconButton
          color="primary"
          aria-label="add widget"
          onClick={handleAddClick}
          sx={{ marginRight: 2 }}
        >
          <AddIcon />
        </IconButton>

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
            {widgetNames.map((widgetName, index) => (
              <MenuItem key={index} value={widgetName}>
                {widgetName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    </Box>
  );
};

export default WidgetHandler;
