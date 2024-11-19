/* WidgetParams: Auto generate widget specific parameter UI elements. (WIP) */
import React, { useState, useEffect, useRef } from 'react';
import { useWidgetContext } from '../WidgetContext';
import { Widget } from '../../widgetInterfaces';
import { debounce } from 'lodash';
import { capitalizeFirstLetter } from '../../helpers/utils';
import { CustomSwitch } from '../CustomComponents';
/* MUI */
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

/* TODO: add stuff here */
interface ParamConfig {
  type: 'string' | 'float' | 'bool' | 'enum';
  minimum?: number;
  maximum?: number;
  step?: number;
  enum?: string[];
}

interface WidgetParamsProps {
  widget: Widget;
}

const WidgetParams: React.FC<WidgetParamsProps> = ({ widget }) => {
  /* Global context */
  const { widgetCapabilities, updateWidget } = useWidgetContext();

  /* Store local values for all widget parameters */
  const [localValues, setLocalValues] = useState<Record<string, any>>(
    widget.widgetParams || {}
  );

  /* Refs */
  const widgetRef = useRef(widget);
  const updateWidgetRef = useRef(updateWidget);

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

  /* Update refs when widget or updateWidget change */
  useEffect(() => {
    widgetRef.current = widget;
    updateWidgetRef.current = updateWidget;
  }, [widget, updateWidget]);

  /* Debounced function for global widget updates */
  const debouncedHandleParamChange = useRef(
    debounce((paramKey: string, newValue: any) => {
      const updatedWidget = {
        ...widgetRef.current,
        widgetParams: {
          ...widgetRef.current.widgetParams,
          [paramKey]: newValue
        }
      };
      updateWidgetRef.current(updatedWidget);
    }, 500)
  ).current;

  /* Handle local state change and debounced global update */
  const handleLocalValueChange = (paramKey: string, newValue: any) => {
    setLocalValues((prevValues) => ({
      ...prevValues,
      [paramKey]: newValue
    }));
    debouncedHandleParamChange(paramKey, newValue);
  };

  /* Effect to sync localValues with widget updates */
  useEffect(() => {
    setLocalValues(widget.widgetParams || {});
  }, [widget.widgetParams]);

  /* Simple param UI rendering */
  const renderWidgetParam = (paramKey: string, paramConfig: ParamConfig) => {
    const paramValue = localValues[paramKey];

    switch (paramConfig.type) {
      /* A text input: {type: 'string'} */
      case 'string':
        return (
          <TextField
            label={capitalizeFirstLetter(paramKey)}
            value={paramValue !== undefined ? paramValue : ''}
            onChange={(e) => handleLocalValueChange(paramKey, e.target.value)}
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
              value={
                paramValue !== undefined ? paramValue : paramConfig.minimum
              }
              min={paramConfig.minimum}
              max={paramConfig.maximum}
              onChange={(e, newValue) => {
                setLocalValues((prevValues) => ({
                  ...prevValues,
                  [paramKey]: newValue
                }));
              }}
              onChangeCommitted={(e, newValue) =>
                handleLocalValueChange(paramKey, newValue as number)
              }
              // step={0.01}
              valueLabelDisplay="auto"
              step={paramConfig.step || 1}
            />
          </Box>
        );
      /* A switch: {type: 'bool'} */
      case 'bool':
        return (
          <Box display="flex" alignItems="center">
            <Typography>{capitalizeFirstLetter(paramKey)}</Typography>
            <CustomSwitch
              checked={!!paramValue}
              onChange={(e) => {
                const newValue = e.target.checked;
                handleLocalValueChange(paramKey, newValue);
              }}
              inputProps={{ 'aria-label': paramKey }}
            />
          </Box>
        );
      /* Dropdown: {type: 'enum'} */
      case 'enum':
        return (
          <Select
            value={paramValue !== undefined ? paramValue : ''}
            onChange={(e) => {
              const newValue = e.target.value;
              handleLocalValueChange(paramKey, newValue);
            }}
            fullWidth
          >
            {paramConfig.enum?.map((option: string) => (
              <MenuItem key={option} value={option}>
                {capitalizeFirstLetter(option)}
              </MenuItem>
            ))}
          </Select>
        );
      default:
        // console.warn(`Unhandled parameter type: ${paramConfig.type}`);
        return null;
    }
  };

  /* Render UI for each widget parameter */
  const filteredWidget = widgetCapabilities?.data?.widgets?.find(
    (widgetCap) => widgetCap.type === widget?.generalParams?.type
  );

  return (
    <Box sx={{ marginTop: 1.4 }}>
      <Typography variant="h6" sx={{ marginBottom: 1 }}>
        Widget parameters
      </Typography>
      {/* Render UI elements for each widget parameter */}
      {filteredWidget?.widgetParams &&
        Object.keys(filteredWidget.widgetParams).map((paramKey) => {
          const paramConfig = (
            filteredWidget.widgetParams as Record<string, ParamConfig>
          )[paramKey];
          return paramConfig ? (
            <Box key={paramKey} sx={{ marginBottom: 1 }}>
              {renderWidgetParam(paramKey, paramConfig)}
            </Box>
          ) : null;
        })}
    </Box>
  );
};

export default WidgetParams;
