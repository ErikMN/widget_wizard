/**
 * MessageOverlay
 *
 * Renders on-screen messages from the OnScreenMessageContext.
 * Messages can be manually dismissed by clicking.
 */
import React, { useEffect, useState } from 'react';
import { useOnScreenMessage } from './OnScreenMessageContext';
import { useAppContext } from './AppContext';
import { useScreenSizes } from '../helpers/hooks.jsx';
/* MUI */
import { Fade } from '@mui/material';

const MessageOverlay: React.FC = () => {
  const { messages, dismissMessage } = useOnScreenMessage();
  const { appSettings } = useAppContext();

  /* Screen size */
  const { isMobile } = useScreenSizes();

  const message = messages[0];
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
    }
  }, [message]);

  if (!appSettings.enableOnScreenMessages || !message) {
    return null;
  }

  const handleDismiss = () => {
    setVisible(false);
  };

  return (
    <Fade
      in={visible}
      timeout={{ enter: 200, exit: 200 }}
      onExited={() => dismissMessage(message.id)}
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
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: isMobile ? '16px 18px' : '24px 32px',
            borderRadius: isMobile ? '6px' : '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
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
                    color: 'white',
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
              color: 'rgba(255, 255, 255, 0.9)'
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
              color: 'rgba(255, 255, 255, 0.6)',
              fontStyle: 'italic'
            }}
          >
            Click to dismiss
          </div>
        </div>
      </div>
    </Fade>
  );
};

export default MessageOverlay;
