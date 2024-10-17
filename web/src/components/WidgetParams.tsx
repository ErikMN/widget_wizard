import React from 'react';
import { useWidgetContext } from './WidgetContext';
import { Widget } from '../widgetInterfaces';
/* MUI */
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface WidgetParamsProps {
  widget: Widget;
}

const WidgetParams: React.FC<WidgetParamsProps> = ({ widget }) => {
  /* Global context */
  const { appSettings, widgetCapabilities, updateWidget } = useWidgetContext();

  /* Print widget params capabilities for this widget */
  const widgetCap = widgetCapabilities?.data?.widgets?.filter(
    (widgetCap) => widgetCap.type === widget?.generalParams?.type
  );
  if (widgetCap && widgetCap.length > 0) {
    console.log('Widget capabilities:', widgetCap[0]?.widgetParams);
  }
  /* Print widget param values for this widget */
  console.log('Widget params:', widget?.widgetParams);

  const filteredWidget = widgetCapabilities?.data?.widgets?.find(
    (widgetCap) => widgetCap.type === widget?.generalParams?.type
  );

  /* Simple param UI */
  const renderWidgetParam = (
    paramKey: string,
    paramValue: any,
    paramConfig: any
  ) => {
    switch (paramConfig.type) {
      /* A text input: {type: 'string'} */
      case 'string':
        return (
          <TextField
            label={paramKey}
            value={paramValue}
            onChange={(e) => console.log(`Update ${paramKey}:`, e.target.value)}
            fullWidth
            margin="normal"
          />
        );
      /* A slider: {type: 'float', minimum: 0, maximum: 100} */
      case 'float':
        return (
          <Box>
            <Typography>{paramKey}</Typography>
            <Slider
              value={paramValue}
              min={paramConfig.minimum}
              max={paramConfig.maximum}
              onChange={(e, newValue) =>
                console.log(`Update ${paramKey}:`, newValue)
              }
              step={0.01}
              valueLabelDisplay="auto"
            />
          </Box>
        );
      /* A switch: {type: 'bool'} */
      case 'bool':
        return (
          <Box display="flex" alignItems="center">
            <Typography>{paramKey}</Typography>
            <Switch
              checked={paramValue}
              onChange={(e) =>
                console.log(`Update ${paramKey}:`, e.target.checked)
              }
              inputProps={{ 'aria-label': paramKey }}
            />
          </Box>
        );
      case 'enum':
        return (
          <Select
            value={paramValue}
            onChange={(e) => console.log(`Update ${paramKey}:`, e.target.value)}
            fullWidth
          >
            {paramConfig.enum.map((option: string) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        );
      default:
        return null;
    }
  };

  return (
    <Box sx={{ marginTop: 1 }}>
      <Typography variant="h6" sx={{ marginBottom: 1 }}>
        Widget Parameters
      </Typography>
      {/* Render UI elements for each widget parameter */}
      {filteredWidget &&
        filteredWidget.widgetParams &&
        widget.widgetParams &&
        Object.keys(widget.widgetParams).map((paramKey) => {
          const paramValue = (widget.widgetParams as Record<string, any>)[
            paramKey
          ];
          const paramConfig = (
            filteredWidget.widgetParams as Record<string, any>
          )[paramKey];

          if (paramConfig) {
            return (
              <Box key={paramKey} sx={{ marginBottom: 2 }}>
                {renderWidgetParam(paramKey, paramValue, paramConfig)}
              </Box>
            );
          } else {
            return null;
          }
        })}
    </Box>
  );
};

export default WidgetParams;
