import React from 'react';
import { useScreenSizes } from '../../helpers/hooks.jsx';
import { useOverlayContext } from './OverlayContext';
/* MUI */
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import Typography from '@mui/material/Typography';

const OverlayInfo: React.FC = () => {
  /* Screen size */
  const { isMobile } = useScreenSizes();

  /* Overlay context */
  const { activeOverlays, overlaySupported } = useOverlayContext();

  if (!overlaySupported) {
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
      <LayersOutlinedIcon
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
        Active overlays: {activeOverlays.length}
      </Typography>
    </div>
  );
};

export default OverlayInfo;
