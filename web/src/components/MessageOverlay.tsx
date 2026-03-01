/**
 * MessageOverlay
 *
 * Renders the current on-screen message from the OnScreenMessageContext.
 * The message can be manually dismissed by clicking.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useOnScreenMessage } from './OnScreenMessageContext';
import { useAppContext } from './AppContext';
import { useScreenSizes } from '../helpers/hooks.jsx';
/* MUI */
import { Fade } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
/* MUI X */
import { PieChart } from '@mui/x-charts/PieChart';

const MessageOverlay: React.FC = () => {
  const { message, dismissMessage } = useOnScreenMessage();
  const { appSettings } = useAppContext();
  const theme = useTheme();

  /* Screen size */
  const { isMobile } = useScreenSizes();

  /* Local state */
  const [visible, setVisible] = useState<boolean>(false);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const exitingMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (message) {
      setVisible(true);
    }
  }, [message]);

  useEffect(() => {
    if (!message) {
      setRemainingMs(0);
      return;
    }
    const currentMessage = message;
    const durationMs = currentMessage.duration;
    if (typeof durationMs !== 'number' || durationMs <= 0) {
      setRemainingMs(0);
      return;
    }
    const updateRemainingTime = () => {
      const elapsedMs = Date.now() - currentMessage.timestamp;
      setRemainingMs(Math.max(0, durationMs - elapsedMs));
    };

    updateRemainingTime();
    const intervalId = window.setInterval(updateRemainingTime, 100);

    return () => {
      clearInterval(intervalId);
    };
  }, [message]);

  if (!appSettings.enableOnScreenMessages || !message) {
    return null;
  }

  const durationMs =
    typeof message.duration === 'number' ? message.duration : 0;
  const hasTimedDuration = durationMs > 0;
  const fillRatio =
    durationMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / durationMs)) : 0;
  const pieChartSize = isMobile ? 22 : 30;
  const cardBackgroundColor = alpha(
    theme.palette.background.paper,
    theme.palette.mode === 'dark' ? 0.9 : 0.94
  );
  const cardBorderColor = alpha(
    theme.palette.divider,
    theme.palette.mode === 'dark' ? 0.7 : 0.9
  );
  const contentTextColor = alpha(theme.palette.text.primary, 0.92);
  const hintTextColor = alpha(theme.palette.text.secondary, 0.85);
  const timerAccentColor = theme.palette.warning.main;
  const timerBackdropColor = alpha(theme.palette.action.active, 0.08);

  const handleDismiss = () => {
    exitingMessageIdRef.current = message.id;
    setVisible(false);
  };

  return (
    <Fade
      in={visible}
      timeout={{ enter: 200, exit: 200 }}
      onExited={() => {
        if (exitingMessageIdRef.current) {
          dismissMessage(exitingMessageIdRef.current);
          exitingMessageIdRef.current = null;
        }
      }}
    >
      <div
        onClick={handleDismiss}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1000
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: cardBackgroundColor,
            color: theme.palette.text.primary,
            padding: hasTimedDuration
              ? isMobile
                ? '16px 50px 42px 18px'
                : '24px 62px 48px 32px'
              : isMobile
                ? '16px 18px'
                : '24px 32px',
            borderRadius: isMobile ? '6px' : '8px',
            boxShadow: theme.shadows[8],
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            border: `1px solid ${cardBorderColor}`,
            maxWidth: isMobile ? 'calc(100% - 32px)' : '450px',
            minWidth: isMobile ? 'auto' : '450px',
            width: isMobile ? 'calc(100% - 32px)' : 'auto',
            textAlign: 'center',
            transition: 'transform 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform =
              'translate(-50%, -50%) scale(1.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)';
          }}
        >
          {(message.icon || message.title) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: isMobile ? '10px' : '12px',
                marginBottom: '12px'
              }}
            >
              {message.icon && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: isMobile ? '20px' : '24px',
                    flexShrink: 0
                  }}
                >
                  {message.icon}
                </div>
              )}
              {message.title && (
                <div
                  style={{
                    fontSize: isMobile ? '15px' : '16px',
                    fontWeight: '600',
                    color: theme.palette.text.primary,
                    textAlign: 'center'
                  }}
                >
                  {message.title}
                </div>
              )}
            </div>
          )}
          <div
            style={{
              fontSize: isMobile ? '13px' : '14px',
              lineHeight: '1.8',
              color: contentTextColor
            }}
          >
            {typeof message.content === 'string' ? (
              <div>{message.content}</div>
            ) : (
              message.content
            )}
          </div>
          <div
            style={{
              fontSize: isMobile ? '11px' : '12px',
              marginTop: '12px',
              color: hintTextColor,
              fontStyle: 'italic'
            }}
          >
            Click to dismiss
          </div>
          {hasTimedDuration && (
            <div
              style={{
                position: 'absolute',
                right: isMobile ? '8px' : '12px',
                bottom: isMobile ? '8px' : '12px',
                width: `${pieChartSize}px`,
                height: `${pieChartSize}px`,
                borderRadius: '50%',
                backgroundColor: timerBackdropColor,
                pointerEvents: 'none'
              }}
            >
              <PieChart
                hideLegend
                skipAnimation
                width={pieChartSize}
                height={pieChartSize}
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                series={[
                  {
                    startAngle: 0,
                    endAngle: 360,
                    sortingValues: 'none',
                    cx: '50%',
                    cy: '50%',
                    innerRadius: 0,
                    outerRadius: pieChartSize / 2,
                    paddingAngle: 0,
                    cornerRadius: 0,
                    data: [
                      {
                        id: 'elapsed',
                        value: fillRatio,
                        color: timerAccentColor
                      },
                      {
                        id: 'remaining',
                        value: 1 - fillRatio,
                        color: 'transparent'
                      }
                    ]
                  }
                ]}
              />
            </div>
          )}
        </div>
      </div>
    </Fade>
  );
};

export default MessageOverlay;
