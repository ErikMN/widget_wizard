/* WidgetSpecificParams: Auto generate widget specific parameter UI elements. (WIP) */
import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import { useWidgetContext } from './WidgetContext';
import { Widget } from './widgetInterfaces';
import { debounce } from 'lodash';
import { capitalizeFirstLetter, toNiceName } from '../../helpers/utils';
import { CustomSwitch, CustomSlider, CustomButton } from '../CustomComponents';
/* MUI */
import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import CloseIcon from '@mui/icons-material/Close';
import Collapse from '@mui/material/Collapse';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuItem from '@mui/material/MenuItem';
import SaveIcon from '@mui/icons-material/Save';
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

interface WidgetSpecificParamsProps {
  widget: Widget;
}

/* Define keys that are metadata, not actual nested params */
const META_KEYS = [
  'minimum',
  'maximum',
  'type',
  'enum',
  'defaultValue',
  'step'
];

const WidgetSpecificParams: React.FC<WidgetSpecificParamsProps> = ({
  widget
}) => {
  /* Global context */
  const { widgetCapabilities, updateWidget } = useWidgetContext();
  const { appSettings } = useAppContext();

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
            ml: 0,
            pl: 1.2,
            mt: 2
          })}
        >
          <Typography variant="subtitle2">{toNiceName(paramKey)}</Typography>
          {Object.keys(paramConfig).map((subKey) => {
            /* skip metadata keys */
            if (META_KEYS.includes(subKey)) {
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

    /* If 'type' itself is an array (e.g. ["light","dark"]), treat as enum */
    if (Array.isArray(paramConfig.type)) {
      return renderEnumDropdown(
        path,
        paramKey,
        paramConfig,
        value,
        paramConfig.type
      );
    }

    /**
     * Handle recognized parameter types.
     * Each case below maps a schema-defined "type" to the correct renderer.
     * Supported types:
     *  - "float"   --> numeric slider or number input (depending on min/max)
     *  - "integer" --> integer input field
     *  - "bool"    --> on/off switch
     *  - "enum"    --> dropdown using enum options
     *  - "string"  --> text input field
     *  - "array"   --> list of structured objects, rendered recursively
     *  Any unrecognized type logs a warning in debug mode.
     */
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
      case 'array':
        return renderArrayInput(path, paramKey, paramConfig, value);
      default:
        if (appSettings.debug) {
          console.warn(`Unhandled parameter type: ${paramConfig.type}`);
        }
        return null;
    }
  };

  /****************************************************************************/
  /* UI element renderers */

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
          label={toNiceName(label)}
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
        <Typography sx={{ mr: 2 }}>{toNiceName(label)}</Typography>
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
    /* If `maximum` is undefined, show a number input */
    if (paramConfig.maximum === undefined) {
      const rawVal = getNestedValue(localValues, path);
      const displayVal =
        typeof rawVal === 'number' ? String(rawVal) : (rawVal ?? '');

      return (
        <Box key={path} sx={{ mt: 2 }}>
          <TextField
            size="small"
            type="number"
            label={toNiceName(label)}
            value={displayVal}
            onChange={(e) => {
              /* Update localValues with raw string, no backend call yet */
              setLocalValues((prev) =>
                setNestedValue(prev, path, e.target.value)
              );
            }}
            onBlur={(e) => {
              const valStr = e.target.value.trim();
              /* Do nothing if field is empty or just '-' */
              if (valStr === '' || valStr === '-') {
                return;
              }
              /* Parse and send only when user finishes typing a valid number */
              const parsed = parseFloat(valStr);
              if (!isNaN(parsed)) {
                handleNestedValueChange(path, parsed);
              }
            }}
            fullWidth
            sx={smallTextFieldSx}
          />
        </Box>
      );
    }
    /* Otherwise, show a slider */
    const val = value ?? paramConfig.minimum ?? 0;
    return (
      <Box key={path} sx={{ mt: 2 }}>
        <Typography>
          {toNiceName(label)}: {val}
        </Typography>
        <CustomSlider
          value={val}
          min={paramConfig.minimum ?? 0}
          max={paramConfig.maximum ?? 100}
          step={paramConfig.step ?? 0.1}
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
          label={toNiceName(label)}
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
        <Typography>{toNiceName(label)}</Typography>
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

  /**
   * FIXME: Add proper nested array support
   *
   * Render array-type parameters.
   * Used when a parameter has type: "array" and defines a nested object schema in paramConfig.value.
   * Example:
   *   "points": {
   *     "type": "array",
   *     "value": { "x": { "type": "float" }, "y": { "type": "float" } }
   *   }
   *
   * Displays a list of structured objects (one per array element), each editable in local state.
   * Supports nested arrays recursively (arrays containing arrays).
   *
   * Changes to fields are kept locally until the user presses the "Update" button,
   * which then sends the entire array structure to the backend via handleNestedValueChange().
   *
   * The user can:
   * - Add new items using "+ Add item"
   * - Remove specific items using the X button
   * - Modify any field (float, integer, string, bool, or nested arrays)
   * - Apply all local edits with the "Update" button
   *
   * Each nested array level maintains its own local editable state and update control.
   */
  const renderArrayInput = (
    path: string,
    label: string,
    paramConfig: ParamConfig,
    value: Record<string, any>[] | undefined
  ) => {
    /* Local editable copy */
    const [localItems, setLocalItems] = useState<Record<string, any>[]>(() =>
      Array.isArray(value) ? value : []
    );

    /* Collapsed state for better UX when lists are long */
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
      if (Array.isArray(value)) {
        setLocalItems(value);
      }
    }, [value]);

    const handleAdd = () => {
      const newItem: Record<string, any> = {};
      for (const subKey of Object.keys(paramConfig.value || {})) {
        const def = paramConfig.value[subKey];
        newItem[subKey] = def.defaultValue ?? '';
      }
      setLocalItems((prev) => [...prev, newItem]);
    };

    const handleRemove = (index: number) => {
      setLocalItems((prev) => prev.filter((_, i) => i !== index));
    };

    const handleUpdateBackend = () => {
      handleNestedValueChange(path, localItems);
    };

    /* Handles updates of subfields (x, y, etc.) */
    const handleFieldChange = (
      itemIndex: number,
      subKey: string,
      newValue: any
    ) => {
      setLocalItems((prev) => {
        const newArr = [...prev];
        newArr[itemIndex] = {
          ...newArr[itemIndex],
          [subKey]: newValue
        };
        return newArr;
      });
    };

    return (
      <Box
        key={path}
        /* Left-hand divider for array entities */
        sx={(theme) => ({
          borderLeft: `1px solid ${theme.palette.grey[600]}`,
          pl: 1.2,
          mt: 2
        })}
      >
        {/* Header with collapse toggle */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          <Typography variant="subtitle2">{toNiceName(label)}</Typography>
          {collapsed ? (
            <ExpandMoreIcon fontSize="small" />
          ) : (
            <ExpandLessIcon fontSize="small" />
          )}
        </Box>

        {/* Collapsible content */}
        <Collapse in={!collapsed} timeout="auto" unmountOnExit>
          {localItems.length === 0 ? (
            <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 1 }}>
              No items yet.
            </Typography>
          ) : (
            <Box sx={{ mt: 1 }} />
          )}

          {localItems.map((item, index) => (
            <Box
              key={index}
              sx={(theme) => ({
                position: 'relative',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 1,
                p: 1.2,
                mt: 1
              })}
            >
              {/* Top bar with label and X button */}
              <Box
                sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}
              >
                <Typography variant="body2">{`Item ${index + 1}`}</Typography>

                <CustomButton
                  size="small"
                  onClick={() => handleRemove(index)}
                  sx={{
                    minWidth: '28px',
                    lineHeight: '16px',
                    p: 0.4,
                    minHeight: '28px'
                  }}
                >
                  <CloseIcon fontSize="small" />
                </CustomButton>
              </Box>

              {/* Render editable subfields */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {Object.keys(paramConfig.value || {}).map((subKey) => {
                  const fieldConfig = paramConfig.value[subKey];
                  const fieldValue = item[subKey];

                  /* Support nested arrays by calling renderArrayInput recursively */
                  if (fieldConfig.type === 'array') {
                    return (
                      <Box
                        key={subKey}
                        sx={(theme) => ({
                          flex: '1 1 100%',
                          minWidth: '100%',
                          mt: 1,
                          pl: 2,
                          borderLeft: `1px dashed ${theme.palette.divider}`
                        })}
                      >
                        {renderArrayInput(
                          `${path}.${index}.${subKey}`,
                          subKey,
                          fieldConfig,
                          fieldValue
                        )}
                      </Box>
                    );
                  }

                  /* Render a proper input for this field type */
                  switch (fieldConfig.type) {
                    case 'float':
                    case 'integer':
                      return (
                        <Box
                          key={subKey}
                          sx={{ flex: '1 1 120px', minWidth: '120px' }}
                        >
                          <TextField
                            size="small"
                            label={toNiceName(subKey)}
                            type="number"
                            value={fieldValue ?? ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              handleFieldChange(
                                index,
                                subKey,
                                isNaN(val) ? '' : val
                              );
                            }}
                            fullWidth
                          />
                        </Box>
                      );
                    case 'string':
                      return (
                        <Box
                          key={subKey}
                          sx={{ flex: '1 1 120px', minWidth: '120px' }}
                        >
                          <TextField
                            size="small"
                            label={toNiceName(subKey)}
                            value={fieldValue ?? ''}
                            onChange={(e) =>
                              handleFieldChange(index, subKey, e.target.value)
                            }
                            fullWidth
                          />
                        </Box>
                      );
                    case 'bool':
                      return (
                        <Box
                          key={subKey}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            flex: '1 1 120px',
                            minWidth: '120px'
                          }}
                        >
                          <Typography sx={{ mr: 1 }}>
                            {toNiceName(subKey)}
                          </Typography>
                          <CustomSwitch
                            checked={!!fieldValue}
                            onChange={(e) =>
                              handleFieldChange(index, subKey, e.target.checked)
                            }
                          />
                        </Box>
                      );
                    default:
                      return (
                        <Box
                          key={subKey}
                          sx={{ flex: '1 1 120px', minWidth: '120px' }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ color: 'grey.500' }}
                          >
                            Unsupported type: {fieldConfig.type}
                          </Typography>
                        </Box>
                      );
                  }
                })}
              </Box>
            </Box>
          ))}

          {/* Buttons */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
            <CustomButton
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAdd}
            >
              Add item
            </CustomButton>
            <CustomButton
              variant="outlined"
              startIcon={<SaveIcon />}
              onClick={handleUpdateBackend}
            >
              Update
            </CustomButton>
          </Box>
        </Collapse>
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

export default WidgetSpecificParams;
