import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScreenSizes } from '../../helpers/hooks.jsx';
import { useOverlayContext } from './OverlayContext';
import { CustomStyledIconButton } from '../CustomComponents';
/* MUI */
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

const OverlayInfo: React.FC = () => {
  /* Screen size */
  const { isMobile } = useScreenSizes();

  /* Overlay context */
  const { activeOverlays, overlaySupported, listOverlays } =
    useOverlayContext();

  /* Navigation */
  const navigate = useNavigate();

  const handleNavigateToCapabilities = useCallback(() => {
    navigate('/overlaycapabilities');
  }, [navigate]);

  const handleRefreshOverlays = useCallback(() => {
    listOverlays();
  }, [listOverlays]);

  /* Early return must be after hooks */
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
      <Tooltip title="Show Overlay Capabilities JSON" arrow>
        <div>
          <CustomStyledIconButton
            color="inherit"
            aria-label="Show Overlay Capabilities JSON"
            onClick={handleNavigateToCapabilities}
            edge="start"
            disableRipple
          >
            <LayersOutlinedIcon
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
      <Tooltip title="Refresh active overlays" arrow>
        <div>
          <CustomStyledIconButton
            color="inherit"
            aria-label="Refresh active overlays"
            onClick={handleRefreshOverlays}
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
        Active overlays: {activeOverlays.length}
      </Typography>
    </div>
  );
};

export default OverlayInfo;
