/* Widget Wizard
 * General widget params.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Widget } from '../../widgetInterfaces';
import { useGlobalContext } from '../GlobalContext';
import { capitalizeFirstLetter } from '../../helpers/utils';
import { useDebouncedValue } from '../../helpers/hooks';
import { CustomSwitch } from '../CustomComponents';
/* MUI */
import { SelectChangeEvent } from '@mui/material/Select';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface WidgetGeneralParamsProps {
  widget: Widget;
  widgetState: {
    isVisible: boolean;
    widgetId: number | null;
    sliderValue: number;
    datasource: string;
    channel: number;
    updateTime: number;
  };
  setWidgetState: React.Dispatch<
    React.SetStateAction<{
      isVisible: boolean;
      widgetId: number | null;
      sliderValue: number;
      datasource: string;
      channel: number;
      updateTime: number;
    }>
  >;
}
const WidgetGeneralParams: React.FC<WidgetGeneralParamsProps> = ({
  widget,
  widgetState,
  setWidgetState
}) => {
  /* Global context */
  const {
    updateWidget,
    widgetCapabilities,
    activeDraggableWidget,
    setActiveDraggableWidget
  } = useGlobalContext();

  /****************************************************************************/
  /* Handle UI updates for general parameters */

  const handleVisibilityChange = useCallback(() => {
    const newVisibility = !widgetState.isVisible;

    // setIsVisible(newVisibility);
    setWidgetState((prevState) => ({
      ...prevState,
      isVisible: newVisibility
    }));

    const updatedWidget = {
      ...widget,
      generalParams: {
        ...widget.generalParams,
        isVisible: newVisibility
      }
    };
    updateWidget(updatedWidget);
  }, [widgetState.isVisible, widget, updateWidget]);

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
      setWidgetState((prevState) => ({
        ...prevState,
        sliderValue: Array.isArray(newValue) ? newValue[0] : newValue
      }));
    },
    []
  );

  const handleTransparencyChangeCommitted = useCallback(() => {
    const updatedWidget = {
      ...widget,
      generalParams: {
        ...widget.generalParams,
        transparency: widgetState.sliderValue
      }
    };
    updateWidget(updatedWidget);
  }, [widgetState.sliderValue, widget, updateWidget]);

  /* Debounced textfield handlers */
  const debouncedDatasource = useDebouncedValue(widgetState.datasource, 300);
  const debouncedChannel = useDebouncedValue(widgetState.channel, 200);
  const debouncedUpdateTime = useDebouncedValue(widgetState.updateTime, 500);

  /* FIXME: HACK: to not fire updateWidget on mount */
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    /* HACK: */
    if (!isReady) {
      return;
    }

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
    setWidgetState((prevState) => ({
      ...prevState,
      datasource: event.target.value
    }));
  };

  const handleChannelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newChannel = parseInt(event.target.value, 10);
    if (!isNaN(newChannel) && newChannel >= -1) {
      setWidgetState((prevState) => ({
        ...prevState,
        channel: newChannel
      }));
    } else if (event.target.value === '') {
      setWidgetState((prevState) => ({
        ...prevState,
        channel: 0
      }));
    }
  };

  const handleUpdateTimeChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newUpdateTime = parseFloat(event.target.value);
    if (!isNaN(newUpdateTime) && newUpdateTime >= 0) {
      setWidgetState((prevState) => ({
        ...prevState,
        updateTime: newUpdateTime
      }));
    }
  };

  /****************************************************************************/

  return (
    <Box key={widget.generalParams.id} sx={{ marginBottom: 1.4 }}>
      {/* General Params */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Typography variant="h6">General parameters</Typography>
        <Tooltip
          title={`Highlight ${capitalizeFirstLetter(widget.generalParams.type)}`}
          arrow
          placement="right"
        >
          <IconButton
            aria-label="info"
            onMouseDown={() => {
              setActiveDraggableWidget((prev) => ({
                ...prev,
                highlight: true
              }));
            }}
            onMouseUp={() => {
              setActiveDraggableWidget((prev) => ({
                ...prev,
                highlight: false
              }));
            }}
            onMouseLeave={() => {
              setActiveDraggableWidget((prev) => ({
                ...prev,
                highlight: false
              }));
            }}
          >
            {activeDraggableWidget?.highlight ? (
              <LightbulbIcon />
            ) : (
              <LightbulbOutlinedIcon />
            )}
          </IconButton>
        </Tooltip>
      </Box>
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          alignItems: 'center',
          marginBottom: 3
        }}
      >
        {/* Visible toggle */}
        {widgetCapabilities && widgetCapabilities.data.isVisible && (
          <Typography variant="body2" sx={{ marginTop: 4 }}>
            Visible
            <CustomSwitch
              checked={widgetState.isVisible}
              onChange={handleVisibilityChange}
              color="primary"
            />
          </Typography>
        )}
        {/* Anchor Dropdown */}
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
      {/* Channel, Datasource, Update Interval */}
      <Box sx={{ display: 'flex', gap: 1 }}>
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
              value={widgetState.channel}
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
              value={widgetState.datasource}
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
              value={widgetState.updateTime}
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
      {/* Transparency Slider */}
      {widgetCapabilities && widgetCapabilities.data.transparency && (
        <Box sx={{ marginTop: 2 }}>
          <Typography variant="body2">Transparency</Typography>
          <Slider
            value={widgetState.sliderValue}
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
      {/* General Params End */}
    </Box>
  );
};

export default WidgetGeneralParams;
