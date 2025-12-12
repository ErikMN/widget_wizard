/* Application context (global state)
 * This context manages application-level operations and state throughout the app.
 */
import React, { createContext, useContext, useState } from 'react';
import { useLocalStorage } from '../helpers/hooks.jsx';
import { playSound } from '../helpers/utils';
import warningSoundUrl from '../assets/audio/warning.oga';
import { AppSettings, defaultAppSettings } from './appInterface.js';

type Severity = 'info' | 'success' | 'error' | 'warning';

/* Interface defining the structure of the app context */
interface AppContextProps {
  /* Alert handling */
  handleOpenAlert: (content: string, severity: Severity) => void;

  /* Alert-related state */
  openAlert: boolean;
  setOpenAlert: React.Dispatch<React.SetStateAction<boolean>>;
  alertContent: string;
  setAlertContent: React.Dispatch<React.SetStateAction<string>>;
  alertSeverity: Severity;
  setAlertSeverity: React.Dispatch<React.SetStateAction<Severity>>;

  /* Theme-related state */
  currentTheme: string;
  setCurrentTheme: React.Dispatch<React.SetStateAction<string>>;

  /* Global settings for the application */
  appSettings: AppSettings;
  setAppSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  jsonTheme: string;
  setJsonTheme: React.Dispatch<React.SetStateAction<string>>;

  /* App-level loading */
  widgetLoading: boolean;
  setWidgetLoading: React.Dispatch<React.SetStateAction<boolean>>;

  /* Selected videoplayer camera channel */
  currentChannel: string;
  setCurrentChannel: React.Dispatch<React.SetStateAction<string>>;
}

/* Creating the App context */
const AppContext = createContext<AppContextProps | undefined>(undefined);

/* Function to init channel from local storage */
const initChannel = () => {
  try {
    const vapix = localStorage.getItem('vapix');
    if (vapix) {
      const parsed = JSON.parse(vapix);
      if (parsed?.camera) {
        return String(parsed.camera);
      }
    }
  } catch (e) {
    console.warn('Failed to parse vapix from localStorage:', e);
  }
  return '1';
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  /* Alert-related state */
  const [openAlert, setOpenAlert] = useState<boolean>(false);
  const [alertContent, setAlertContent] = useState<string>('');
  const [alertSeverity, setAlertSeverity] = useState<Severity>('info');

  /* Local storage state */
  const [currentTheme, setCurrentTheme] = useLocalStorage('theme', 'dark');
  const [appSettings, setAppSettings] = useLocalStorage(
    'appSettings',
    defaultAppSettings
  );
  const [jsonTheme, setJsonTheme] = useLocalStorage('jsonTheme', 'monokai');

  /* App-level loading state */
  const [widgetLoading, setWidgetLoading] = useState<boolean>(false);

  /* Selected videoplayer channel */
  const [currentChannel, setCurrentChannel] = useLocalStorage(
    'currentChannel',
    initChannel()
  );

  /* Open an alert with content and severity */
  const handleOpenAlert = (content: string, severity: Severity) => {
    setAlertContent(content);
    setAlertSeverity(severity);
    setOpenAlert(true);
    if (severity === 'error' || severity === 'warning') {
      playSound(warningSoundUrl);
    }
  };

  return (
    <AppContext.Provider
      value={{
        handleOpenAlert,
        openAlert,
        setOpenAlert,
        alertContent,
        setAlertContent,
        alertSeverity,
        setAlertSeverity,
        currentTheme,
        setCurrentTheme,
        appSettings,
        setAppSettings,
        jsonTheme,
        setJsonTheme,
        widgetLoading,
        setWidgetLoading,
        currentChannel,
        setCurrentChannel
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

/* Hook to use the AppContext, with an error if used outside the provider */
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
