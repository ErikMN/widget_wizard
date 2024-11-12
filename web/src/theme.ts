/**
 * This file contains the theme configuration for the app.
 */
import { createTheme } from '@mui/material/styles';
import { grey } from '@mui/material/colors';

const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#ffa726', // Primary color (buttons, app bar, etc.)
      contrastText: '#525252' // Text color on primary elements
    },
    secondary: {
      main: '#ffffff' // Secondary color (accents, floating action buttons)
    },
    background: {
      default: grey[50], // Main background color
      paper: grey[50] // Background color for cards, dialogs, etc.
    },
    text: {
      primary: grey[900], // Text color on the default background
      secondary: '#242424' // Secondary text color
    },
    error: {
      main: '#d32f2f' // Error color for alerts, inputs, etc.
    },
    warning: {
      main: '#ffa726' // Warning color
    },
    info: {
      main: '#29b6f6' // Info color
    },
    success: {
      main: '#66bb6a' // Success color
    }
  },
  typography: {
    fontFamily: 'Segoe UI, Roboto, Arial, sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700
    },
    h5: {
      color: '#525252',
      fontSize: '24px'
    },
    h6: {
      color: '#525252',
      fontSize: '16px',
      fontWeight: 500
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5
    },
    button: {
      textTransform: 'none' // Disable uppercase transformation for buttons
    }
  },
  shape: {
    borderRadius: 8 // Default border-radius for components (e.g., buttons, cards)
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8 // Rounder button edges
        },
        contained: {
          boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.2)' // Custom shadow for contained buttons
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: '#ffcc33' // Custom AppBar color
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0px 3px 10px rgba(0, 0, 0, 0.1)', // Card shadow
          borderRadius: 8 // Rounded corners for cards
        }
      }
    }
  }
});

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#ffa726', // Primary color (buttons, app bar, etc.)
      contrastText: '#fff' // Text color on primary elements
    },
    secondary: {
      main: '#292929' // Secondary color
    },
    background: {
      default: grey[900], // Background color for the whole app
      paper: '#292929' // Background color for cards, dialogs, etc.
    },
    text: {
      primary: '#fff', // Text color for the default dark background
      secondary: '#d6d6d6' // Lighter text color
    },
    error: {
      main: '#f44336' // Error color
    },
    warning: {
      main: '#ffa726' // Warning color
    },
    info: {
      main: '#29b6f6' // Info color
    },
    success: {
      main: '#66bb6a' // Success color
    }
  },
  typography: {
    fontFamily: 'Segoe UI, Roboto, Arial, sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700
    },
    h5: {
      color: '#b8b8b8',
      fontSize: '24px'
    },
    h6: {
      color: '#b8b8b8',
      fontSize: '16px',
      fontWeight: 500
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5
    },
    button: {
      textTransform: 'none' // Disable uppercase transformation for buttons
    }
  },
  shape: {
    borderRadius: 8 // Default border-radius for components (e.g., buttons, cards)
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8 // Rounded button edges
        },
        contained: {
          boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.2)' // Custom shadow for contained buttons
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: grey[800] // Dark AppBar color
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0px 3px 10px rgba(0, 0, 0, 0.1)', // Custom card shadow
          borderRadius: 8 // Rounded corners for cards
        }
      }
    }
  }
});

export { lightTheme, darkTheme };
