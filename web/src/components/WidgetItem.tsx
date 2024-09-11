import React from 'react';
import { Widget } from '../widgetInterfaces';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import WidgetsIcon from '@mui/icons-material/Widgets';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';

interface WidgetItemProps {
  widget: Widget;
  index: number;
  openDropdownIndex: number | null;
  toggleDropdown: (index: number) => void;
  removeWidget: (widgetID: number) => void;
}

const WidgetItem: React.FC<WidgetItemProps> = ({
  widget,
  index,
  openDropdownIndex,
  toggleDropdown,
  removeWidget
}) => {
  return (
    <Box key={widget.generalParams.id} sx={{ marginBottom: 2 }}>
      <Button
        variant="outlined"
        fullWidth
        startIcon={<WidgetsIcon />}
        endIcon={<ExpandMoreIcon />}
        onClick={() => toggleDropdown(index)}
      >
        Widget:{' '}
        {widget.generalParams.type.charAt(0).toUpperCase() +
          widget.generalParams.type.slice(1)}
      </Button>

      {/* Dropdown for widget details */}
      <Collapse in={openDropdownIndex === index}>
        <Box
          sx={{
            padding: 2,
            border: '1px solid #ccc',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            marginTop: 1
          }}
        >
          <Typography variant="body2">
            Widget type: {widget.generalParams.type}
          </Typography>
          <Typography variant="body2">
            Widget ID: {widget.generalParams.id}
          </Typography>
          <Typography variant="body2">
            Widget position: [{widget.generalParams.position.x},{' '}
            {widget.generalParams.position.y}]
          </Typography>
          <Button
            style={{ marginTop: '10px' }}
            color="error"
            variant="contained"
            onClick={() => removeWidget(widget.generalParams.id)}
            startIcon={<DeleteIcon />}
          >
            Remove
          </Button>
          {/* TODO: Additional widget information here */}
        </Box>
      </Collapse>
    </Box>
  );
};

export default WidgetItem;
