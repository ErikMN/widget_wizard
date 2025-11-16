import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScreenSizes } from '../../helpers/hooks.jsx';
import { useWidgetContext } from './WidgetContext';
import { CustomStyledIconButton } from '../CustomComponents';
/* MUI */
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';

const WidgetInfo: React.FC = () => {
  /* Screen size */
  const { isMobile } = useScreenSizes();

  /* Global context */
  const { activeWidgets, widgetSupported } = useWidgetContext();

  /* Navigation */
  const navigate = useNavigate();

  if (!widgetSupported) {
    return null;
  }

  const handleNavigateToCapabilities = useCallback(() => {
    navigate('/widgetcapabilities');
  }, [navigate]);

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
    </div>
  );
};

export default WidgetInfo;
