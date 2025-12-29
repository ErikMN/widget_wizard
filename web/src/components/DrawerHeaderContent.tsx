/**
 * DrawerHeaderContent
 *
 * Renders contextual information in the drawer header based on the current route.
 * The active section is derived from the URL path.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
/* MUI */
import Box from '@mui/material/Box';

/* Widgets */
import WidgetInfo from './widget/WidgetInfo';
/* Overlays */
import OverlayInfo from './overlay/OverlayInfo';

const DrawerHeaderContent: React.FC = () => {
  /* Navigation */
  const location = useLocation();
  const path = location.pathname;

  let content: React.ReactNode = null;

  /* Set content */
  if (path.startsWith('/widgets')) {
    content = <WidgetInfo />;
  } else if (path.startsWith('/overlays')) {
    content = <OverlayInfo />;
  }

  if (!content) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexGrow: 1
      }}
    >
      {content}
    </Box>
  );
};

export default DrawerHeaderContent;
