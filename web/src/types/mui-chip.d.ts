// https://github.com/mui/material-ui/issues/29033
import '@mui/material/Chip';

declare module '@mui/material/Chip' {
  interface ChipOwnProps {
    disableRipple?: boolean;
  }
}
