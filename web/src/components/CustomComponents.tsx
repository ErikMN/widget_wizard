import React from 'react';
/* MUI */
import { IconButton, IconButtonProps } from '@mui/material';
import { styled } from '@mui/material/styles';

const CustomIconButton = styled(IconButton)(({ theme }) => ({
  width: '40px',
  height: '40px',
  borderRadius: '4px',
  '&:hover svg': {
    color: theme.palette.primary.main
  }
}));

export interface CustomIconButtonProps extends IconButtonProps {}

export const CustomStyledIconButton: React.FC<CustomIconButtonProps> = (
  props
) => {
  return <CustomIconButton {...props} />;
};
