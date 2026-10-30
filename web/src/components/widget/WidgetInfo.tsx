import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScreenSizes } from '../../helpers/hooks.jsx';
import { useWidgetActions, useWidgetData } from './WidgetContext';
import { CustomStyledIconButton, CustomSwitch } from '../CustomComponents';
import { WidgetApiMode } from './widgetApi';
/* MUI */
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import FormControlLabel from '@mui/material/FormControlLabel';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';

const WidgetInfo: React.FC = () => {
  /* Screen size */
  const { isMobile } = useScreenSizes();

  /* Global context */
  const { activeWidgets, widgetSupported, widgetApiMode } = useWidgetData();
  const { listWidgets, switchWidgetApi } = useWidgetActions();
  const [switchingApi, setSwitchingApi] = useState(false);

  /* Navigation */
  const navigate = useNavigate();

  const handleNavigateToCapabilities = useCallback(() => {
    navigate('/widgetcapabilities');
  }, [navigate]);

  const handleRefreshWidgets = useCallback(() => {
    listWidgets();
  }, [listWidgets]);

  const handleSwitchApi = useCallback(async () => {
    const targetMode: WidgetApiMode =
      widgetApiMode === 'legacy' ? 'v3' : 'legacy';
    setSwitchingApi(true);
    try {
      await switchWidgetApi(targetMode);
    } finally {
      setSwitchingApi(false);
    }
  }, [switchWidgetApi, widgetApiMode]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%'
      }}
    >
      {/* Left-aligned icon */}
      <Tooltip title="Show Widget Capabilities JSON" arrow>
        <div>
          <CustomStyledIconButton
            color="inherit"
            aria-label="Show Widget Capabilities JSON"
            onClick={handleNavigateToCapabilities}
            disabled={!widgetSupported}
            edge="start"
            disableRipple
          >
            <WidgetsOutlinedIcon
              sx={{
                width: '20px',
                height: '20px',
                color: 'text.secondary'
              }}
            />
          </CustomStyledIconButton>
        </div>
      </Tooltip>

      {/* Refresh icon */}
      <Tooltip title="Refresh active widgets" arrow>
        <div>
          <CustomStyledIconButton
            color="inherit"
            aria-label="Refresh active widgets"
            onClick={handleRefreshWidgets}
            disabled={!widgetSupported}
            disableRipple
          >
            <RefreshOutlinedIcon
              sx={{
                width: '20px',
                height: '20px',
                color: 'text.secondary'
              }}
            />
          </CustomStyledIconButton>
        </div>
      </Tooltip>

      {/* Centered text */}
      <Typography
        variant="inherit"
        sx={{
          letterSpacing: '0.05em',
          color: 'palette.secondary.main',
          display: 'flex',
          justifyContent: 'center',
          marginLeft: '8px',
          flex: 1,
          ...(isMobile && { marginBottom: 1 })
        }}
      >
        Active widgets: {activeWidgets.length}
      </Typography>

      <Tooltip
        title={`Switch to the ${widgetApiMode === 'legacy' ? 'v3' : 'legacy'} widget API`}
        arrow
      >
        <span>
          <FormControlLabel
            control={
              <CustomSwitch
                size="small"
                checked={widgetApiMode === 'v3'}
                onChange={handleSwitchApi}
                disabled={switchingApi}
                slotProps={{ input: { 'aria-label': 'Use v3 widget API' } }}
                sx={(theme) => ({
                  ...(theme.palette.mode === 'dark' && {
                    '& .Mui-checked .MuiSwitch-thumb': {
                      backgroundColor: theme.palette.grey[500]
                    }
                  })
                })}
              />
            }
            label="v3 API"
            sx={{ whiteSpace: 'nowrap', ml: 1, mr: 0 }}
          />
        </span>
      </Tooltip>
    </div>
  );
};

export default WidgetInfo;
