import React from 'react';
import { useWidgetContext } from './WidgetContext';
/* MUI */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fade from '@mui/material/Fade';
import Modal from '@mui/material/Modal';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';

interface CapabilitiesModal {
  open: boolean;
  handleClose: () => void;
}

const CapabilitiesModal: React.FC<CapabilitiesModal> = ({
  open,
  handleClose
}) => {
  /* Global context */
  const { widgetCapabilities } = useWidgetContext();

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
            textAlign: 'center',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 800,
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

          <TextField
            label="Capabilities"
            multiline
            minRows={8}
            value={JSON.stringify(widgetCapabilities?.data, null, 2)}
            fullWidth
            variant="filled"
            slotProps={{
              input: {
                readOnly: true
              }
            }}
            sx={(theme) => ({
              backgroundColor: theme.palette.background.default,
              maxHeight: '600px',
              overflow: 'auto',
              '& textarea': {
                resize: 'none',
                fontFamily: 'Monospace'
              }
            })}
          />
          <Button onClick={handleClose} sx={{ mt: 2 }} variant="contained">
            Close
          </Button>
        </Box>
      </Fade>
    </Modal>
  );
};

export default CapabilitiesModal;
