/* Application state contexts.
 * Provides shared state providers to use throughout the app.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from 'react';
import { useLocalStorage } from '../../helpers/hooks.jsx';
import { playSound } from '../../helpers/utils.js';
import warningSoundUrl from '../../assets/audio/warning.oga';
import { AppSettings, defaultAppSettings } from '../appInterface.js';

/******************************************************************************/
/* Context interface definitions */

export type Severity = 'info' | 'success' | 'error' | 'warning';

interface AlertStateContextProps {
  openAlert: boolean;
  setOpenAlert: React.Dispatch<React.SetStateAction<boolean>>;
  alertContent: string;
  setAlertContent: React.Dispatch<React.SetStateAction<string>>;
  alertSeverity: Severity;
  setAlertSeverity: React.Dispatch<React.SetStateAction<Severity>>;
}

interface AlertActionsContextProps {
  handleOpenAlert: (content: string, severity: Severity) => void;
}

interface ThemeContextProps {
  currentTheme: string;
  setCurrentTheme: React.Dispatch<React.SetStateAction<string>>;
  jsonTheme: string;
  setJsonTheme: React.Dispatch<React.SetStateAction<string>>;
}

interface AppSettingsContextProps {
  appSettings: AppSettings;
  setAppSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

interface AppStatusContextProps {
  appLoading: boolean;
  setAppLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

interface ChannelContextProps {
  currentChannel: string;
  setCurrentChannel: React.Dispatch<React.SetStateAction<string>>;
}

/******************************************************************************/
/* Context objects */

const AlertStateContext = createContext<AlertStateContextProps | undefined>(
  undefined
);
const AlertActionsContext = createContext<AlertActionsContextProps | undefined>(
  undefined
);
const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);
const AppSettingsContext = createContext<AppSettingsContextProps | undefined>(
  undefined
);
const AppStatusContext = createContext<AppStatusContextProps | undefined>(
  undefined
);
const ChannelContext = createContext<ChannelContextProps | undefined>(
  undefined
);

/******************************************************************************/
/* Helpers */

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

/******************************************************************************/
/* Context providers (exposed via AppProvider) */

/* Provides alert state and the shared alert trigger API */
const AlertProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [openAlert, setOpenAlert] = useState<boolean>(false);
  const [alertContent, setAlertContent] = useState<string>('');
  const [alertSeverity, setAlertSeverity] = useState<Severity>('info');

  const handleOpenAlert = useCallback((content: string, severity: Severity) => {
    setAlertContent(content);
    setAlertSeverity(severity);
    setOpenAlert(true);
    if (severity === 'error' || severity === 'warning') {
      playSound(warningSoundUrl);
    }
  }, []);

  const stateValue = useMemo(
    () => ({
      openAlert,
      setOpenAlert,
      alertContent,
      setAlertContent,
      alertSeverity,
      setAlertSeverity
    }),
    [openAlert, alertContent, alertSeverity]
  );

  const actionsValue = useMemo(
    () => ({
      handleOpenAlert
    }),
    [handleOpenAlert]
  );

  return (
    <AlertActionsContext.Provider value={actionsValue}>
      <AlertStateContext.Provider value={stateValue}>
        {children}
      </AlertStateContext.Provider>
    </AlertActionsContext.Provider>
  );
};

/* Provides persisted UI theme and JSON editor theme preferences */
const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [currentTheme, setCurrentTheme] = useLocalStorage('theme', 'dark');
  const [jsonTheme, setJsonTheme] = useLocalStorage('jsonTheme', 'monokai');

  const value = useMemo(
    () => ({
      currentTheme,
      setCurrentTheme,
      jsonTheme,
      setJsonTheme
    }),
    [currentTheme, setCurrentTheme, jsonTheme, setJsonTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

/* Provides persisted application settings used across the app */
const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [storedAppSettings, setStoredAppSettings] = useLocalStorage(
    'appSettings',
    defaultAppSettings
  );
  const appSettings = useMemo(
    () => ({
      ...defaultAppSettings,
      ...storedAppSettings
    }),
    [storedAppSettings]
  );
  const setAppSettings = useCallback(
    (valueOrFn: React.SetStateAction<AppSettings>) => {
      setStoredAppSettings((prevSettings: AppSettings) => {
        const mergedPrevSettings = {
          ...defaultAppSettings,
          ...prevSettings
        };
        return typeof valueOrFn === 'function'
          ? valueOrFn(mergedPrevSettings)
          : valueOrFn;
      });
    },
    [setStoredAppSettings]
  );

  const value = useMemo(
    () => ({
      appSettings,
      setAppSettings
    }),
    [appSettings, setAppSettings]
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
};

/* Provides shared application loading state */
const AppStatusProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [appLoading, setAppLoading] = useState<boolean>(false);

  const value = useMemo(
    () => ({
      appLoading,
      setAppLoading
    }),
    [appLoading]
  );

  return (
    <AppStatusContext.Provider value={value}>
      {children}
    </AppStatusContext.Provider>
  );
};

/* Provides the currently selected camera channel */
const ChannelProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [currentChannel, setCurrentChannel] = useLocalStorage(
    'currentChannel',
    initChannel()
  );

  const value = useMemo(
    () => ({
      currentChannel,
      setCurrentChannel
    }),
    [currentChannel, setCurrentChannel]
  );

  return (
    <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>
  );
};

/* Composes the app-level state providers into a single wrapper */
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  return (
    <AlertProvider>
      <ThemeProvider>
        <AppSettingsProvider>
          <AppStatusProvider>
            <ChannelProvider>{children}</ChannelProvider>
          </AppStatusProvider>
        </AppSettingsProvider>
      </ThemeProvider>
    </AlertProvider>
  );
};

/******************************************************************************/
/* Context hook helper */

const useRequiredContext = <T,>(
  context: React.Context<T | undefined>,
  providerName: string
): T => {
  const value = useContext(context);
  if (value === undefined) {
    throw new Error(`Context hook must be used within ${providerName}`);
  }
  return value;
};

/******************************************************************************/
/* Context hooks */

export const useAlertStateContext = (): AlertStateContextProps => {
  return useRequiredContext(AlertStateContext, 'AppProvider');
};

export const useAlertActionsContext = (): AlertActionsContextProps => {
  return useRequiredContext(AlertActionsContext, 'AppProvider');
};

export const useThemeContext = (): ThemeContextProps => {
  return useRequiredContext(ThemeContext, 'AppProvider');
};

export const useAppSettingsContext = (): AppSettingsContextProps => {
  return useRequiredContext(AppSettingsContext, 'AppProvider');
};

export const useAppStatusContext = (): AppStatusContextProps => {
  return useRequiredContext(AppStatusContext, 'AppProvider');
};

export const useChannelContext = (): ChannelContextProps => {
  return useRequiredContext(ChannelContext, 'AppProvider');
};
