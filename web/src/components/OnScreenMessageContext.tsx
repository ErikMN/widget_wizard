/**
 * OnScreenMessageContext
 *
 * A context for managing on-screen messages displayed over the video player.
 * Components or hooks can call showMessage() to display a message with optional auto-dismiss.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

export interface OnScreenMessage {
  id: string;
  title?: string;
  content: string | React.ReactNode;
  icon?: React.ReactNode;
  duration?: number;
  timestamp: number;
}

interface OnScreenMessageContextType {
  messages: OnScreenMessage[];
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
  const [messages, setMessages] = useState<OnScreenMessage[]>([]);

  const showMessage = useCallback(
    (options: {
      title?: string;
      content: string | React.ReactNode;
      icon?: React.ReactNode;
      duration?: number;
    }) => {
      const id = Math.random().toString(36).substr(2, 9);
      const message: OnScreenMessage = {
        id,
        title: options.title,
        content: options.content,
        icon: options.icon,
        duration: options.duration,
        timestamp: Date.now()
      };

      setMessages([message]);

      /* Auto-dismiss if duration is specified */
      if (options.duration && options.duration > 0) {
        setTimeout(() => {
          dismissMessage(id);
        }, options.duration);
      }
    },
    []
  );

  const dismissMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
  }, []);

  return (
    <OnScreenMessageContext.Provider
      value={{ messages, showMessage, dismissMessage }}
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
