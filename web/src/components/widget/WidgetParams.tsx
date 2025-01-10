/* WidgetParams: Auto generate widget specific parameter UI elements. (WIP) */
import React, { useState, useEffect, useRef } from 'react';
import { useGlobalContext } from '../GlobalContext';
import { Widget } from './widgetInterfaces';
import { debounce } from 'lodash';
import { capitalizeFirstLetter } from '../../helpers/utils';
import { CustomSwitch, CustomSlider } from '../CustomComponents';
/* MUI */
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface ParamConfig {
  type?: string | string[];
  minimum?: number;
  maximum?: number;
  step?: number;
  enum?: string[];
  defaultValue?: any;
  [key: string]: any;
}

interface WidgetParamsProps {
  widget: Widget;
}

const WidgetParams: React.FC<WidgetParamsProps> = ({ widget }) => {
  /* Global context */
  const { widgetCapabilities, updateWidget, appSettings } = useGlobalContext();

  /* Store local values for all widget parameters */
  const [localValues, setLocalValues] = useState<Record<string, any>>(
    widget.widgetParams || {}
  );

  /* Refs */
  const widgetRef = useRef(widget);
  const updateWidgetRef = useRef(updateWidget);

  /* Update refs when widget or updateWidget change */
  useEffect(() => {
    widgetRef.current = widget;
    updateWidgetRef.current = updateWidget;
  }, [widget, updateWidget]);

  /**
   * If external changes come in (widget.widgetParams changes),
   * we sync them into our local state.
   */
  useEffect(() => {
    setLocalValues(widget.widgetParams || {});
  }, [widget.widgetParams]);

  /**
   * Debounced: whenever a param changes, we store it in local state
   * and after 500ms, call updateWidget with the *entire* nested structure
   */
  const debouncedUpdate = useRef(
    debounce((newLocalValues: Record<string, any>) => {
      const updatedWidget = {
        ...widgetRef.current,
        widgetParams: newLocalValues /* pass the nested object as-is */
      };
      updateWidgetRef.current(updatedWidget);
    }, 500)
  ).current;

  /**
   * Called whenever a user changes a field (including nested).
   * We store it in local state, then fire off the debounced update.
   */
  const handleNestedValueChange = (path: string, newValue: any) => {
    setLocalValues((prev) => {
      const updated = setNestedValue(prev, path, newValue);
      debouncedUpdate(updated);
      return updated;
    });
  };

  /**
   * Helper: get nested value from localValues
   */
  const getNestedValue = (object: any, path: string) => {
    const keys = path.split('.');
    let current = object;
    for (const k of keys) {
      if (current == null) return undefined;
      current = current[k];
    }
    return current;
  };

  /**
   * Helper: set nested value immutably
   * e.g. setNestedValue(localValues, "yInterval.yMax", 42)
   */
  const setNestedValue = (
    object: Record<string, any>,
    path: string,
    newValue: any
  ): Record<string, any> => {
    const keys = path.split('.');
    const newObj = { ...object };
    let current: any = newObj;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (i === keys.length - 1) {
        current[k] = newValue;
      } else {
        current[k] = { ...current[k] };
        current = current[k];
      }
    }
    return newObj;
  };

  /****************************************************************************/

  /**
   * Renders a param. If it's an object with no 'type', we assume nested.
   */
  const renderWidgetParam = (
    paramKey: string,
    paramConfig: ParamConfig,
    parentPath = ''
  ) => {
    const path = parentPath ? `${parentPath}.${paramKey}` : paramKey;

    /* If paramConfig is an object that doesn't have a direct type or an array as type,
       it's probably a nested group (e.g. yInterval, maxAlarmThreshold, etc.) */
    const hasNoDirectType =
      !paramConfig.type ||
      (typeof paramConfig.type !== 'string' &&
        !Array.isArray(paramConfig.type));

    if (hasNoDirectType) {
      return (
        <Box
          key={path}
          /* Set a margin for nested types */
          sx={(theme) => ({
            borderLeft: `1px solid ${theme.palette.grey[600]}`,
            ml: 1,
            pl: 2,
            mt: 2
          })}
        >
          <Typography variant="subtitle2">
            {capitalizeFirstLetter(paramKey)}
          </Typography>
          {Object.keys(paramConfig).map((subKey) => {
            /* skip if subKey is something like 'defaultValue' */
            if (
              [
                'minimum',
                'maximum',
                'type',
                'enum',
                'defaultValue',
                'step'
              ].includes(subKey)
            ) {
              return null;
            }
            return renderWidgetParam(subKey, paramConfig[subKey], path);
          })}
        </Box>
      );
    }

    /* Otherwise, handle enumerations first if present */
    let value = getNestedValue(localValues, path);
    if (value === undefined && paramConfig.defaultValue !== undefined) {
      value = paramConfig.defaultValue;
    }

    /* If paramConfig.enum is present, treat it like an enum dropdown,
       even if paramConfig.type is "string" */
    if (Array.isArray(paramConfig.enum) && paramConfig.enum.length > 0) {
      return renderEnumDropdown(
        path,
        paramKey,
        paramConfig,
        value,
        paramConfig.enum
      );
    }

    /* If type is an array => treat that as an enum too (clock "theme": ["light","dark"]) */
    if (Array.isArray(paramConfig.type)) {
      return renderEnumDropdown(
        path,
        paramKey,
        paramConfig,
        value,
        paramConfig.type
      );
    }

    switch (paramConfig.type) {
      case 'float':
        return renderFloatSlider(path, paramKey, paramConfig, value);
      case 'integer':
        return renderIntegerInput(path, paramKey, paramConfig, value);
      case 'bool':
        return renderSwitch(path, paramKey, paramConfig, !!value);
      case 'enum':
        return renderEnumDropdown(
          path,
          paramKey,
          paramConfig,
          value,
          paramConfig.enum
        );
      case 'string':
        return renderStringInput(path, paramKey, paramConfig, value);
      default:
        if (appSettings.debug) {
          console.warn(`Unhandled parameter type: ${paramConfig.type}`);
        }
        return null;
    }
  };

  /****************************************************************************/
  /* Renderers */

  /* Common style for smaller text fields */
  const smallTextFieldSx = {
    height: '40px',
    '& .MuiOutlinedInput-root': { height: '100%' },
    '& .MuiInputLabel-root': { top: '-4px' }
  };

  const renderStringInput = (
    path: string,
    label: string,
    paramConfig: ParamConfig,
    value: any
  ) => {
    return (
      <Box key={path} sx={{ mt: 2 }}>
        <TextField
          size="small"
          label={capitalizeFirstLetter(label)}
          value={value ?? ''}
          onChange={(e) => handleNestedValueChange(path, e.target.value)}
          fullWidth
          sx={smallTextFieldSx}
        />
      </Box>
    );
  };

  const renderSwitch = (
    path: string,
    label: string,
    paramConfig: ParamConfig,
    value: boolean
  ) => {
    return (
      <Box key={path} sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
        <Typography sx={{ mr: 2 }}>{capitalizeFirstLetter(label)}</Typography>
        <CustomSwitch
          checked={value}
          onChange={(e) => handleNestedValueChange(path, e.target.checked)}
        />
      </Box>
    );
  };

  const renderFloatSlider = (
    path: string,
    label: string,
    paramConfig: ParamConfig,
    value: number
  ) => {
    const val = value ?? paramConfig.minimum ?? 0;
    /* If `maximum` is undefined, show a number input */
    if (paramConfig.maximum === undefined) {
      return (
        <Box key={path} sx={{ mt: 2 }}>
          <TextField
            size="small"
            type="number"
            label={capitalizeFirstLetter(label)}
            value={val}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              handleNestedValueChange(path, isNaN(parsed) ? 0 : parsed);
            }}
            fullWidth
            sx={smallTextFieldSx}
          />
        </Box>
      );
    }
    /* Otherwise, show a slider */
    return (
      <Box key={path} sx={{ mt: 2 }}>
        <Typography>
          {capitalizeFirstLetter(label)}: {val}
        </Typography>
        <CustomSlider
          value={val}
          min={paramConfig.minimum ?? 0}
          max={paramConfig.maximum ?? 100}
          step={paramConfig.step || 1}
          onChange={(e, newVal) => {
            /* immediate UI update */
            setLocalValues((prev) =>
              setNestedValue(prev, path, newVal as number)
            );
          }}
          onChangeCommitted={(e, newVal) => {
            /* Debounced call to update widget */
            handleNestedValueChange(path, newVal as number);
          }}
        />
      </Box>
    );
  };

  const renderIntegerInput = (
    path: string,
    label: string,
    paramConfig: ParamConfig,
    value: number
  ) => {
    return (
      <Box key={path} sx={{ mt: 2 }}>
        <TextField
          size="small"
          label={capitalizeFirstLetter(label)}
          type="number"
          value={value ?? ''}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            handleNestedValueChange(path, isNaN(parsed) ? 0 : parsed);
          }}
          fullWidth
          sx={smallTextFieldSx}
        />
      </Box>
    );
  };

  const renderEnumDropdown = (
    path: string,
    label: string,
    paramConfig: ParamConfig,
    value: any,
    options?: string[]
  ) => {
    const enumOptions = options ?? paramConfig.enum ?? [];
    return (
      <Box key={path} sx={{ mt: 2 }}>
        <Typography>{capitalizeFirstLetter(label)}</Typography>
        <Select
          size="small"
          value={value ?? ''}
          onChange={(e) => handleNestedValueChange(path, e.target.value)}
          fullWidth
          sx={{ mt: 1 }}
        >
          {enumOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {capitalizeFirstLetter(option)}
            </MenuItem>
          ))}
        </Select>
      </Box>
    );
  };

  /****************************************************************************/

  /* Identify capabilities for the current widget type */
  const filteredWidget = widgetCapabilities?.data?.widgets?.find(
    (widgetCap) => widgetCap.type === widget?.generalParams?.type
  );

  /* Cast widgetParams to a typed record to avoid TS7053 error */
  const paramConfigs =
    (filteredWidget?.widgetParams as Record<string, ParamConfig>) || {};

  return (
    <Box sx={{ marginTop: 1.4 }}>
      <Typography variant="h6" sx={{ marginBottom: 1 }}>
        Widget parameters
      </Typography>
      {/* Render UI elements for each widget parameter */}
      {Object.keys(paramConfigs).map((paramKey) =>
        renderWidgetParam(paramKey, paramConfigs[paramKey])
      )}
    </Box>
  );
};

export default WidgetParams;
