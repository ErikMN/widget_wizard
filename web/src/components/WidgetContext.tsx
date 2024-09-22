/* Widget Wizard global context
 * Stuff used throughout the app.
 */
import React, { createContext, useContext, useState } from 'react';
import { jsonRequest } from '../helpers/cgihelper';
import { log, enableLogging } from '../helpers/logger';
import { ApiResponse, Widget, WidgetCapabilities } from '../widgetInterfaces';
import { W_CGI } from './constants';

interface WidgetContextProps {
  /* Widget operations */
  listWidgets: () => Promise<void>;
  listWidgetCapabilities: () => Promise<void>;
  addWidget: (widgetType: string) => Promise<void>;
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
}

const WidgetContext = createContext<WidgetContextProps | undefined>(undefined);

export const WidgetProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  /* States */
  const [activeWidgets, setActiveWidgets] = useState<Widget[]>([]);
  const [widgetCapabilities, setWidgetCapabilities] =
    useState<WidgetCapabilities | null>(null);
  const [selectedWidget, setSelectedWidget] = useState<string>('');
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(
    null
  );
  const [openAlert, setOpenAlert] = useState<boolean>(false);
  const [alertContent, setAlertContent] = useState<string>('');
  const [alertSeverity, setAlertSeverity] = useState<
    'info' | 'success' | 'error' | 'warning'
  >('info');

  enableLogging(false);

  /* Open an alert with content string and severity */
  const handleOpenAlert = (
    content: string,
    severity: 'info' | 'success' | 'error' | 'warning'
  ) => {
    setAlertContent(content);
    setAlertSeverity(severity);
    setOpenAlert(true);
  };

  /* Updates the parameters of a widget. */
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
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);

      /* Update the activeWidgets state */
      if (resp?.data?.generalParams) {
        const updatedWidgetId = resp.data.generalParams.id;
        setActiveWidgets((prevWidgets) => {
          return prevWidgets.map((widget) =>
            widget.generalParams.id === updatedWidgetId
              ? { ...widget, ...resp.data }
              : widget
          );
        });
      }
      handleOpenAlert(
        `Widget ${widgetItem.generalParams.id} updated`,
        'success'
      );
    } catch (error) {
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
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      log('*** LIST ACTIVE WIDGETS', { resp });
      if (resp?.data?.widgets && Array.isArray(resp.data.widgets)) {
        setActiveWidgets(resp.data.widgets);
      }
    } catch (error) {
      handleOpenAlert('Failed to list active widgets', 'error');
      console.error('Error:', error);
    }
  };

  /* Lists all available widget types and the parameters they take.
   */
  const listWidgetCapabilities = async () => {
    const payload = {
      apiVersion: '2.0',
      method: 'listCapabilities'
    };
    try {
      const resp: WidgetCapabilities = await jsonRequest(W_CGI, payload);
      log('*** WIDGET CAPABILITIES', { resp });
      if (resp?.data?.widgets && Array.isArray(resp.data.widgets)) {
        /* Set the entire listCapabilities response object */
        setWidgetCapabilities(resp);
        /* Set the first widget type as selected if available */
        if (resp.data.widgets.length > 0) {
          setSelectedWidget(resp.data.widgets[0].type);
        }
      }
    } catch (error) {
      handleOpenAlert('Failed to list widget capabilities', 'error');
      console.error('Error:', error);
    }
  };

  /* Adds a new widget and returns the widget ID. */
  const addWidget = async (widgetType: string) => {
    const payload = {
      apiVersion: '2.0',
      method: 'addWidget',
      params: {
        generalParams: {
          type: widgetType,
          anchor: 'topLeft',
          channel: 1,
          isVisible: true,
          position: { x: 0, y: 0 },
          size: 'small',
          transparency: 0,
          updateTime: 1
        }
      }
    };
    try {
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      log('*** ADD WIDGET', { resp });
      if (resp?.data) {
        /* After adding the widget, refresh the active widgets list */
        await listWidgets();
      }
      handleOpenAlert(`Added ${widgetType}`, 'success');
    } catch (error) {
      handleOpenAlert(`Failed to add ${widgetType}`, 'error');
      console.error('Error:', error);
    }
  };

  /* Removes a specified widget. */
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
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      log('*** REMOVE WIDGET', { resp });
      /* Instead of calling listWidgets, remove the widget from activeWidgets */
      setActiveWidgets((prevWidgets) =>
        prevWidgets.filter((widget) => widget.generalParams.id !== widgetID)
      );
      handleOpenAlert(`Removed widget ${widgetID}`, 'success');
    } catch (error) {
      handleOpenAlert(`Failed to remove widget ${widgetID}`, 'error');
      console.error('Error:', error);
    }
  };

  /* Removes all currently active widgets. */
  const removeAllWidgets = async () => {
    const payload = {
      apiVersion: '2.0',
      method: 'removeAllWidgets'
    };
    try {
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      log('*** REMOVE ALL WIDGETS', { resp });
      handleOpenAlert('Removed all widgets', 'success');
    } catch (error) {
      handleOpenAlert('Failed to remove all widgets', 'error');
      console.error('Error:', error);
    }
    /* After removing all widgets, refresh the active widgets list */
    listWidgets();
    /* After removing all widgets, reset the dropdown state */
    setOpenDropdownIndex(null);
  };

  /* TODO: cleanup */
  return (
    <WidgetContext.Provider
      value={{
        activeWidgets,
        setActiveWidgets,
        widgetCapabilities,
        setWidgetCapabilities,
        selectedWidget,
        setSelectedWidget,
        openDropdownIndex,
        setOpenDropdownIndex,
        listWidgets,
        listWidgetCapabilities,
        addWidget,
        removeWidget,
        removeAllWidgets,
        updateWidget,
        handleOpenAlert,
        openAlert,
        setOpenAlert,
        alertContent,
        setAlertContent,
        alertSeverity,
        setAlertSeverity
      }}
    >
      {children}
    </WidgetContext.Provider>
  );
};

export const useWidgetContext = () => {
  const context = useContext(WidgetContext);
  if (context === undefined) {
    throw new Error('useWidgetContext must be used within a WidgetProvider');
  }
  return context;
};
