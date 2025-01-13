/* Application global context
 * This context manages widget-related operations and state
 * throughout the app.
 */
import React, { createContext, useContext, useState } from 'react';
import { useLocalStorage, useTabVisibility } from '../helpers/hooks.jsx';
import { jsonRequest } from '../helpers/cgihelper.jsx';
import { log, enableLogging } from '../helpers/logger.js';
import {
  ApiResponse,
  Widget,
  WidgetCapabilities,
  AppSettings,
  defaultAppSettings
} from './widget/widgetInterfaces.js';
import { W_CGI } from './constants.js';

/* Interface defining the structure of the context */
interface GlobalContextProps {
  /* Widget operations */
  listWidgets: () => Promise<void>;
  listWidgetCapabilities: () => Promise<void>;
  addWidget: (widgetType: string) => Promise<void>;
  addCustomWidget: (params: Widget) => Promise<void>;
  removeWidget: (widgetID: number) => Promise<void>;
  removeAllWidgets: () => Promise<void>;
  updateWidget: (widgetItem: Widget) => Promise<void>;

  /* Alert handling */
  handleOpenAlert: (
    content: string,
    severity: 'info' | 'success' | 'error' | 'warning'
  ) => void;

  /* Widget-related state */
  activeWidgets: Widget[];
  setActiveWidgets: React.Dispatch<React.SetStateAction<Widget[]>>;
  widgetCapabilities: WidgetCapabilities | null;
  setWidgetCapabilities: React.Dispatch<
    React.SetStateAction<WidgetCapabilities | null>
  >;
  widgetLoading: boolean;
  widgetSupported: boolean;
  setWidgetSupported: React.Dispatch<React.SetStateAction<boolean>>;

  /* Draggable widget state */
  activeDraggableWidget: {
    id: number | null;
    active: boolean;
    clickBBox: boolean;
    highlight: boolean;
  };
  setActiveDraggableWidget: React.Dispatch<
    React.SetStateAction<{
      id: number | null;
      active: boolean;
      clickBBox: boolean;
      highlight: boolean;
    }>
  >;

  /* UI-related state */
  openDropdownIndex: number | null;
  setOpenDropdownIndex: React.Dispatch<React.SetStateAction<number | null>>;
  selectedWidget: string;
  setSelectedWidget: React.Dispatch<React.SetStateAction<string>>;

  /* Alert-related state */
  openAlert: boolean;
  setOpenAlert: React.Dispatch<React.SetStateAction<boolean>>;
  alertContent: string;
  setAlertContent: React.Dispatch<React.SetStateAction<string>>;
  alertSeverity: 'info' | 'success' | 'error' | 'warning';
  setAlertSeverity: React.Dispatch<
    React.SetStateAction<'info' | 'success' | 'error' | 'warning'>
  >;

  /* Theme-related state */
  currentTheme: string;
  setCurrentTheme: React.Dispatch<React.SetStateAction<string>>;

  /* Global settings for the application */
  appSettings: AppSettings;
  setAppSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  jsonTheme: undefined;
  setJsonTheme: React.Dispatch<React.SetStateAction<string>>;
}

/* Creating the Widget context */
const GlobalContext = createContext<GlobalContextProps | undefined>(undefined);

export const GlobalProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  /* Widget-related state variables */
  const [activeWidgets, setActiveWidgets] = useState<Widget[]>([]);
  const [widgetCapabilities, setWidgetCapabilities] =
    useState<WidgetCapabilities | null>(null);
  const [selectedWidget, setSelectedWidget] = useState<string>('');
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(
    null
  );
  const [widgetLoading, setWidgetLoading] = useState<boolean>(false);
  const [widgetSupported, setWidgetSupported] = useState<boolean>(true);

  /* Alert-related state variables */
  const [openAlert, setOpenAlert] = useState<boolean>(false);
  const [alertContent, setAlertContent] = useState<string>('');
  const [alertSeverity, setAlertSeverity] = useState<
    'info' | 'success' | 'error' | 'warning'
  >('info');

  /* Local storage state */
  const [currentTheme, setCurrentTheme] = useLocalStorage('theme', 'dark');
  const [appSettings, setAppSettings] = useLocalStorage(
    'appSettings',
    defaultAppSettings
  );
  const [jsonTheme, setJsonTheme] = useLocalStorage('jsonTheme', 'monokai');

  /* Disabling logging by default, but can be enabled as needed */
  enableLogging(false);

  /* Draggable widget state */
  const [activeDraggableWidget, setActiveDraggableWidget] = useState<{
    id: number | null;
    active: boolean;
    clickBBox: boolean;
    highlight: boolean;
  }>({ id: null, active: false, clickBBox: false, highlight: false });

  /* Function to open an alert with content and severity */
  const handleOpenAlert = (
    content: string,
    severity: 'info' | 'success' | 'error' | 'warning'
  ) => {
    setAlertContent(content);
    setAlertSeverity(severity);
    setOpenAlert(true);
  };

  /****************************************************************************/
  /* Widget endpoint communication functions */

  /* Updates the parameters of a widget */
  const updateWidget = async (widgetItem: Widget) => {
    const { type, ...updatedGeneralParams } = widgetItem.generalParams;
    const payload = {
      apiVersion: '2.0',
      method: 'updateWidget',
      params: {
        generalParams: updatedGeneralParams,
        widgetParams: widgetItem.widgetParams
      }
    };
    try {
      setWidgetLoading(true);
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      setWidgetLoading(false);
      if (resp.error) {
        handleOpenAlert(resp.error.message, 'error');
        return;
      }
      /* If response contains updated generalParams, update the widget state */
      if (resp?.data?.generalParams) {
        const updatedWidgetId = resp.data.generalParams.id;
        setActiveWidgets((prevWidgets) =>
          prevWidgets.map((widget) =>
            widget.generalParams.id === updatedWidgetId
              ? { ...widget, ...resp.data }
              : widget
          )
        );
      }
      handleOpenAlert(
        `Widget ${widgetItem.generalParams.id} updated`,
        'success'
      );
    } catch (error) {
      setWidgetLoading(false);
      handleOpenAlert(
        `Widget ${widgetItem.generalParams.id} failed to update`,
        'error'
      );
      console.error('Error:', error);
    }
  };

  /* Lists all currently active widgets and their parameter values.
   * NOTE: This needs to be done after add, remove, update
   */
  const listWidgets = async () => {
    const payload = {
      apiVersion: '2.0',
      method: 'listWidgets'
    };
    try {
      setWidgetLoading(true);
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      setWidgetLoading(false);
      log('*** LIST ACTIVE WIDGETS', { resp });
      if (resp.error) {
        handleOpenAlert(resp.error.message, 'error');
        return;
      }
      /* Check if response contains widgets and set state */
      if (resp?.data?.widgets && Array.isArray(resp.data.widgets)) {
        setActiveWidgets(resp.data.widgets);
      }
    } catch (error) {
      /* Failed to contact widget backend: Widgets are not supported */
      setWidgetSupported(false);
      setWidgetLoading(false);
      handleOpenAlert('Failed to list active widgets', 'error');
      console.error('Error:', error);
    }
  };

  /* List widgets on tab switch */
  useTabVisibility(listWidgets);

  /* Lists all available widget types and their parameters */
  const listWidgetCapabilities = async () => {
    const payload = {
      apiVersion: '2.0',
      method: 'listCapabilities'
    };
    try {
      setWidgetLoading(true);
      const resp: WidgetCapabilities = await jsonRequest(W_CGI, payload);
      setWidgetLoading(false);
      log('*** WIDGET CAPABILITIES', { resp });
      if (resp.error) {
        handleOpenAlert(resp.error.message, 'error');
        return;
      }
      /* Set widget capabilities and select first widget if available */
      if (resp?.data?.widgets && Array.isArray(resp.data.widgets)) {
        /* Set the entire listCapabilities response object */
        setWidgetCapabilities(resp);
        /* Set the first widget type as selected if available */
        if (resp.data.widgets.length > 0) {
          setSelectedWidget(resp.data.widgets[0].type);
        }
      }
    } catch (error) {
      /* Failed to contact widget backend: Widgets are not supported */
      setWidgetSupported(false);
      setWidgetLoading(false);
      handleOpenAlert('Failed to list widget capabilities', 'error');
      console.error('Error:', error);
    }
  };

  /* Adds a new widget and refreshes the widget list */
  const addWidget = async (widgetType: string) => {
    const payload = {
      apiVersion: '2.0',
      method: 'addWidget',
      params: {
        generalParams: {
          type: widgetType,
          datasource: '#D0',
          anchor: 'none',
          channel: 1,
          isVisible: true,
          position: { x: 0, y: 0 },
          size: 'small',
          transparency: 0,
          updateTime: 1
        },
        widgetParams: {} as {
          minAlarmThreshold?: { value: number; enabled: boolean };
          maxAlarmThreshold?: { value: number; enabled: boolean };
        }
      }
    };
    /* NOTE: Official web UI seems to need these to move the bbox */
    if (widgetType === 'linegraph' || widgetType === 'meter') {
      payload.params.widgetParams.minAlarmThreshold = {
        value: 0,
        enabled: false
      };
      payload.params.widgetParams.maxAlarmThreshold = {
        value: 100,
        enabled: false
      };
    }

    try {
      setWidgetLoading(true);
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      setWidgetLoading(false);
      log('*** ADD WIDGET', { resp });
      if (resp.error) {
        handleOpenAlert(resp.error.message, 'error');
        return;
      }
      if (resp?.data) {
        /* After adding the widget, refresh the active widgets list */
        await listWidgets();
      }
      handleOpenAlert(`Added ${widgetType}`, 'success');
    } catch (error) {
      setWidgetLoading(false);
      handleOpenAlert(`Failed to add ${widgetType}`, 'error');
      console.error('Error:', error);
    }
  };

  const addCustomWidget = async (params: Widget) => {
    /* Strip stuff not accepted by addWidget */
    const { height, width, generalParams, ...restParams } = params;
    const { id, ...restGeneralParams } = generalParams || {};
    const payload = {
      apiVersion: '2.0',
      method: 'addWidget',
      params: {
        ...restParams,
        generalParams: restGeneralParams
      }
    };
    try {
      setWidgetLoading(true);
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      setWidgetLoading(false);
      log('*** ADD WIDGET', { resp });
      if (resp.error) {
        handleOpenAlert(resp.error.message, 'error');
        return;
      }
      if (resp?.data) {
        /* After adding the widget, refresh the active widgets list */
        await listWidgets();
      }
      handleOpenAlert(`Added ${params.generalParams.type}`, 'success');
    } catch (error) {
      setWidgetLoading(false);
      handleOpenAlert(`Failed to add ${params.generalParams.type}`, 'error');
      console.error('Error:', error);
    }
  };

  /* Removes a specified widget */
  const removeWidget = async (widgetID: number) => {
    const payload = {
      apiVersion: '2.0',
      method: 'removeWidget',
      params: {
        generalParams: {
          id: widgetID
        }
      }
    };
    try {
      setWidgetLoading(true);
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      setWidgetLoading(false);
      log('*** REMOVE WIDGET', { resp });
      if (resp.error) {
        handleOpenAlert(resp.error.message, 'error');
        return;
      }
      /* Update activeWidgets state by filtering out the removed widget */
      setActiveWidgets((prevWidgets) =>
        prevWidgets.filter((widget) => widget.generalParams.id !== widgetID)
      );
      handleOpenAlert(`Removed widget ${widgetID}`, 'success');
    } catch (error) {
      setWidgetLoading(false);
      handleOpenAlert(`Failed to remove widget ${widgetID}`, 'error');
      console.error('Error:', error);
    }
  };

  /* Removes all currently active widgets */
  const removeAllWidgets = async () => {
    const payload = {
      apiVersion: '2.0',
      method: 'removeAllWidgets'
    };
    try {
      setWidgetLoading(true);
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      setWidgetLoading(false);
      log('*** REMOVE ALL WIDGETS', { resp });
      if (resp.error) {
        handleOpenAlert(resp.error.message, 'error');
        return;
      }
      handleOpenAlert('Removed all widgets', 'success');
    } catch (error) {
      setWidgetLoading(false);
      handleOpenAlert('Failed to remove all widgets', 'error');
      console.error('Error:', error);
    }
    /* Refresh the active widget list after removing all */
    listWidgets();
    /* Reset dropdown state after all widgets are removed */
    setOpenDropdownIndex(null);
  };

  /****************************************************************************/

  return (
    <GlobalContext.Provider
      value={{
        activeDraggableWidget,
        setActiveDraggableWidget,
        activeWidgets,
        setActiveWidgets,
        widgetCapabilities,
        setWidgetCapabilities,
        widgetLoading,
        widgetSupported,
        setWidgetSupported,
        selectedWidget,
        setSelectedWidget,
        openDropdownIndex,
        setOpenDropdownIndex,
        listWidgets,
        listWidgetCapabilities,
        addWidget,
        addCustomWidget,
        removeWidget,
        removeAllWidgets,
        updateWidget,
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
        setJsonTheme
      }}
    >
      {children}
    </GlobalContext.Provider>
  );
};

/* Hook to use the GlobalContext, with an error if used outside the provider */
export const useGlobalContext = () => {
  const context = useContext(GlobalContext);
  if (context === undefined) {
    throw new Error('useGlobalContext must be used within a GlobalProvider');
  }
  return context;
};
