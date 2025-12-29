/* MainMenu
 *
 * Vertical top-level navigation menu.
 *
 * Routing:
 * - "/" shows this menu (default route)
 * - Each item navigates to its corresponding section
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
/* App */
import { CustomButton } from './CustomComponents';
/* MUI */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import WidgetsIcon from '@mui/icons-material/Widgets';
import LayersIcon from '@mui/icons-material/Layers';

/****************************************************************************/

/* MainMenuButton
 *
 * One single entry in the main menu.
 */
interface MainMenuButtonProps {
  label: string;
  icon: React.ReactElement;
  to: string;
}

const MainMenuButton: React.FC<MainMenuButtonProps> = ({ label, icon, to }) => {
  const navigate = useNavigate();

  return (
    <CustomButton
      variant="outlined"
      fullWidth
      startIcon={icon}
      onClick={() => navigate(to)}
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: 1.2,
        color: 'text.primary',
        borderColor: 'grey.600',
        transition: 'background-color 0.3s ease, border-color 0.3s ease',
        ...(theme.palette.mode === 'dark'
          ? { textShadow: '0px 1px 4px rgba(0,0,0,0.8)' }
          : { textShadow: '0px 1px 2px rgba(255,255,255,0.8)' })
      })}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
        {label}
      </Typography>
    </CustomButton>
  );
};

/****************************************************************************/

/* The main menu */
const MainMenu: React.FC = () => {
  return (
    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <MainMenuButton
        label="Widgets"
        icon={<WidgetsIcon color="primary" />}
        to="/widgets"
      />

      <MainMenuButton
        label="Overlays"
        icon={<LayersIcon color="primary" />}
        to="/overlays"
      />
    </Box>
  );
};

export default MainMenu;
