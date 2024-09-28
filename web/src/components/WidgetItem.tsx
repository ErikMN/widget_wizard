/* Widget Wizard
 * WidgetItem: Represent one widget.
 */
import React, { useState, useEffect } from 'react';
import { Widget } from '../widgetInterfaces';
import { useWidgetContext } from './WidgetContext';
import { capitalizeFirstLetter } from '../helpers/utils';
/* MUI */
import { SelectChangeEvent } from '@mui/material/Select';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CodeIcon from '@mui/icons-material/Code';
import Collapse from '@mui/material/Collapse';
import DataObjectIcon from '@mui/icons-material/DataObject';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
    removeWidget,
    updateWidget,
    widgetCapabilities,
    openDropdownIndex,
    activeDraggableWidget
  } = useWidgetContext();

  /* Update jsonInput whenever widget prop changes */
  useEffect(() => {
    /* Store the widget's id */
    if (widget.generalParams && widget.generalParams.id) {
      setWidgetId(widget.generalParams.id);
    }
    /* Deep widget copy */
    const widgetCopy = JSON.parse(JSON.stringify(widget));
    /* Remove ID in order to not edit other widgets */
    if (widgetCopy.generalParams && widgetCopy.generalParams.id) {
      delete widgetCopy.generalParams.id;
    }
    setJsonInput(JSON.stringify(widgetCopy, null, 2));
    setJsonError(null);
  }, [widget]);

  /****************************************************************************/
  /* Handle UI updates for general parameters */

  const handleVisibilityChange = () => {
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
  };

  const handleAnchorChange = (event: SelectChangeEvent<string>) => {
    const newAnchor = event.target.value as string;
    const updatedWidget = {
      ...widget,
      generalParams: {
        ...widget.generalParams,
        anchor: newAnchor
      }
    };
    updateWidget(updatedWidget);
  };

  const handleSizeChange = (event: SelectChangeEvent<string>) => {
    const newSize = event.target.value;
    const updatedWidget = {
      ...widget,
      generalParams: {
        ...widget.generalParams,
        size: newSize
      }
    };
    updateWidget(updatedWidget);
  };

  const handleTransparencyChange = (
    event: Event,
    newValue: number | number[]
  ) => {
    setSliderValue(Array.isArray(newValue) ? newValue[0] : newValue);
  };

  const handleTransparencyChangeCommitted = () => {
    const updatedWidget = {
      ...widget,
      generalParams: {
        ...widget.generalParams,
        transparency: sliderValue
      }
    };
    updateWidget(updatedWidget);
  };

  const handleDatasourceChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newDatasource = event.target.value;
    setDatasource(newDatasource);
    const updatedWidget = {
      ...widget,
      generalParams: {
        ...widget.generalParams,
        datasource: newDatasource
      }
    };
    updateWidget(updatedWidget);
  };

  const handleChannelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newChannel = parseInt(event.target.value, 10);
    if (!isNaN(newChannel)) {
      setChannel(newChannel);
      const updatedWidget = {
        ...widget,
        generalParams: {
          ...widget.generalParams,
          channel: newChannel
        }
      };
      updateWidget(updatedWidget);
    }
  };

  const handleUpdateTimeChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newUpdateTime = parseFloat(event.target.value);
    if (!isNaN(newUpdateTime)) {
      // Ensure it's a valid number
      setUpdateTime(newUpdateTime);
      const updatedWidget = {
        ...widget,
        generalParams: {
          ...widget.generalParams,
          updateTime: newUpdateTime
        }
      };
      updateWidget(updatedWidget);
    }
  };

  /****************************************************************************/
  /* JSON viewer handlers */

  /* Toggle JSON viewer */
  const toggleJsonVisibility = () => {
    setJsonVisible((prev) => !prev);
  };

  /* Handle edited JSON in the viewer */
  const handleJsonChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonInput(event.target.value);
  };

  const handleUpdateJSON = () => {
    try {
      const parsedWidget = JSON.parse(jsonInput);
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
            activeDraggableWidget.id === widget.generalParams.id &&
            activeDraggableWidget.active
              ? 'primary.light'
              : 'unset',
          borderColor:
            activeDraggableWidget.id === widget.generalParams.id &&
            activeDraggableWidget.active
              ? 'primary.main'
              : 'grey.600',
          borderBottomLeftRadius: openDropdownIndex === index ? '0px' : '8px',
          borderBottomRightRadius: openDropdownIndex === index ? '0px' : '8px'
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
              <Box sx={{ flex: 0.4 }}>
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
                    }
                  }}
                />
              </Box>
              {/* Datasource TextField */}
              <Box sx={{ flex: 0.6 }}>
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
                    }
                  }}
                />
              </Box>
              {/* UpdateTime TextField */}
              <Box sx={{ flex: 1 }}>
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
          {/* Remove widget button */}
          <Button
            style={{ marginTop: '10px' }}
            color="error"
            variant="contained"
            onClick={() => removeWidget(widget.generalParams.id)}
            startIcon={<DeleteIcon />}
          >
            Remove {capitalizeFirstLetter(widget.generalParams.type)}
          </Button>
          {/* Toggle JSON viewer */}
          <Button
            onClick={toggleJsonVisibility}
            startIcon={<CodeIcon />}
            sx={{ marginTop: 1, marginLeft: 1 }}
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
                sx={{ marginTop: 1 }}
              >
                Update {widget.generalParams.type}
              </Button>
            </Box>
          </Collapse>
        </Box>
      </Collapse>
    </Box>
  );
};

export default WidgetItem;
