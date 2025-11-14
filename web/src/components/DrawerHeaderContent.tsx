import React from 'react';
/* MUI */
import Box from '@mui/material/Box';

/* Widgets */
import WidgetInfo from './widget/WidgetInfo';
/* Overlays */
import OverlayInfo from './overlay/OverlayInfo';

interface DrawerHeaderContentProps {
  drawerTab: number;
}

const DrawerHeaderContent: React.FC<DrawerHeaderContentProps> = ({
  drawerTab
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexGrow: 1
      }}
    >
      {drawerTab === 1 ? <OverlayInfo /> : <WidgetInfo />}
    </Box>
  );
};

export default DrawerHeaderContent;
