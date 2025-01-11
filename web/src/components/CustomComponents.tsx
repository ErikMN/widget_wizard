import React from 'react';
/* MUI */
import { IconButton, IconButtonProps } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Switch, SwitchProps } from '@mui/material';
import { Box, BoxProps } from '@mui/material';
import { Container, ContainerProps } from '@mui/material';
import { Slider, SliderProps } from '@mui/material';
import { Button, ButtonProps } from '@mui/material';

/** Extended IconButtonProps to include width and height */
interface CustomIconButtonProps extends IconButtonProps {
  width?: string;
  height?: string;
}

/** Styled IconButton */
const StyledCustomIconButton = styled(IconButton)<CustomIconButtonProps>(
  ({ theme, width = '40px', height = '40px' }) => ({
    width,
    height,
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
      width: `calc(${width} - 8px)`,
      height: `calc(${height} - 8px)`,
      backgroundColor:
        theme.palette.mode === 'dark'
          ? 'rgba(255, 255, 255, 0.1)'
          : 'rgba(211, 211, 211, 0.3)',
      borderRadius: '4px',
      zIndex: -1
    }
  })
);

/** Custom IconButton Component */
export const CustomStyledIconButton: React.FC<CustomIconButtonProps> = (
  props
) => {
  const { width, height, ...rest } = props;
  return (
    <StyledCustomIconButton
      width={width}
      height={height}
      disableRipple
      tabIndex={0}
      {...rest}
    />
  );
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

/** Custom Slider */
const CustomStyledSlider = styled(Slider)(({ theme }) => ({
  '& .MuiSlider-rail': {
    height: 4,
    backgroundColor:
      theme.palette.mode === 'dark'
        ? theme.palette.grey[400]
        : theme.palette.grey[700],
    opacity: 1
  },
  '& .MuiSlider-track': {
    height: 4,
    backgroundColor: theme.palette.warning.main,
    border: 'none'
  },
  '& .MuiSlider-thumb': {
    width: 20,
    height: 20,
    // marginLeft: '10px',
    backgroundColor: theme.palette.warning.main,
    border: `4px solid ${theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[200]}`
    // '&:hover, &.Mui-focusVisible': {
    //   boxShadow: 'none'
    // },
    // '&:active': {
    //   boxShadow: 'none'
    // }
  }
}));

export interface CustomSliderProps extends SliderProps {}

export const CustomSlider: React.FC<CustomSliderProps> = (props) => {
  return <CustomStyledSlider {...props} />;
};

/** Custom Button */
const CustomStyledButton = styled(Button)(({ theme }) => ({
  borderRadius: '4px'
  /* Add additional stylings here: */
}));

export interface CustomButtonProps extends ButtonProps {}

/** Custom Button Component */
export const CustomButton: React.FC<CustomButtonProps> = (props) => {
  return <CustomStyledButton disableRipple {...props} />;
};
