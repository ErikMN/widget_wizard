import React, { useEffect, useState } from 'react';
import { useWidgetContext } from './WidgetContext';
import { Widget } from '../widgetInterfaces';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface WidgetParamsProps {
  widget: Widget;
}

const WidgetParams: React.FC<WidgetParamsProps> = ({ widget }) => {
  /* Global context */
  const { appSettings, widgetCapabilities } = useWidgetContext();

  /* Print widget params capabilities for this widget */
  const filteredWidget = widgetCapabilities?.data?.widgets?.filter(
    (widgetCap) => widgetCap.type === widget?.generalParams?.type
  );
  if (filteredWidget && filteredWidget.length > 0) {
    console.log('Widget capabilities:', filteredWidget[0]?.widgetParams);
  }
  /* Print widget param values for this widget */
  console.log('Widget params:', widget?.widgetParams);

  return (
    <Box sx={{ marginTop: 1 }}>
      <Typography variant="h6" sx={{ marginBottom: 1 }}>
        Widget parameters
      </Typography>
    </Box>
  );
};

export default WidgetParams;
