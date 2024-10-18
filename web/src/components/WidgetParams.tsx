import React, { useCallback, useState } from 'react';
import { useWidgetContext } from './WidgetContext';
import { Widget } from '../widgetInterfaces';
import { debounce } from 'lodash';
import { capitalizeFirstLetter } from '../helpers/utils';
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

  /* Function to print widget parameters and capabilities */
  const printParams = () => {
    /* Print widget params capabilities for this widget */
    const widgetCap = widgetCapabilities?.data?.widgets?.filter(
      (widgetCap) => widgetCap.type === widget?.generalParams?.type
    );
    if (widgetCap && widgetCap.length > 0) {
      console.log('Widget capabilities:', widgetCap[0]?.widgetParams);
    }
    /* Print widget param values for this widget */
    console.log('Widget params:', widget?.widgetParams);
  };
  // printParams();

  const filteredWidget = widgetCapabilities?.data?.widgets?.find(
    (widgetCap) => widgetCap.type === widget?.generalParams?.type
  );

  /* Simple param UI */
  const renderWidgetParam = (
    paramKey: string,
    paramValue: any,
    paramConfig: any
  ) => {
    const [localValue, setLocalValue] = useState(paramValue);

    /* Handle widget parameter changes (debounced for text inputs) */
    const handleParamChange = useCallback(
      debounce((paramKey: string, newValue: any) => {
        const updatedWidget = {
          ...widget,
          widgetParams: {
            ...widget.widgetParams,
            [paramKey]: newValue
          }
        };
        updateWidget(updatedWidget);
      }, 300),
      [widget, updateWidget]
    );

    /* Immediate handler for updating local value */
    const handleLocalValueChange = (newValue: any) => {
      setLocalValue(newValue);
    };

    switch (paramConfig.type) {
      /* A text input: {type: 'string'} */
      case 'string':
        return (
          <TextField
            label={capitalizeFirstLetter(paramKey)}
            value={localValue}
            onChange={(e) => handleLocalValueChange(e.target.value)}
            onBlur={() => handleParamChange(paramKey, localValue)}
            fullWidth
            margin="normal"
            sx={{
              height: '40px',
              '& .MuiOutlinedInput-root': {
                height: '100%'
              },
              '& .MuiInputLabel-root': {
                top: '-4px'
              }
            }}
          />
        );
      /* A slider: {type: 'float', minimum: 0, maximum: 100} */
      case 'float':
        return (
          <Box>
            <Typography>{capitalizeFirstLetter(paramKey)}</Typography>
            <Slider
              value={localValue}
              min={paramConfig.minimum}
              max={paramConfig.maximum}
              onChange={(e, newValue) => handleLocalValueChange(newValue)}
              onChangeCommitted={(e, newValue) =>
                handleParamChange(paramKey, newValue)
              }
              // step={0.01}
              valueLabelDisplay="auto"
            />
          </Box>
        );
      /* A switch: {type: 'bool'} */
      case 'bool':
        return (
          <Box display="flex" alignItems="center">
            <Typography>{capitalizeFirstLetter(paramKey)}</Typography>
            <Switch
              checked={!!localValue}
              onChange={(e) => {
                const newValue = e.target.checked;
                handleLocalValueChange(newValue);
                handleParamChange(paramKey, newValue);
              }}
              inputProps={{ 'aria-label': paramKey }}
            />
          </Box>
        );
      /* Dropdown: {type: 'enum'} */
      case 'enum':
        return (
          <Select
            value={localValue}
            onChange={(e) => {
              const newValue = e.target.value;
              handleLocalValueChange(newValue);
              handleParamChange(paramKey, newValue);
            }}
            fullWidth
          >
            {paramConfig.enum.map((option: string) => (
              <MenuItem key={option} value={option}>
                {capitalizeFirstLetter(option)}
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
