/* Widget Wizard
 * WidgetItem: Represent one widget.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Widget } from '../widgetInterfaces';
import { useWidgetContext } from './WidgetContext';
import { capitalizeFirstLetter } from '../helpers/utils';
import { useDebouncedValue } from '../helpers/hooks.jsx';
import WidgetParams from './WidgetParams';
import ReactJson from 'react-json-view';
/* MUI */
import { SelectChangeEvent } from '@mui/material/Select';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DataObjectIcon from '@mui/icons-material/DataObject';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ImageIcon from '@mui/icons-material/Image';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import WidgetsIcon from '@mui/icons-material/Widgets';

interface WidgetItemProps {
  widget: Widget;
  index: number;
  toggleDropdown: (index: number) => void;
}

const WidgetItem: React.FC<WidgetItemProps> = ({
  widget,
  index,
  toggleDropdown
}) => {
  /* Local state */
  const [isVisible, setIsVisible] = useState(widget.generalParams.isVisible);
  const [jsonVisible, setJsonVisible] = useState<boolean>(false);
  const [widgetParamsVisible, setWidgetParamsVisible] =
    useState<boolean>(false);
  const [widgetId, setWidgetId] = useState<number | null>(null);
  const [jsonInput, setJsonInput] = useState<string>(
    JSON.stringify(widget, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [sliderValue, setSliderValue] = useState<number>(
    widget.generalParams.transparency
  );
  const [datasource, setDatasource] = useState<string>(
    widget.generalParams.datasource
  );
  const [channel, setChannel] = useState<number>(widget.generalParams.channel);
  const [updateTime, setUpdateTime] = useState<number>(
    widget.generalParams.updateTime
  );

  /* Global context */
  const {
    appSettings,
    removeWidget,
    updateWidget,
    addCustomWidget,
    widgetCapabilities,
    openDropdownIndex,
    activeDraggableWidget
  } = useWidgetContext();

  /* Safe JSON parser */
  const safeParseJson = (json: string) => {
    try {
      return JSON.parse(json);
    } catch (err) {
      return null;
    }
  };

  /* Update jsonInput whenever widget prop changes */
  useEffect(() => {
    /* Store the widget's id */
    if (widget.generalParams && widget.generalParams.id) {
      setWidgetId(widget.generalParams.id);
    }
    /* Deep widget copy */
    const widgetCopy = safeParseJson(JSON.stringify(widget));
    /* Remove ID in order to not edit other widgets */
    if (widgetCopy.generalParams && widgetCopy.generalParams.id) {
      delete widgetCopy.generalParams.id;
    }
    setJsonInput(JSON.stringify(widgetCopy, null, 2));
    setJsonError(null);
  }, [widget]);

  /****************************************************************************/
  /* Handle UI updates for general parameters */

  const handleVisibilityChange = useCallback(() => {
    const newVisibility = !isVisible;
    setIsVisible(newVisibility);
    const updatedWidget = {
      ...widget,
      generalParams: {
        ...widget.generalParams,
        isVisible: newVisibility
      }
    };
    updateWidget(updatedWidget);
  }, [isVisible, widget, updateWidget]);

  const handleAnchorChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      const newAnchor = event.target.value as string;
      const updatedWidget = {
        ...widget,
        generalParams: {
          ...widget.generalParams,
          anchor: newAnchor
        }
      };
      updateWidget(updatedWidget);
    },
    [widget, updateWidget]
  );

  const handleSizeChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      const newSize = event.target.value;
      const updatedWidget = {
        ...widget,
        generalParams: {
          ...widget.generalParams,
          size: newSize
        }
      };
      updateWidget(updatedWidget);
    },
    [widget, updateWidget]
  );

  const handleTransparencyChange = useCallback(
    (event: Event, newValue: number | number[]) => {
      setSliderValue(Array.isArray(newValue) ? newValue[0] : newValue);
    },
    []
  );

  const handleTransparencyChangeCommitted = useCallback(() => {
    const updatedWidget = {
      ...widget,
      generalParams: {
        ...widget.generalParams,
        transparency: sliderValue
      }
    };
    updateWidget(updatedWidget);
  }, [sliderValue, widget, updateWidget]);

  /* Debounced textfield handlers */
  const debouncedDatasource = useDebouncedValue(datasource, 300);
  const debouncedChannel = useDebouncedValue(channel, 200);
  const debouncedUpdateTime = useDebouncedValue(updateTime, 500);

  useEffect(() => {
    let updatedWidget = { ...widget };
    if (debouncedDatasource !== undefined && debouncedDatasource !== '') {
      updatedWidget = {
        ...updatedWidget,
        generalParams: {
          ...updatedWidget.generalParams,
          datasource: debouncedDatasource
        }
      };
    }
    if (debouncedChannel !== undefined && debouncedChannel !== null) {
      updatedWidget = {
        ...updatedWidget,
        generalParams: {
          ...updatedWidget.generalParams,
          channel: debouncedChannel
        }
      };
    }
    if (debouncedUpdateTime !== undefined && debouncedUpdateTime !== '') {
      updatedWidget = {
        ...updatedWidget,
        generalParams: {
          ...updatedWidget.generalParams,
          updateTime: debouncedUpdateTime
        }
      };
    }
    if (
      debouncedDatasource !== undefined ||
      debouncedChannel !== undefined ||
      debouncedUpdateTime !== undefined
    ) {
      updateWidget(updatedWidget);
    }
  }, [debouncedDatasource, debouncedChannel, debouncedUpdateTime]);

  const handleDatasourceChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setDatasource(event.target.value);
  };

  const handleChannelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newChannel = parseInt(event.target.value, 10);
    if (!isNaN(newChannel)) {
      setChannel(newChannel);
    }
  };

  const handleUpdateTimeChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newUpdateTime = parseFloat(event.target.value);
    if (!isNaN(newUpdateTime)) {
      setUpdateTime(newUpdateTime);
    }
  };

  /* Toggle Widget Params */
  const toggleWidgetParams = useCallback(() => {
    setWidgetParamsVisible((prev) => !prev);
  }, []);

  /****************************************************************************/
  /* JSON viewer handlers */
  const [useJsonViewer, setUseJsonViewer] = useState(false);

  /* Toggle how to display JSON in JSON viewer */
  const toggleJsonViewer = useCallback(() => {
    setUseJsonViewer((prev) => !prev);
  }, []);

  /* Toggle JSON viewer */
  const toggleJsonVisibility = useCallback(() => {
    setJsonVisible((prev) => !prev);
  }, []);

  /* Handle edited JSON in the viewer */
  const handleJsonChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonInput(event.target.value);
  };

  const handleUpdateJSON = () => {
    try {
      const parsedWidget = safeParseJson(jsonInput);
      /* Re-attach the widget ID */
      if (widgetId !== null) {
        parsedWidget.generalParams.id = widgetId;
      }
      updateWidget(parsedWidget);
      setJsonError(null);
      /* NOTE: Update UI controls for manual JSON updates */
      setIsVisible(parsedWidget.generalParams.isVisible);
      setSliderValue(parsedWidget.generalParams.transparency);
      setDatasource(parsedWidget.generalParams.datasource);
      setChannel(parsedWidget.generalParams.channel);
      setUpdateTime(parsedWidget.generalParams.updateTime);
    } catch (err) {
      console.error(err);
      setJsonError('Invalid JSON format');
    }
  };

  /****************************************************************************/

  return (
    <Box key={widget.generalParams.id} sx={{ marginBottom: 2 }}>
      <Button
        variant="outlined"
        fullWidth
        onClick={() => toggleDropdown(index)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 1,
          color: 'text.primary',
          /* Highlight selected widget */
          backgroundColor:
            (activeDraggableWidget.id === widget.generalParams.id &&
              activeDraggableWidget.active) ||
            openDropdownIndex === index
              ? 'primary.light'
              : 'unset',
          borderColor:
            (activeDraggableWidget.id === widget.generalParams.id &&
              activeDraggableWidget.active) ||
            openDropdownIndex === index
              ? 'primary.main'
              : 'grey.600',
          borderBottomLeftRadius: openDropdownIndex === index ? '0px' : '8px',
          borderBottomRightRadius: openDropdownIndex === index ? '0px' : '8px',
          transition: 'background-color 0.3s ease, border-color 0.3s ease'
        }}
        startIcon={<WidgetsIcon color="primary" />}
        endIcon={
          openDropdownIndex === index ? <ExpandLessIcon /> : <ExpandMoreIcon />
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          {/* Widget title and info */}
          <Typography
            variant="subtitle1"
            sx={{ marginRight: '12px', fontWeight: 'bold' }}
          >
            {capitalizeFirstLetter(widget.generalParams.type)} ({widget.width}x
            {widget.height})
          </Typography>
          <Chip
            label={`ID: ${widget.generalParams.id}`}
            size="small"
            sx={{ fontWeight: 'bold' }}
          />
        </div>
      </Button>

      {/* Dropdown for widget details */}
      <Collapse in={openDropdownIndex === index}>
        <Box
          sx={(theme) => ({
            backgroundColor: theme.palette.background.default,
            padding: 2,
            border: `1px solid ${theme.palette.grey[600]}`,
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            marginTop: 0
          })}
        >
          <Typography variant="h6" sx={{ marginBottom: 1 }}>
            General parameters
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {/* Visible toggle */}
            {widgetCapabilities && widgetCapabilities.data.isVisible && (
              <Typography variant="body2" sx={{ marginRight: 1 }}>
                Visible
                <Switch
                  checked={isVisible}
                  onChange={handleVisibilityChange}
                  color="primary"
                />
              </Typography>
            )}
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                flexWrap: 'wrap',
                alignItems: 'center'
              }}
            >
              {/* Channel TextField */}
              <Box sx={{ flex: 0.5 }}>
                <TextField
                  label="Channel"
                  value={channel}
                  onChange={handleChannelChange}
                  fullWidth
                  variant="outlined"
                  placeholder="Channel"
                  type="number"
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
              </Box>
              {/* Datasource TextField */}
              <Box sx={{ flex: 0.7 }}>
                <TextField
                  label="Datasource"
                  value={datasource}
                  onChange={handleDatasourceChange}
                  fullWidth
                  variant="outlined"
                  placeholder="Enter datasource"
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
              </Box>
              {/* UpdateTime TextField */}
              <Box sx={{ flex: 0.8 }}>
                <TextField
                  label="Update interval"
                  value={updateTime}
                  onChange={handleUpdateTimeChange}
                  fullWidth
                  variant="outlined"
                  placeholder="Update interval"
                  type="number"
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
              </Box>
            </Box>
          </Box>
          {/* Anchor Dropdown */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            {widgetCapabilities && widgetCapabilities.data.anchor && (
              <Box sx={{ flex: 1, marginTop: 2 }}>
                <Typography variant="body2">Anchor</Typography>
                <Select
                  value={widget.generalParams.anchor}
                  onChange={handleAnchorChange}
                  fullWidth
                  sx={{
                    height: '40px',
                    '& .MuiOutlinedInput-root': {
                      height: '100%'
                    }
                  }}
                >
                  {widgetCapabilities.data.anchor.enum.map((anchor) => (
                    <MenuItem key={anchor} value={anchor}>
                      {capitalizeFirstLetter(anchor)}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            )}
            {/* Size Dropdown */}
            {widgetCapabilities && widgetCapabilities.data.size && (
              <Box sx={{ flex: 1, marginTop: 2 }}>
                <Typography variant="body2">Size</Typography>
                <Select
                  value={widget.generalParams.size}
                  onChange={handleSizeChange}
                  fullWidth
                  sx={{
                    height: '40px',
                    '& .MuiOutlinedInput-root': {
                      height: '100%'
                    }
                  }}
                >
                  {widgetCapabilities.data.size.enum.map((size) => (
                    <MenuItem key={size} value={size}>
                      {capitalizeFirstLetter(size)}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            )}
          </Box>
          {/* Transparency Slider */}
          {widgetCapabilities && widgetCapabilities.data.transparency && (
            <Box sx={{ marginTop: 2 }}>
              <Typography variant="body2">Transparency</Typography>
              <Slider
                value={sliderValue}
                onChange={handleTransparencyChange}
                onChangeCommitted={handleTransparencyChangeCommitted}
                aria-labelledby="transparency-slider"
                min={widgetCapabilities.data.transparency.minimum}
                max={widgetCapabilities.data.transparency.maximum}
                // step={0.01}
                valueLabelDisplay="auto"
              />
            </Box>
          )}
          {/* Widget Params */}
          <Button
            color="secondary"
            variant={widgetParamsVisible ? 'outlined' : 'contained'}
            fullWidth
            onClick={toggleWidgetParams}
            startIcon={<WidgetsIcon />}
            endIcon={
              widgetParamsVisible ? <ExpandLessIcon /> : <ExpandMoreIcon />
            }
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 1
            }}
          >
            {widgetParamsVisible
              ? 'Hide Widget Parameters'
              : 'Show Widget Parameters'}
          </Button>
          <Collapse in={widgetParamsVisible}>
            <WidgetParams widget={widget} />
          </Collapse>
          {/* Remove widget button */}
          <Button
            sx={{ marginTop: '10px' }}
            color="error"
            variant="contained"
            onClick={() => removeWidget(widget.generalParams.id)}
            startIcon={<DeleteIcon />}
          >
            Remove
          </Button>
          {/* Duplicate widget button */}
          <Button
            sx={{ marginTop: '10px', marginLeft: '10px' }}
            color="secondary"
            variant="contained"
            onClick={() => addCustomWidget({ ...widget })}
            startIcon={<ContentCopyIcon />}
          >
            Duplicate
          </Button>
          {/* Toggle JSON viewer */}
          <Button
            sx={{ marginTop: '10px', marginLeft: '10px' }}
            color="primary"
            variant="outlined"
            onClick={toggleJsonVisibility}
            startIcon={<DataObjectIcon />}
          >
            {jsonVisible ? 'Hide JSON' : 'Show JSON'}
          </Button>
          {/* JSON viewer expander */}
          <Collapse in={jsonVisible}>
            <Box
              sx={(theme) => ({
                marginTop: 1,
                padding: 2,
                border: '1px solid #ccc',
                borderRadius: '8px',
                backgroundColor: theme.palette.background.paper
              })}
            >
              {/* Editable JSON field */}
              {!useJsonViewer ? (
                <TextField
                  label="JSON"
                  error={jsonError !== null}
                  multiline
                  minRows={8}
                  value={jsonInput}
                  onChange={handleJsonChange}
                  fullWidth
                  variant="outlined"
                  sx={{
                    '& textarea': {
                      resize: 'none',
                      fontFamily: 'Monospace'
                    }
                  }}
                />
              ) : (
                <ReactJson
                  src={safeParseJson(jsonInput)}
                  onEdit={(edit) => {
                    const updatedJson = JSON.stringify(
                      edit.updated_src,
                      null,
                      2
                    );
                    setJsonInput(updatedJson);
                  }}
                  onAdd={(add) => {
                    const updatedJson = JSON.stringify(
                      add.updated_src,
                      null,
                      2
                    );
                    setJsonInput(updatedJson);
                  }}
                  onDelete={(del) => {
                    const updatedJson = JSON.stringify(
                      del.updated_src,
                      null,
                      2
                    );
                    setJsonInput(updatedJson);
                  }}
                  enableClipboard={false}
                  displayDataTypes={false}
                  theme="monokai"
                />
              )}
              {/* Display error if invalid JSON */}
              {jsonError && (
                <Typography color="error" variant="body2" sx={{ marginTop: 1 }}>
                  {jsonError}
                </Typography>
              )}
              <Button
                onClick={handleUpdateJSON}
                variant="contained"
                startIcon={<DataObjectIcon />}
                sx={{ marginTop: 1, marginRight: 1 }}
              >
                Update {capitalizeFirstLetter(widget.generalParams.type)}
              </Button>
              {appSettings.debug && (
                <Button
                  onClick={toggleJsonViewer}
                  variant="contained"
                  startIcon={<ImageIcon />}
                  sx={{ marginTop: 1 }}
                >
                  {useJsonViewer ? 'Text Editor' : 'JSON Viewer'}
                </Button>
              )}
            </Box>
          </Collapse>
        </Box>
      </Collapse>
    </Box>
  );
};

export default WidgetItem;
