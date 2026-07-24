/* Widget Wizard
 * General widget params.
 */
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle
} from 'react';
import { debounce } from 'lodash';
import { Widget } from './widgetInterfaces';
import { useWidgetData, useWidgetUi, useWidgetActions } from './WidgetContext';
import { capitalizeFirstLetter, toNiceName } from '../../helpers/utils';
import { playSound } from '../../helpers/utils';
import lockSoundUrl from '../../assets/audio/lock.oga';
import unlockSoundUrl from '../../assets/audio/unlock.oga';
import {
  CustomSwitch,
  CustomStyledIconButton,
  CustomSlider
} from '../CustomComponents';
/* MUI */
import { SelectChangeEvent } from '@mui/material/Select';
import Box from '@mui/material/Box';
import FlipToBackIcon from '@mui/icons-material/FlipToBack';
import FlipToFrontIcon from '@mui/icons-material/FlipToFront';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import MenuItem from '@mui/material/MenuItem';
import RecyclingIcon from '@mui/icons-material/Recycling';
import Select from '@mui/material/Select';
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

/* Lets the parent flush or cancel pending edits before closing or
 * removing the row. */
export interface WidgetGeneralParamsHandle {
  flushPendingChanges: () => void;
  cancelPendingChanges: () => void;
}

const WidgetGeneralParams = forwardRef<
  WidgetGeneralParamsHandle,
  WidgetGeneralParamsProps
>(({ widget, widgetState, setWidgetState }, ref) => {
  /* Global context */
  const { widgetCapabilities } = useWidgetData();
  const { activeDraggableWidget, setActiveDraggableWidget } = useWidgetUi();
  const { updateWidget } = useWidgetActions();

  /****************************************************************************/
  /* Handle UI updates for general parameters */

  const handleVisibilityChange = useCallback(() => {
    const newVisibility = !widgetState.isVisible;

    setWidgetState((prevState) => ({
      ...prevState,
      isVisible: newVisibility
    }));

    updateWidget(widget.generalParams.id, (current) => ({
      ...current,
      generalParams: {
        ...current.generalParams,
        isVisible: newVisibility
      }
    }));
  }, [widgetState.isVisible, widget, updateWidget]);

  const handleAnchorChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      const newAnchor = event.target.value as string;
      updateWidget(widget.generalParams.id, (current) => ({
        ...current,
        generalParams: {
          ...current.generalParams,
          anchor: newAnchor
        }
      }));
      /* Play sound if anchored */
      if (newAnchor !== 'none') {
        playSound(lockSoundUrl);
      } else {
        playSound(unlockSoundUrl);
      }
    },
    [widget, updateWidget]
  );

  const handleSizeChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      const newSize = event.target.value;
      updateWidget(widget.generalParams.id, (current) => ({
        ...current,
        generalParams: {
          ...current.generalParams,
          size: newSize
        }
      }));
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
    updateWidget(widget.generalParams.id, (current) => ({
      ...current,
      generalParams: {
        ...current.generalParams,
        transparency: widgetState.sliderValue
      }
    }));
  }, [widgetState.sliderValue, widget, updateWidget]);

  const [updateTimeInput, setUpdateTimeInput] = useState(
    String(widgetState.updateTime)
  );

  /* Latest values for the debounced sender, updated after every render. */
  const latestRef = useRef({
    widgetId: widget.generalParams.id,
    widgetState,
    updateTimeInput,
    updateWidget
  });
  useEffect(() => {
    latestRef.current = {
      widgetId: widget.generalParams.id,
      widgetState,
      updateTimeInput,
      updateWidget
    };
  });

  /* One cancellable debounced sender for datasource, channel and update
   * time. Reads the latest widget when it runs. */
  const debouncedSend = useRef(
    debounce(() => {
      const {
        widgetId,
        widgetState: latestState,
        updateTimeInput: latestUpdateTimeInput,
        updateWidget: latestUpdateWidget
      } = latestRef.current;

      latestUpdateWidget(widgetId, (current) => {
        const pending: Partial<typeof current.generalParams> = {};

        if (
          latestState.datasource !== '' &&
          latestState.datasource !== current.generalParams.datasource
        ) {
          pending.datasource = latestState.datasource;
        }

        if (latestState.channel !== current.generalParams.channel) {
          pending.channel = latestState.channel;
        }

        const parsedUpdateTime = parseFloat(latestUpdateTimeInput);
        if (
          !isNaN(parsedUpdateTime) &&
          parsedUpdateTime >= 0 &&
          parsedUpdateTime !== current.generalParams.updateTime
        ) {
          pending.updateTime = parsedUpdateTime;
        }

        if (Object.keys(pending).length === 0) {
          return current;
        }

        return {
          ...current,
          generalParams: { ...current.generalParams, ...pending }
        };
      });
    }, 300)
  ).current;

  /* Cancel pending updates when the editor is removed or the page
   * navigates away. */
  useEffect(() => {
    return () => {
      debouncedSend.cancel();
    };
  }, [debouncedSend]);

  /* Flush pending edits before closing the row. debouncedSend() ensures a
   * call is pending even if the row closes before the sender was
   * scheduled. */
  const flushPendingChanges = useCallback(() => {
    debouncedSend();
    debouncedSend.flush();
  }, [debouncedSend]);

  /* Cancel pending edits without sending them, for a confirmed removal. */
  const cancelPendingChanges = useCallback(() => {
    debouncedSend.cancel();
  }, [debouncedSend]);

  useImperativeHandle(
    ref,
    () => ({ flushPendingChanges, cancelPendingChanges }),
    [flushPendingChanges, cancelPendingChanges]
  );

  useEffect(() => {
    setUpdateTimeInput(String(widgetState.updateTime));
  }, [widgetState.updateTime]);

  const handleDatasourceChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setWidgetState((prevState) => ({
      ...prevState,
      datasource: event.target.value
    }));
    debouncedSend();
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
    debouncedSend();
  };

  const handleUpdateTimeChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setUpdateTimeInput(event.target.value);
    debouncedSend();
  };

  const handleUpdateTimeBlur = () => {
    const parsed = parseFloat(updateTimeInput);
    if (!isNaN(parsed) && parsed >= 0) {
      setWidgetState((prevState) => ({
        ...prevState,
        updateTime: parsed
      }));
    } else {
      setUpdateTimeInput(String(widgetState.updateTime));
    }
  };

  const handleHighlightStart = () => {
    setActiveDraggableWidget((prev) => ({
      ...prev,
      highlight: true
    }));
  };

  const handleHighlightEnd = () => {
    setActiveDraggableWidget((prev) => ({
      ...prev,
      highlight: false
    }));
  };

  const handleSetDepth = useCallback(
    (mode: string) => {
      updateWidget(widget.generalParams.id, (current) => ({
        ...current,
        generalParams: {
          ...current.generalParams,
          depth: mode
        }
      }));
    },
    [widget, updateWidget]
  );

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
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0
          }}
        >
          {/* Set widget depth */}
          <Tooltip title={`Cycle widgets`} arrow placement="top">
            <div>
              <CustomStyledIconButton
                width="32px"
                height="32px"
                onClick={() => handleSetDepth('cycle')}
              >
                <RecyclingIcon />
              </CustomStyledIconButton>
            </div>
          </Tooltip>
          <Tooltip
            title={`Bring ${capitalizeFirstLetter(widget.generalParams.type)} to back`}
            arrow
            placement="top"
          >
            <div>
              <CustomStyledIconButton
                width="32px"
                height="32px"
                onClick={() => handleSetDepth('back')}
              >
                <FlipToBackIcon />
              </CustomStyledIconButton>
            </div>
          </Tooltip>
          <Tooltip
            title={`Bring ${capitalizeFirstLetter(widget.generalParams.type)} to front`}
            arrow
            placement="top"
          >
            <div>
              <CustomStyledIconButton
                width="32px"
                height="32px"
                onClick={() => handleSetDepth('front')}
              >
                <FlipToFrontIcon />
              </CustomStyledIconButton>
            </div>
          </Tooltip>
          {/* Highlight widget */}
          <Tooltip
            title={`Highlight ${capitalizeFirstLetter(widget.generalParams.type)}`}
            arrow
            placement="top"
          >
            <div>
              <CustomStyledIconButton
                width="32px"
                height="32px"
                aria-label="info"
                onMouseDown={handleHighlightStart}
                onMouseUp={handleHighlightEnd}
                onMouseLeave={handleHighlightEnd}
                onTouchStart={handleHighlightStart}
                onTouchEnd={handleHighlightEnd}
              >
                {activeDraggableWidget?.highlight ? (
                  <LightbulbIcon />
                ) : (
                  <LightbulbOutlinedIcon />
                )}
              </CustomStyledIconButton>
            </div>
          </Tooltip>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          gap: 1,
          marginTop: 3,
          marginBottom: 1,
          alignItems: 'center',
          width: '100%'
        }}
      >
        {/* Visible toggle */}
        {widgetCapabilities && widgetCapabilities.data.isVisible && (
          <Box sx={{ flex: 1 }}>
            <FormControlLabel
              control={
                <CustomSwitch
                  checked={widgetState.isVisible}
                  onChange={handleVisibilityChange}
                  name="widgetVisible"
                />
              }
              label="Visible"
              labelPlacement="start"
            />
          </Box>
        )}
        {/* Channel TextField */}
        <Box sx={{ flex: 1 }}>
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
      </Box>

      <Box sx={{ display: 'flex', gap: 1, width: '100%', mb: 3 }}>
        {/* Anchor Dropdown */}
        {widgetCapabilities && widgetCapabilities.data.anchor && (
          <Box sx={{ flex: 1 }}>
            <FormControl sx={{ marginTop: 2, width: '100%' }}>
              <InputLabel id="anchor-label" sx={{ top: '-4px' }}>
                Anchor
              </InputLabel>
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
                    {toNiceName(anchor)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}
        {/* Size Dropdown */}
        {widgetCapabilities && widgetCapabilities.data.size && (
          <Box sx={{ flex: 1 }}>
            <FormControl sx={{ marginTop: 2, width: '100%' }}>
              <InputLabel id="size-label" sx={{ top: '-4px' }}>
                Size
              </InputLabel>
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
            </FormControl>
          </Box>
        )}
      </Box>

      {/* Channel, Datasource, Update Interval */}
      <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
        <Box sx={{ display: 'flex', gap: 1, flex: 1 }}>
          {/* Datasource TextField */}
          <Box sx={{ flex: 1 }}>
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
          <Box sx={{ flex: 1 }}>
            <TextField
              label="Update interval"
              value={updateTimeInput}
              onChange={handleUpdateTimeChange}
              onBlur={handleUpdateTimeBlur}
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
          <CustomSlider
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
});

WidgetGeneralParams.displayName = 'WidgetGeneralParams';

export default WidgetGeneralParams;
