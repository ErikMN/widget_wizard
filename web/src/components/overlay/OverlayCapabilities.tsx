import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { lightTheme, darkTheme } from '../../theme';
import { useAppContext } from '../AppContext';
import { useOverlayContext } from './OverlayContext';
import { CustomContainer, CustomBox, CustomButton } from '../CustomComponents';
import OverlaysDisabled from './OverlaysDisabled';
import ReactJson from 'react-json-view';
import { diagonalTrianglePatternSx } from '../../helpers/backgrounds.js';
/* MUI */
import { ThemeProvider, CssBaseline } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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

const OverlayCapabilities: React.FC = () => {
  /* Global context */
  const { jsonTheme, setJsonTheme, currentTheme } = useAppContext();
  const { overlayCapabilities, listOverlayCapabilities, overlaySupported } =
    useOverlayContext();

  const jsonData = overlayCapabilities?.data;

  /* Navigation */
  const navigate = useNavigate();

  /* Theme */
  const theme = currentTheme === 'dark' ? darkTheme : lightTheme;

  /* Local state */
  const [collapsed, setCollapsed] = useState(false);

  /* Handle navigation back */
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  /* Toggle collapse state */
  const handleToggleCollapse = () => {
    setCollapsed((prev) => !prev);
  };

  /* Handle ReactJson theme change */
  const handleThemeChange = (event: SelectChangeEvent<ReactJsonThemes>) => {
    setJsonTheme(event.target.value as ReactJsonThemes);
  };

  /* List overlay capabilities on mount */
  useEffect(() => {
    const fetchData = async () => {
      await listOverlayCapabilities();
    };
    fetchData();

    console.log(jsonData);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={(theme) => ({
          ...diagonalTrianglePatternSx(theme, { sizePx: 18 }),
          minHeight: '100vh'
        })}
      >
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
              Overlay capabilities
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
              value={jsonTheme as any}
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
          {overlaySupported ? (
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
                theme={jsonTheme as any}
              />
            </CustomBox>
          ) : (
            <OverlaysDisabled sx={{ ml: 0, mr: 0, mt: 0 }} />
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
              disabled={!overlaySupported}
              sx={{ marginTop: 2, marginRight: 1 }}
            >
              {collapsed ? 'Uncollapse all' : 'Collapse all'}
            </CustomButton>

            {/* Back button */}
            <CustomButton
              onClick={handleBack}
              sx={{ marginTop: 2 }}
              variant="contained"
              startIcon={<ArrowBackIcon />}
            >
              Back
            </CustomButton>
          </Box>
        </CustomContainer>
      </Box>
    </ThemeProvider>
  );
};

export default OverlayCapabilities;
