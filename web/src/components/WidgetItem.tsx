import React, { useState } from 'react';
import { Widget } from '../widgetInterfaces';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import WidgetsIcon from '@mui/icons-material/Widgets';

interface WidgetItemProps {
  widget: Widget;
  index: number;
  openDropdownIndex: number | null;
  toggleDropdown: (index: number) => void;
  removeWidget: (widgetID: number) => void;
  updateWidget: (widget: Widget) => void;
}

const WidgetItem: React.FC<WidgetItemProps> = ({
  widget,
  index,
  openDropdownIndex,
  toggleDropdown,
  removeWidget,
  updateWidget
}) => {
  /* Local state */
  const [isVisible, setIsVisible] = useState(widget.generalParams.isVisible);

  const handleVisibilityChange = () => {
    const newVisibility = !isVisible;
    setIsVisible(newVisibility);
    const updatedWidget = {
      ...widget,
      generalParams: {
        ...widget.generalParams,
        isVisible: newVisibility
      }
    };
    updateWidget(updatedWidget);
  };

  return (
    <Box key={widget.generalParams.id} sx={{ marginBottom: 2 }}>
      <Button
        variant="outlined"
        fullWidth
        startIcon={<WidgetsIcon />}
        endIcon={
          openDropdownIndex === index ? <ExpandLessIcon /> : <ExpandMoreIcon />
        }
        onClick={() => toggleDropdown(index)}
      >
        <Typography variant="subtitle1">
          {widget.generalParams.type.charAt(0).toUpperCase() +
            widget.generalParams.type.slice(1)}
        </Typography>
        <Chip
          label={`ID: ${widget.generalParams.id}`}
          size="small"
          sx={{ ml: 1 }}
        />
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
            Widget type: {widget.generalParams.type} ({widget.width}x
            {widget.height})
          </Typography>
          <Typography variant="body2">
            Widget position: [{widget.generalParams.position.x},{' '}
            {widget.generalParams.position.y}]
          </Typography>
          <Typography variant="body2" sx={{ marginTop: 1 }}>
            Visible:
            <Switch
              checked={isVisible}
              onChange={handleVisibilityChange}
              color="primary"
            />
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
