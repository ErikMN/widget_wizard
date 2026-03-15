import React from 'react';
import { useScreenSizes } from '../../helpers/hooks.jsx';
/* MUI */
import Box from '@mui/material/Box';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import Typography from '@mui/material/Typography';

const DrawInfo: React.FC = () => {
  /* Screen size */
  const { isMobile } = useScreenSizes();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        width: '100%'
      }}
    >
      {/* Left-aligned icon */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: 40,
          flexShrink: 0
        }}
      >
        <BrushOutlinedIcon
          sx={{
            width: '20px',
            height: '20px',
            color: 'text.secondary'
          }}
        />
      </Box>
      {/* Centered text */}
      <Typography
        variant="inherit"
        sx={{
          letterSpacing: '0.05em',
          color: 'palette.secondary.main',
          flex: 1,
          textAlign: 'center',
          ...(isMobile && { marginBottom: 1 })
        }}
      >
        Draw
      </Typography>
      <Box sx={{ width: 40, flexShrink: 0 }} />
    </Box>
  );
};

export default DrawInfo;
