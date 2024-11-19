import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { lightTheme, darkTheme } from '../../theme';
import { useGlobalContext } from '../GlobalContext';
/* MUI */
import { ThemeProvider, CssBaseline } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import DataObjectIcon from '@mui/icons-material/DataObject';
import Typography from '@mui/material/Typography';

/* JSON View */
import ReactJson from 'react-json-view';

const WidgetCapabilities: React.FC = () => {
  /* Global context */
  const { widgetCapabilities, currentTheme, listWidgetCapabilities } =
    useGlobalContext();
  const jsonData = widgetCapabilities?.data;

  /* Navigation */
  const navigate = useNavigate();

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  /* Local state for controlling collapse */
  const [collapsed, setCollapsed] = useState(false);

  /* Handle navigation back */
  const handleBack = () => {
    /* Navigate back to previous screen */
    navigate(-1);
  };

  /* Toggle collapse state */
  const handleToggleCollapse = () => {
    setCollapsed((prev) => !prev);
  };

  /* List widgets capabilites on mount */
  useEffect(() => {
    const fetchData = async () => {
      await listWidgetCapabilities();
    };
    fetchData();
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          height: '100vh'
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            marginBottom: 2
          }}
        >
          <DataObjectIcon sx={{ marginRight: 1 }} />
          <Typography id="settings-modal-title" variant="h5" component="h2">
            Widget Capabilities
          </Typography>
        </Box>

        {/* Collapsible JSON View */}
        <Box
          sx={{
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

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 4
          }}
        >
          {/* Toggle Collapse Button */}
          <Button
            onClick={handleToggleCollapse}
            variant="outlined"
            sx={{ marginTop: 2, marginRight: 1 }}
          >
            {collapsed ? 'Uncollapse All' : 'Collapse All'}
          </Button>
          {/* Back button */}
          <Button
            onClick={handleBack}
            sx={{ marginTop: 2 }}
            variant="contained"
          >
            Back
          </Button>
        </Box>
      </Container>
    </ThemeProvider>
  );
};

export default WidgetCapabilities;
