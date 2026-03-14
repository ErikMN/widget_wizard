/* Application widget context
 * This context manages widget-related operations and state
 * throughout the app.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';
import { useTabVisibility } from '../../helpers/hooks.jsx';
import { log, enableLogging } from '../../helpers/logger.js';
import { playSound } from '../../helpers/utils';
import warningSoundUrl from '../../assets/audio/warning.oga';
import trashSoundUrl from '../../assets/audio/trash.oga';
import newSoundUrl from '../../assets/audio/new.oga';
import {
  useAlertActionsContext,
  useAppStatusContext,
  useChannelContext
} from '../context/AppContext.js';
import { ApiResponse, Widget, WidgetCapabilities } from './widgetInterfaces.js';
import {
  apiUpdateWidget,
  apiListWidgets,
  apiListWidgetCapabilities,
  apiAddWidget,
  apiAddCustomWidget,
  apiRemoveWidget,
  apiRemoveAllWidgets
} from './widgetApi';

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
  /* Disable logging by default */
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
  const { handleOpenAlert } = useAlertActionsContext();
  const { setAppLoading } = useAppStatusContext();
  const { currentChannel } = useChannelContext();

  /****************************************************************************/
  /* Widget endpoint communication functions */

  /* Updates the parameters of a widget */
  const updateWidget = useCallback(
    async (widgetItem: Widget) => {
      try {
        setAppLoading(true);
        const resp: ApiResponse = await apiUpdateWidget(widgetItem);
        setAppLoading(false);
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
      } catch (error) {
        setAppLoading(false);
        playSound(warningSoundUrl);
        handleOpenAlert(
          `Widget ${widgetItem.generalParams.id} failed to update`,
          'error'
        );
        console.error('Error:', error);
      }
    },
    [handleOpenAlert, setAppLoading]
  );

  /* Lists all currently active widgets and their parameter values.
   * NOTE: This needs to be done after add, remove, update
   */
  const listWidgets = useCallback(async () => {
    try {
      setAppLoading(true);
      const resp: ApiResponse | null = await apiListWidgets();
      setAppLoading(false);

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
      setAppLoading(false);
      playSound(warningSoundUrl);
      handleOpenAlert('Failed to list active widgets', 'error');
      console.error('Error:', error);
    }
  }, [handleOpenAlert, setAppLoading]);

  /* List widgets on tab switch */
  useTabVisibility(listWidgets);

  /* Lists all available widget types and their parameters */
  const listWidgetCapabilities = useCallback(async () => {
    try {
      setAppLoading(true);
      const resp: WidgetCapabilities | null = await apiListWidgetCapabilities();
      setAppLoading(false);

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
      setAppLoading(false);
      playSound(warningSoundUrl);
      handleOpenAlert('Failed to list widget capabilities', 'error');
      console.error('Error:', error);
    }
  }, [handleOpenAlert, setAppLoading]);

  /* Adds a new widget and refreshes the widget list */
  const addWidget = useCallback(
    async (widgetType: string) => {
      try {
        setAppLoading(true);
        const resp: ApiResponse = await apiAddWidget(
          widgetType,
          currentChannel
        );
        setAppLoading(false);
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
        setAppLoading(false);
        playSound(warningSoundUrl);
        handleOpenAlert(`Failed to add ${widgetType}`, 'error');
        console.error('Error:', error);
      }
    },
    [currentChannel, listWidgets, handleOpenAlert, setAppLoading]
  );

  const addCustomWidget = useCallback(
    async (params: Widget) => {
      try {
        setAppLoading(true);
        const resp: ApiResponse = await apiAddCustomWidget(params);
        setAppLoading(false);
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
        setAppLoading(false);
        playSound(warningSoundUrl);
        handleOpenAlert(`Failed to add ${params.generalParams.type}`, 'error');
        console.error('Error:', error);
      }
    },
    [listWidgets, handleOpenAlert, setAppLoading]
  );

  /* Removes a specified widget */
  const removeWidget = useCallback(
    async (widgetID: number) => {
      try {
        setAppLoading(true);
        const resp: ApiResponse = await apiRemoveWidget(widgetID);
        setAppLoading(false);
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
        setAppLoading(false);
        handleOpenAlert(`Failed to remove widget ${widgetID}`, 'error');
        console.error('Error:', error);
        playSound(warningSoundUrl);
      }
    },
    [handleOpenAlert, setAppLoading]
  );

  /* Removes all currently active widgets */
  const removeAllWidgets = useCallback(async () => {
    try {
      setAppLoading(true);
      const resp: ApiResponse = await apiRemoveAllWidgets();
      setAppLoading(false);
      log('*** REMOVE ALL WIDGETS', { resp });
      if (resp.error) {
        playSound(warningSoundUrl);
        handleOpenAlert(resp.error.message, 'error');
        return;
      }
      playSound(trashSoundUrl);
      handleOpenAlert('Removed all widgets', 'success');
    } catch (error) {
      setAppLoading(false);
      handleOpenAlert('Failed to remove all widgets', 'error');
      console.error('Error:', error);
      playSound(warningSoundUrl);
    }
    /* Refresh the active widget list after removing all */
    listWidgets();
    /* Reset dropdown state after all widgets are removed */
    setOpenWidgetId(null);
  }, [listWidgets, handleOpenAlert, setAppLoading]);

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
