import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { lightTheme, darkTheme } from '../../theme';
import { useGlobalContext } from '../GlobalContext';
import { CustomContainer, CustomBox, CustomButton } from '../CustomComponents';
import WidgetsDisabled from './WidgetsDisabled';
import ReactJson from 'react-json-view';
/* MUI */
import { ThemeProvider, CssBaseline } from '@mui/material';
import Box from '@mui/material/Box';
import DataObjectIcon from '@mui/icons-material/DataObject';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';

/* Define valid theme keys */
type ReactJsonThemes =
  | 'apathy'
  | 'apathy:inverted'
  | 'ashes'
  | 'bespin'
  | 'brewer'
  | 'bright:inverted'
  | 'bright'
  | 'chalk'
  | 'codeschool'
  | 'colors'
  | 'eighties'
  | 'embers'
  | 'flat'
  | 'google'
  | 'grayscale'
  | 'grayscale:inverted'
  | 'greenscreen'
  | 'harmonic'
  | 'hopscotch'
  | 'isotope'
  | 'marrakesh'
  | 'mocha'
  | 'monokai'
  | 'ocean'
  | 'paraiso'
  | 'pop'
  | 'railscasts'
  | 'rjv-default'
  | 'shapeshifter'
  | 'shapeshifter:inverted'
  | 'solarized'
  | 'summerfruit'
  | 'summerfruit:inverted'
  | 'threezerotwofour'
  | 'tomorrow'
  | 'tube'
  | 'twilight';

const WidgetCapabilities: React.FC = () => {
  /* Global context */
  const {
    jsonTheme,
    setJsonTheme,
    widgetCapabilities,
    currentTheme,
    listWidgetCapabilities,
    widgetSupported
  } = useGlobalContext();
  const jsonData = widgetCapabilities?.data;

  /* Navigation */
  const navigate = useNavigate();

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  /* Local state */
  const [collapsed, setCollapsed] = useState(false);

  /* Handle navigation back */
  const handleBack = () => {
    navigate('/');
  };

  /* Toggle collapse state */
  const handleToggleCollapse = () => {
    setCollapsed((prev) => !prev);
  };

  /* Handle ReactJson theme change */
  const handleThemeChange = (event: SelectChangeEvent<ReactJsonThemes>) => {
    setJsonTheme(event.target.value as ReactJsonThemes);
  };

  /* List widgets capabilities on mount */
  useEffect(() => {
    const fetchData = async () => {
      await listWidgetCapabilities();
    };
    fetchData();
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CustomContainer
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
            Widget capabilities
          </Typography>
        </Box>

        {/* Theme Selector */}
        <FormControl
          variant="outlined"
          sx={{
            marginTop: 1,
            marginBottom: 2,
            width: '200px'
          }}
        >
          <InputLabel id="react-json-theme-label">JSON theme</InputLabel>
          <Select
            labelId="react-json-theme-label"
            value={jsonTheme}
            onChange={handleThemeChange}
            label="JSON theme"
          >
            {[
              'apathy',
              'apathy:inverted',
              'ashes',
              'bespin',
              'brewer',
              'bright:inverted',
              'bright',
              'chalk',
              'codeschool',
              'colors',
              'eighties',
              'embers',
              'flat',
              'google',
              'grayscale',
              'grayscale:inverted',
              'greenscreen',
              'harmonic',
              'hopscotch',
              'isotope',
              'marrakesh',
              'mocha',
              'monokai',
              'ocean',
              'paraiso',
              'pop',
              'railscasts',
              'rjv-default',
              'shapeshifter',
              'shapeshifter:inverted',
              'solarized',
              'summerfruit',
              'summerfruit:inverted',
              'threezerotwofour',
              'tomorrow',
              'tube',
              'twilight'
            ].map((theme) => (
              <MenuItem key={theme} value={theme}>
                {theme}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Collapsible JSON View */}
        {widgetSupported ? (
          <>
            <CustomBox
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
                theme={jsonTheme}
              />
            </CustomBox>
          </>
        ) : (
          <WidgetsDisabled sx={{ ml: 0, mr: 0, mt: 0 }} />
        )}

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 4
          }}
        >
          {/* Toggle Collapse CustomButton */}
          <CustomButton
            onClick={handleToggleCollapse}
            variant="outlined"
            disabled={!widgetSupported}
            sx={{ marginTop: 2, marginRight: 1 }}
          >
            {collapsed ? 'Uncollapse all' : 'Collapse all'}
          </CustomButton>
          {/* Back button */}
          <CustomButton
            onClick={handleBack}
            sx={{ marginTop: 2 }}
            variant="contained"
          >
            Back
          </CustomButton>
        </Box>
      </CustomContainer>
    </ThemeProvider>
  );
};

export default WidgetCapabilities;
