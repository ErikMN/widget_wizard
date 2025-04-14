import React from 'react';
import logo from '../assets/img/widgy2.png';
import logo_xmas from '../assets/img/widgy_xmas.png';
import logo_easter from '../assets/img/widgy_easter.png';

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {}

const Logo: React.FC<LogoProps> = (props) => {
  const currentDate = new Date();

  const currentMonth = currentDate.getMonth();
  const currentDay = currentDate.getDate();

  /* X-mas period: December 1 (month 11) to January 13 (month 0) */
  const isXmasPeriod =
    (currentMonth === 11 && currentDay >= 1) || // December 1–31
    (currentMonth === 0 && currentDay <= 13); // January 1–13

  /* Easter period: entire April (month 3) */
  const isEasterPeriod = currentMonth === 3;

  let logoToDisplay = logo;
  let hoverMessage = '';

  if (isXmasPeriod) {
    logoToDisplay = logo_xmas;
    hoverMessage = 'Merry Christmas!';
  } else if (isEasterPeriod) {
    logoToDisplay = logo_easter;
    hoverMessage = 'Happy Easter!';
  }

  return (
    <img
      src={logoToDisplay}
      alt="Logo"
      title={hoverMessage || 'Welcome!'}
      {...props}
    />
  );
};

export default Logo;
