import React, { useState, useEffect } from 'react';
import { Widget, WidgetCapabilities } from '../widgetInterfaces';
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
  widgetCapabilities: WidgetCapabilities | null;
  openDropdownIndex: number | null;
  toggleDropdown: (index: number) => void;
  removeWidget: (widgetID: number) => void;
  updateWidget: (widget: Widget) => void;
}

const WidgetItem: React.FC<WidgetItemProps> = ({
  widget,
  index,
  widgetCapabilities,
  openDropdownIndex,
  toggleDropdown,
  removeWidget,
  updateWidget
}) => {
  /* Local state */
  const [isVisible, setIsVisible] = useState(widget.generalParams.isVisible);
  const [jsonVisible, setJsonVisible] = useState(false);
  const [jsonInput, setJsonInput] = useState(JSON.stringify(widget, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [sliderValue, setSliderValue] = useState(
    widget.generalParams.transparency
  );

  /* Update jsonInput whenever widget prop changes */
  useEffect(() => {
    /* Deep widget copy */
    const widgetCopy = JSON.parse(JSON.stringify(widget));
    /* Remove ID in order to not edit other widgets */
    if (widgetCopy.generalParams && widgetCopy.generalParams.id) {
      delete widgetCopy.generalParams.id;
    }
    setJsonInput(JSON.stringify(widgetCopy, null, 2));
    setJsonError(null);
  }, [widget]);

  /* Handle state changes */
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

  /****************************************************************************/
  /* Handle UI updates */

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
      updateWidget(parsedWidget);
      setJsonError(null);
      /* Update UI controls for manual JSON updates */
      setIsVisible(parsedWidget.generalParams.isVisible);
      setSliderValue(parsedWidget.generalParams.transparency);
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
        startIcon={<WidgetsIcon />}
        endIcon={
          openDropdownIndex === index ? <ExpandLessIcon /> : <ExpandMoreIcon />
        }
        onClick={() => toggleDropdown(index)}
      >
        {/* Widget title and info */}
        <Typography variant="subtitle1">
          {widget.generalParams.type.charAt(0).toUpperCase() +
            widget.generalParams.type.slice(1)}{' '}
          ({widget.width}x{widget.height})
        </Typography>
        <Chip
          label={`ID: ${widget.generalParams.id}`}
          size="small"
          sx={{ ml: 1 }}
        />
      </Button>

      {/* Dropdown for widget details */}
      <Collapse in={openDropdownIndex === index}>
        <Box
          sx={(theme) => ({
            backgroundColor: theme.palette.background.default,
            padding: 2,
            border: '1px solid #ccc',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            marginTop: 1
          })}
        >
          {/* Visible toggle */}
          {widgetCapabilities && widgetCapabilities.data.isVisible && (
            <Typography variant="body2" sx={{ marginTop: 1 }}>
              Visible:
              <Switch
                checked={isVisible}
                onChange={handleVisibilityChange}
                color="primary"
              />
            </Typography>
          )}
          {/* Anchor Dropdown */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            {widgetCapabilities && widgetCapabilities.data.anchor && (
              <Box sx={{ flex: 1, marginTop: 2 }}>
                <Typography variant="body2">Anchor</Typography>
                <Select
                  value={widget.generalParams.anchor}
                  onChange={handleAnchorChange}
                  fullWidth
                >
                  {widgetCapabilities.data.anchor.enum.map((anchor) => (
                    <MenuItem key={anchor} value={anchor}>
                      {anchor}
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
                >
                  {widgetCapabilities.data.size.enum.map((size) => (
                    <MenuItem key={size} value={size}>
                      {size}
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
            Remove {widget.generalParams.type}
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
