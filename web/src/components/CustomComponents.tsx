import React from 'react';
/* MUI */
import { IconButtonProps } from '@mui/material/IconButton';
import { styled } from '@mui/material/styles';
import { SwitchProps } from '@mui/material/Switch';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import { Box, BoxProps } from '@mui/material';
import { Container, ContainerProps } from '@mui/material';

/** Custom IconButton */
const CustomIconButton = styled(IconButton)(({ theme }) => ({
  width: '40px',
  height: '40px',
  borderRadius: '4px',
  position: 'relative',
  '&:hover svg': {
    color: theme.palette.primary.main
  },
  '&:hover::before': {
    content: '""',
    position: 'absolute',
    top: '4px',
    left: '4px',
    width: 'calc(100% - 8px)',
    height: 'calc(100% - 8px)',
    backgroundColor:
      theme.palette.mode === 'dark'
        ? 'rgba(255, 255, 255, 0.1)'
        : 'rgba(211, 211, 211, 0.3)',
    borderRadius: '4px',
    zIndex: -1
  }
}));

export interface CustomIconButtonProps extends IconButtonProps {}

export const CustomStyledIconButton: React.FC<CustomIconButtonProps> = (
  props
) => {
  return <CustomIconButton {...props} disableRipple />;
};

/** Custom Switch */
const CustomStyledSwitch = styled(Switch)(({ theme }) => ({
  padding: 8,
  '& .MuiSwitch-track': {
    borderRadius: 22 / 2,
    backgroundColor: 'transparent',
    border: `2px solid ${
      theme.palette.mode === 'dark'
        ? theme.palette.grey[200]
        : theme.palette.grey[800]
    }`,
    '&::before, &::after': {
      content: '""',
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      width: 16,
      height: 16
    }
    // '&::before': {
    //   backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 24 24"><path fill="${encodeURIComponent(
    //     theme.palette.getContrastText(theme.palette.primary.main)
    //   )}" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>')`,
    //   left: 12
    // },
    // '&::after': {
    //   backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 24 24"><path fill="${encodeURIComponent(
    //     theme.palette.getContrastText(theme.palette.primary.main)
    //   )}" d="M19,13H5V11H19V13Z" /></svg>')`,
    //   right: 12
    // }
  },
  '& .MuiSwitch-thumb': {
    boxShadow: 'none',
    width: 16,
    height: 16,
    margin: 2,
    backgroundColor: theme.palette.grey[500],
    transition: theme.transitions.create(['background-color', 'transform'], {
      duration: theme.transitions.duration.short
    })
  },
  '& .Mui-checked .MuiSwitch-thumb': {
    backgroundColor: theme.palette.grey[900]
  },
  '& .Mui-checked + .MuiSwitch-track': {
    backgroundColor: theme.palette.primary.main,
    border: 'none',
    opacity: '1 !important'
  }
}));

export interface CustomSwitchProps extends SwitchProps {}

export const CustomSwitch: React.FC<CustomSwitchProps> = (props) => {
  return <CustomStyledSwitch {...props} />;
};

/** Custom Box */
const CustomStyledBox = styled(Box)(({ theme }) => ({
  '&::-webkit-scrollbar': {
    width: '8px',
    backgroundColor: 'transparent'
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor:
      theme.palette.mode === 'dark'
        ? theme.palette.grey[600]
        : theme.palette.grey[400],
    borderRadius: '6px'
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor:
      theme.palette.mode === 'dark'
        ? theme.palette.grey[800]
        : theme.palette.grey[200]
  }
}));

export interface CustomBoxProps extends BoxProps {}

export const CustomBox: React.FC<CustomBoxProps> = (props) => {
  return <CustomStyledBox {...props} />;
};

/** Custom Container */
const CustomStyledContainer = styled(Container)(({ theme }) => ({
  '&::-webkit-scrollbar': {
    width: '8px',
    backgroundColor: 'transparent'
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor:
      theme.palette.mode === 'dark'
        ? theme.palette.grey[600]
        : theme.palette.grey[400],
    borderRadius: '6px'
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor:
      theme.palette.mode === 'dark'
        ? theme.palette.grey[800]
        : theme.palette.grey[200]
  }
}));

export interface CustomContainerProps extends ContainerProps {}

export const CustomContainer: React.FC<CustomContainerProps> = (props) => {
  return <CustomStyledContainer {...props} />;
};
