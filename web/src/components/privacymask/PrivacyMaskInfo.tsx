import React, { useCallback } from 'react';
import { useScreenSizes } from '../../helpers/hooks.jsx';
import { usePrivacyMaskContext } from './PrivacyMaskContext';
import { CustomStyledIconButton } from '../CustomComponents';
/* MUI */
import Box from '@mui/material/Box';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';

const PrivacyMaskInfo: React.FC = () => {
  /* Screen size */
  const { isMobile } = useScreenSizes();

  /* Privacy mask context */
  const { masks, capabilities, listMasks } = usePrivacyMaskContext();

  const handleRefresh = useCallback(() => {
    listMasks();
  }, [listMasks]);

  if (!capabilities.supported) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      {/* Left-aligned icon */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          flexShrink: 0
        }}
      >
        <VisibilityOffOutlinedIcon
          sx={{ width: '20px', height: '20px', color: 'text.secondary' }}
        />
      </Box>

      {/* Refresh icon */}
      <Tooltip title="Refresh privacy masks" arrow>
        <div>
          <CustomStyledIconButton
            color="inherit"
            aria-label="Refresh privacy masks"
            onClick={handleRefresh}
            disableRipple
          >
            <RefreshOutlinedIcon
              sx={{ width: '20px', height: '20px', color: 'text.secondary' }}
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
        Privacy masks: {masks.length}
      </Typography>
    </Box>
  );
};

export default PrivacyMaskInfo;
