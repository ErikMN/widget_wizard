import React, { useState } from 'react';
import { useGlobalContext } from './GlobalContext';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fade from '@mui/material/Fade';
import Modal from '@mui/material/Modal';
import Typography from '@mui/material/Typography';

/* JSON View */
import ReactJson from 'react-json-view';

interface CapabilitiesModal {
  open: boolean;
  handleClose: () => void;
}

const CapabilitiesModal: React.FC<CapabilitiesModal> = ({
  open,
  handleClose
}) => {
  /* Global context */
  const { widgetCapabilities } = useGlobalContext();
  const jsonData = widgetCapabilities?.data;

  /* Local state for controlling collapse */
  const [collapsed, setCollapsed] = useState(false);

  /* Toggle collapse state */
  const handleToggleCollapse = () => {
    setCollapsed((prev) => !prev);
  };

  return (
    <Modal
      aria-labelledby="capabilities-modal-title"
      aria-describedby="capabilities-modal-description"
      open={open}
      onClose={handleClose}
      closeAfterTransition
    >
      <Fade in={open}>
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: {
              xs: '90%',
              sm: '80%',
              md: '70%',
              lg: '60%',
              xl: '50%'
            },
            maxWidth: '800px',
            minWidth: '300px',
            bgcolor: 'background.paper',
            boxShadow: 24,
            p: 4,
            borderRadius: 1
          }}
        >
          <Typography
            id="capabilities-modal-title"
            variant="h6"
            component="h2"
            sx={{ marginBottom: 2 }}
          >
            Widget Capabilities
          </Typography>

          {/* Collapsible JSON View */}
          <Box
            sx={{
              maxHeight: '600px',
              overflow: 'auto',
              marginBottom: 2
            }}
          >
            <ReactJson
              src={jsonData || {}}
              collapsed={collapsed}
              enableClipboard={false}
              displayDataTypes={false}
              theme="monokai"
            />
          </Box>

          {/* Toggle Collapse Button */}
          <Button
            onClick={handleToggleCollapse}
            variant="contained"
            sx={{ marginTop: 2, marginRight: 1 }}
          >
            {collapsed ? 'Uncollapse All' : 'Collapse All'}
          </Button>
          {/* Close button */}
          <Button
            onClick={handleClose}
            sx={{ marginTop: 2 }}
            variant="contained"
          >
            Close
          </Button>
        </Box>
      </Fade>
    </Modal>
  );
};

export default CapabilitiesModal;
