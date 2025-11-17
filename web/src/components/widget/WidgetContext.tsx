/* Application widget context
 * This context manages widget-related operations and state
 * throughout the app.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';
import { useTabVisibility } from '../../helpers/hooks.jsx';
import { jsonRequest } from '../../helpers/cgihelper.jsx';
import { log, enableLogging } from '../../helpers/logger.js';
import { playSound } from '../../helpers/utils';
import warningSoundUrl from '../../assets/audio/warning.oga';
import trashSoundUrl from '../../assets/audio/trash.oga';
import newSoundUrl from '../../assets/audio/new.oga';
import { useAppContext } from '../AppContext';
import { ApiResponse, Widget, WidgetCapabilities } from './widgetInterfaces.js';
import { W_CGI } from '../constants.js';

// DANGER ZONE: Changing API version may break stuff
const API_VERSION = '2.0';

/* Interface defining the structure of the context */
interface WidgetContextProps {
  /* Widget operations */
  listWidgets: () => Promise<void>;
  listWidgetCapabilities: () => Promise<void>;
  addWidget: (widgetType: string) => Promise<void>;
  addCustomWidget: (params: Widget) => Promise<void>;
  removeWidget: (widgetID: number) => Promise<void>;
  removeAllWidgets: () => Promise<void>;
  updateWidget: (widgetItem: Widget) => Promise<void>;

  /* Widget-related state */
  activeWidgets: Widget[];
  setActiveWidgets: React.Dispatch<React.SetStateAction<Widget[]>>;
  widgetCapabilities: WidgetCapabilities | null;
  setWidgetCapabilities: React.Dispatch<
    React.SetStateAction<WidgetCapabilities | null>
  >;

  /* Widget support state (widget context) */
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
  openWidgetId: number | null;
  setOpenWidgetId: React.Dispatch<React.SetStateAction<number | null>>;
  selectedWidget: string;
  setSelectedWidget: React.Dispatch<React.SetStateAction<string>>;
}

/* Creating the Widget context */
const WidgetContext = createContext<WidgetContextProps | undefined>(undefined);

/* Inner provider that sits under AppProvider so it can consume app state */
export const WidgetProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  /* Disabling logging by default, but can be enabled as needed */
  enableLogging(false);

  /* Widget-related state variables */
  const [activeWidgets, setActiveWidgets] = useState<Widget[]>([]);
  const [widgetCapabilities, setWidgetCapabilities] =
    useState<WidgetCapabilities | null>(null);
  const [selectedWidget, setSelectedWidget] = useState<string>('');
  const [openWidgetId, setOpenWidgetId] = useState<number | null>(null);
  const [widgetSupported, setWidgetSupported] = useState<boolean>(true);

  /* Draggable widget state */
  const [activeDraggableWidget, setActiveDraggableWidget] = useState<{
    id: number | null;
    active: boolean;
    clickBBox: boolean;
    highlight: boolean;
  }>({ id: null, active: false, clickBBox: false, highlight: false });

  /* Global context */
  const { handleOpenAlert, setWidgetLoading, currentChannel } = useAppContext();

  /****************************************************************************/
  /* Widget endpoint communication functions */

  /* Updates the parameters of a widget */
  const updateWidget = useCallback(
    async (widgetItem: Widget) => {
      const { type, ...updatedGeneralParams } = widgetItem.generalParams;
      const payload = {
        apiVersion: API_VERSION,
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
          playSound(warningSoundUrl);
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
        playSound(warningSoundUrl);
        handleOpenAlert(
          `Widget ${widgetItem.generalParams.id} failed to update`,
          'error'
        );
        console.error('Error:', error);
      }
    },
    [handleOpenAlert, setWidgetLoading]
  );

  /* Lists all currently active widgets and their parameter values.
   * NOTE: This needs to be done after add, remove, update
   */
  const listWidgets = useCallback(async () => {
    const payload = {
      apiVersion: API_VERSION,
      method: 'listWidgets'
    };
    try {
      setWidgetLoading(true);
      const resp: ApiResponse | null = await jsonRequest(W_CGI, payload);
      setWidgetLoading(false);

      /* Backend missing or invalid JSON */
      if (!resp) {
        setWidgetSupported(false);
        setActiveWidgets([]);
        return;
      }

      log('*** LIST ACTIVE WIDGETS', { resp });
      if (resp.error) {
        playSound(warningSoundUrl);
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
      playSound(warningSoundUrl);
      handleOpenAlert('Failed to list active widgets', 'error');
      console.error('Error:', error);
    }
  }, [handleOpenAlert, setWidgetLoading]);

  /* List widgets on tab switch */
  useTabVisibility(listWidgets);

  /* Lists all available widget types and their parameters */
  const listWidgetCapabilities = useCallback(async () => {
    const payload = {
      apiVersion: API_VERSION,
      method: 'listCapabilities'
    };
    try {
      setWidgetLoading(true);
      const resp: WidgetCapabilities | null = await jsonRequest(W_CGI, payload);
      setWidgetLoading(false);

      /* Backend missing or invalid JSON */
      if (!resp) {
        setWidgetSupported(false);
        setActiveWidgets([]);
        return;
      }

      log('*** WIDGET CAPABILITIES', { resp });
      if (resp.error) {
        playSound(warningSoundUrl);
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
      playSound(warningSoundUrl);
      handleOpenAlert('Failed to list widget capabilities', 'error');
      console.error('Error:', error);
    }
  }, [handleOpenAlert, setWidgetLoading]);

  /* Adds a new widget and refreshes the widget list */
  const addWidget = useCallback(
    async (widgetType: string) => {
      const payload = {
        apiVersion: API_VERSION,
        method: 'addWidget',
        params: {
          /* Default general widget parameter settings
           * NOTE: We might not want defaults for _every_ general params here
           * because they would overwrite custom per widget defaults.
           */
          generalParams: {
            type: widgetType,
            datasource: '#D0',
            /* anchor: 'none', */
            channel: parseInt(currentChannel, 10),
            isVisible: true,
            position: { x: 0, y: 0 },
            size: 'medium',
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
          playSound(warningSoundUrl);
          handleOpenAlert(resp.error.message, 'error');
          return;
        }
        if (resp?.data) {
          /* After adding the widget, refresh the active widgets list */
          await listWidgets();
        }
        playSound(newSoundUrl);
        handleOpenAlert(`Added ${widgetType}`, 'success');
      } catch (error) {
        setWidgetLoading(false);
        playSound(warningSoundUrl);
        handleOpenAlert(`Failed to add ${widgetType}`, 'error');
        console.error('Error:', error);
      }
    },
    [currentChannel, listWidgets, handleOpenAlert, setWidgetLoading]
  );

  const addCustomWidget = useCallback(
    async (params: Widget) => {
      /* Strip stuff not accepted by addWidget */
      const { height, width, generalParams, ...restParams } = params;
      const { id, ...restGeneralParams } = generalParams || {};
      const payload = {
        apiVersion: API_VERSION,
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
          playSound(warningSoundUrl);
          handleOpenAlert(resp.error.message, 'error');
          return;
        }
        if (resp?.data) {
          /* After adding the widget, refresh the active widgets list */
          await listWidgets();
        }
        playSound(newSoundUrl);
        handleOpenAlert(`Added ${params.generalParams.type}`, 'success');
      } catch (error) {
        setWidgetLoading(false);
        playSound(warningSoundUrl);
        handleOpenAlert(`Failed to add ${params.generalParams.type}`, 'error');
        console.error('Error:', error);
      }
    },
    [listWidgets, handleOpenAlert, setWidgetLoading]
  );

  /* Removes a specified widget */
  const removeWidget = useCallback(
    async (widgetID: number) => {
      const payload = {
        apiVersion: API_VERSION,
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
          playSound(warningSoundUrl);
          handleOpenAlert(resp.error.message, 'error');
          return;
        }
        /* Update activeWidgets state by filtering out the removed widget */
        setActiveWidgets((prevWidgets) =>
          prevWidgets.filter((widget) => widget.generalParams.id !== widgetID)
        );
        playSound(trashSoundUrl);
        handleOpenAlert(`Removed widget ${widgetID}`, 'success');
      } catch (error) {
        setWidgetLoading(false);
        handleOpenAlert(`Failed to remove widget ${widgetID}`, 'error');
        console.error('Error:', error);
        playSound(warningSoundUrl);
      }
    },
    [handleOpenAlert, setWidgetLoading]
  );

  /* Removes all currently active widgets */
  const removeAllWidgets = useCallback(async () => {
    const payload = {
      apiVersion: API_VERSION,
      method: 'removeAllWidgets'
    };
    try {
      setWidgetLoading(true);
      const resp: ApiResponse = await jsonRequest(W_CGI, payload);
      setWidgetLoading(false);
      log('*** REMOVE ALL WIDGETS', { resp });
      if (resp.error) {
        playSound(warningSoundUrl);
        handleOpenAlert(resp.error.message, 'error');
        return;
      }
      playSound(trashSoundUrl);
      handleOpenAlert('Removed all widgets', 'success');
    } catch (error) {
      setWidgetLoading(false);
      handleOpenAlert('Failed to remove all widgets', 'error');
      console.error('Error:', error);
      playSound(warningSoundUrl);
    }
    /* Refresh the active widget list after removing all */
    listWidgets();
    /* Reset dropdown state after all widgets are removed */
    setOpenWidgetId(null);
  }, [listWidgets, handleOpenAlert, setWidgetLoading]);

  /****************************************************************************/
  /* Provider */

  const value: WidgetContextProps = {
    activeDraggableWidget,
    setActiveDraggableWidget,
    activeWidgets,
    setActiveWidgets,
    widgetCapabilities,
    setWidgetCapabilities,
    widgetSupported,
    setWidgetSupported,
    selectedWidget,
    setSelectedWidget,
    openWidgetId,
    setOpenWidgetId,
    listWidgets,
    listWidgetCapabilities,
    addWidget,
    addCustomWidget,
    removeWidget,
    removeAllWidgets,
    updateWidget
  };

  return (
    <WidgetContext.Provider value={value}>{children}</WidgetContext.Provider>
  );
};

/* Hook to use the WidgetContext, with an error if used outside the provider */
export const useWidgetContext = (): WidgetContextProps => {
  const context = useContext(WidgetContext);
  if (!context) {
    throw new Error('useWidgetContext must be used within a WidgetProvider');
  }
  return context;
};
