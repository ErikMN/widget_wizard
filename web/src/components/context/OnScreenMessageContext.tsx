/**
 * OnScreenMessageContext
 *
 * A context for managing a single on-screen message displayed over the video player.
 * Components or hooks can call showMessage() to display a message with optional auto-dismiss.
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect
} from 'react';

export interface OnScreenMessage {
  id: string;
  title?: string;
  content: string | React.ReactNode;
  icon?: React.ReactNode;
  duration?: number;
  timestamp: number;
}

interface OnScreenMessageContextType {
  message: OnScreenMessage | null;
  showMessage: (options: {
    title?: string;
    content: string | React.ReactNode;
    icon?: React.ReactNode;
    duration?: number;
  }) => void;
  dismissMessage: (id: string) => void;
}

const OnScreenMessageContext = createContext<
  OnScreenMessageContextType | undefined
>(undefined);

export const OnScreenMessageProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [message, setMessage] = useState<OnScreenMessage | null>(null);

  /* Store timeout for the currently active message */
  const timeoutRef = useRef<number | null>(null);

  const clearCurrentTimeout = () => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const dismissMessage = useCallback((id: string) => {
    clearCurrentTimeout();
    setMessage((prev) => (prev?.id === id ? null : prev));
  }, []);

  const showMessage = useCallback(
    (options: {
      title?: string;
      content: string | React.ReactNode;
      icon?: React.ReactNode;
      duration?: number;
    }) => {
      /* Clear any existing timeout since we enforce a single message */
      clearCurrentTimeout();

      const id = Math.random().toString(36).substr(2, 9);

      const newMessage: OnScreenMessage = {
        id,
        title: options.title,
        content: options.content,
        icon: options.icon,
        duration: options.duration,
        timestamp: Date.now()
      };

      /* Replace any existing message */
      setMessage(newMessage);

      /* Auto-dismiss if duration is specified */
      if (options.duration && options.duration > 0) {
        timeoutRef.current = window.setTimeout(() => {
          dismissMessage(id);
        }, options.duration);
      }
    },
    [dismissMessage]
  );

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      clearCurrentTimeout();
    };
  }, []);

  return (
    <OnScreenMessageContext.Provider
      value={{ message, showMessage, dismissMessage }}
    >
      {children}
    </OnScreenMessageContext.Provider>
  );
};

export const useOnScreenMessage = () => {
  const context = useContext(OnScreenMessageContext);
  if (!context) {
    throw new Error(
      'useOnScreenMessage must be used within OnScreenMessageProvider'
    );
  }
  return context;
};
