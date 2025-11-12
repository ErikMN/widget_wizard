import React from 'react';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';
import { useScreenSizes } from '../../helpers/hooks.jsx';
import { useWidgetContext } from './WidgetContext';
/* MUI */
import Typography from '@mui/material/Typography';

const WidgetInfo: React.FC = () => {
  /* Screen size */
  const { isMobile } = useScreenSizes();

  /* Global context */
  const { activeWidgets, widgetSupported } = useWidgetContext();

  if (!widgetSupported) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%'
      }}
    >
      {/* Left-aligned icon */}
      <WidgetsOutlinedIcon
        sx={{
          width: '20px',
          height: '20px',
          color: 'text.secondary'
        }}
      />
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
