/* CSS Patterns to use for backgrounds
 * More patterns:
 * https://www.magicpattern.design/tools/css-backgrounds
 */

/* MUI */
import type { Theme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';

export const diagonalTrianglePatternSx = (
  theme: Theme,
  options?: { reverse?: boolean; sizePx?: number }
) => {
  const lineColor =
    theme.palette.mode === 'dark'
      ? theme.palette.grey[500]
      : theme.palette.grey[400];
  const alpha = theme.palette.mode === 'dark' ? '10' : '30';
  const angle = options?.reverse ? '-45deg' : '45deg';
  const sizePx = options?.sizePx ?? 15;

  return {
    backgroundColor: 'transparent',
    backgroundImage: `linear-gradient(${angle}, ${lineColor}${alpha} 50%, transparent 50%)`,
    backgroundSize: `${sizePx}px ${sizePx}px`
  };
};

export const diagonalCheckerPatternSx = (
  theme: Theme,
  options?: {
    opacity?: number;
    reverse?: boolean;
    sizePx?: number;
    offsetPx?: number;
  }
) => {
  const opacity = options?.opacity ?? 0.8;
  const sizePx = options?.sizePx ?? 20;
  const offsetPx = options?.offsetPx ?? sizePx / 2;

  const bgColor =
    theme.palette.mode === 'dark'
      ? theme.palette.background.default
      : theme.palette.grey[100];

  const fgColor =
    theme.palette.mode === 'dark'
      ? theme.palette.grey[600]
      : theme.palette.grey[500];

  const angle = options?.reverse ? '-45deg' : '45deg';

  return {
    backgroundColor: bgColor,
    opacity,
    backgroundImage: `repeating-linear-gradient(${angle}, ${fgColor} 25%, transparent 25%, transparent 75%, ${fgColor} 75%, ${fgColor}), repeating-linear-gradient(${angle}, ${fgColor} 25%, ${bgColor} 25%, ${bgColor} 75%, ${fgColor} 75%, ${fgColor})`,
    backgroundPosition: `0 0, ${offsetPx}px ${offsetPx}px`,
    backgroundSize: `${sizePx}px ${sizePx}px`
  };
};

export const gridLinePatternSx = (
  theme: Theme,
  options?: {
    opacity?: number;
    majorSizePx?: number;
    minorSizePx?: number;
    majorLinePx?: number;
    minorLinePx?: number;
  }
) => {
  const opacity = options?.opacity ?? 0.8;

  const majorSizePx = options?.majorSizePx ?? 50;
  const minorSizePx = options?.minorSizePx ?? 10;

  const majorLinePx = options?.majorLinePx ?? 2;
  const minorLinePx = options?.minorLinePx ?? 1;

  const bgColor =
    theme.palette.mode === 'dark'
      ? theme.palette.background.default
      : theme.palette.grey[100];

  const lineColor =
    theme.palette.mode === 'dark'
      ? theme.palette.grey[600]
      : theme.palette.grey[500];

  return {
    backgroundColor: bgColor,
    opacity,
    backgroundImage: `linear-gradient(${lineColor} ${majorLinePx}px, transparent ${majorLinePx}px), linear-gradient(90deg, ${lineColor} ${majorLinePx}px, transparent ${majorLinePx}px), linear-gradient(${lineColor} ${minorLinePx}px, transparent ${minorLinePx}px), linear-gradient(90deg, ${lineColor} ${minorLinePx}px, ${bgColor} ${minorLinePx}px)`,
    backgroundSize: `${majorSizePx}px ${majorSizePx}px, ${majorSizePx}px ${majorSizePx}px, ${minorSizePx}px ${minorSizePx}px, ${minorSizePx}px ${minorSizePx}px`,
    backgroundPosition: `-${majorLinePx}px -${majorLinePx}px, -${majorLinePx}px -${majorLinePx}px, -${minorLinePx}px -${minorLinePx}px, -${minorLinePx}px -${minorLinePx}px`
  };
};

export const crossGridPatternSx = (
  theme: Theme,
  options?: {
    patternAlpha?: number;
    majorSizePx?: number;
    minorSizePx?: number;
    lineWidthPx?: number;
  }
) => {
  const patternAlpha = options?.patternAlpha ?? 0.15;
  const majorSizePx = options?.majorSizePx ?? 50;
  const minorSizePx = options?.minorSizePx ?? 25;
  const lineWidthPx = options?.lineWidthPx ?? 2;

  const bgColor =
    theme.palette.mode === 'dark'
      ? theme.palette.background.default
      : theme.palette.grey[100];

  const baseLineColor =
    theme.palette.mode === 'dark'
      ? theme.palette.grey[600]
      : theme.palette.grey[500];

  const lineColor = alpha(baseLineColor, patternAlpha);
  const halfMajor = majorSizePx / 2;

  return {
    backgroundColor: bgColor,
    backgroundImage: `
      radial-gradient(circle, transparent 20%, ${bgColor} 20%, ${bgColor} 80%, transparent 80%, transparent),
      radial-gradient(circle, transparent 20%, ${bgColor} 20%, ${bgColor} 80%, transparent 80%, transparent),
      linear-gradient(${lineColor} ${lineWidthPx}px, transparent ${lineWidthPx}px),
      linear-gradient(90deg, ${lineColor} ${lineWidthPx}px, ${bgColor} ${lineWidthPx}px)
    `,
    backgroundSize: `
      ${majorSizePx}px ${majorSizePx}px,
      ${majorSizePx}px ${majorSizePx}px,
      ${minorSizePx}px ${minorSizePx}px,
      ${minorSizePx}px ${minorSizePx}px
    `,
    backgroundPosition: `
      0 0,
      ${halfMajor}px ${halfMajor}px,
      0 -${lineWidthPx / 2}px,
      -${lineWidthPx / 2}px 0
    `
  };
};

export const horizontalStripePatternSx = (
  theme: Theme,
  options?: { opacity?: number; sizePx?: number }
) => {
  const opacity = options?.opacity ?? 0.25;
  const sizePx = options?.sizePx ?? 4;

  const baseBgColor = theme.palette.background.paper;

  const baseLineColor =
    theme.palette.mode === 'dark'
      ? theme.palette.grey[600]
      : theme.palette.grey[500];

  const bgColor = alpha(baseBgColor, opacity);
  const lineColor = alpha(baseLineColor, opacity);

  return {
    backgroundColor: bgColor,
    backgroundImage: `linear-gradient(0deg, ${bgColor} 75%, ${lineColor} 50%)`,
    backgroundSize: `${sizePx}px ${sizePx}px`
  };
};
