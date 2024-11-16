import React from 'react';
import logo from '../assets/img/widgy2.png';
import logo_xmas from '../assets/img/widgy_xmas.png';

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {}

const Logo: React.FC<LogoProps> = (props) => {
  const currentDate = new Date();

  /* X-mas logo date range */
  const xmasStartDate = new Date(currentDate.getFullYear(), 11, 1); // December 1
  const xmasEndDate = new Date(currentDate.getFullYear() + 1, 0, 13); // January 13 of next year

  const isXmasPeriod =
    currentDate >= xmasStartDate && currentDate <= xmasEndDate;
  const logoToDisplay = isXmasPeriod ? logo_xmas : logo;

  return <img src={logoToDisplay} alt="Logo" {...props} />;
};

export default Logo;
