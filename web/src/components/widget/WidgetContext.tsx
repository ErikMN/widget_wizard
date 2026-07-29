/* Application widget context
 * This context manages widget-related operations and state
 * throughout the app.
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef
} from 'react';
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

/* Widget data */
interface WidgetDataContextProps {
  activeWidgets: Widget[];
  widgetCapabilities: WidgetCapabilities | null;
  widgetSupported: boolean;
  selectedWidget: string;
}

/* Widget UI state */
interface WidgetUiStateContextProps {
  activeDraggableWidget: {
    id: number | null;
    active: boolean;
    clickBBox: boolean;
    highlight: boolean;
  };
  openWidgetId: number | null;
}

/* Widget UI setters */
interface WidgetUiSettersContextProps {
  setActiveDraggableWidget: React.Dispatch<
    React.SetStateAction<{
      id: number | null;
      active: boolean;
      clickBBox: boolean;
      highlight: boolean;
    }>
  >;
  setOpenWidgetId: React.Dispatch<React.SetStateAction<number | null>>;
  setSelectedWidget: React.Dispatch<React.SetStateAction<string>>;
}

type WidgetUpdater = (current: Widget) => Widget;

interface UpdateWidgetOptions {
  showLoading?: boolean;
  optimistic?: boolean;
}

type WidgetUiContextProps = WidgetUiStateContextProps &
  WidgetUiSettersContextProps;

/* Widget actions */
interface WidgetActionsContextProps {
  setActiveWidgets: React.Dispatch<React.SetStateAction<Widget[]>>;
  setWidgetCapabilities: React.Dispatch<
    React.SetStateAction<WidgetCapabilities | null>
  >;
  setWidgetSupported: React.Dispatch<React.SetStateAction<boolean>>;
  listWidgets: () => Promise<void>;
  listWidgetCapabilities: () => Promise<void>;
  addWidget: (widgetType: string) => Promise<void>;
  addCustomWidget: (params: Widget) => Promise<void>;
  removeWidget: (widgetID: number) => Promise<void>;
  removeAllWidgets: () => Promise<void>;
  updateWidget: (
    widgetId: number,
    updater: WidgetUpdater,
    options?: UpdateWidgetOptions
  ) => Promise<void>;
}

type WidgetContextProps = WidgetDataContextProps &
  WidgetUiContextProps &
  WidgetActionsContextProps;

const WidgetDataContext = createContext<WidgetDataContextProps | undefined>(
  undefined
);
const WidgetUiStateContext = createContext<
  WidgetUiStateContextProps | undefined
>(undefined);
const WidgetUiSettersContext = createContext<
  WidgetUiSettersContextProps | undefined
>(undefined);
const WidgetActionsContext = createContext<
  WidgetActionsContextProps | undefined
>(undefined);

/* Inner provider that sits under AppProvider so it can consume app state */
export const WidgetProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  /* Disable logging by default */
  enableLogging(false);

  /* Widget-related state variables */
  const [activeWidgets, setActiveWidgetsState] = useState<Widget[]>([]);
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

  const latestWidgetsRef = useRef<Widget[]>([]);

  const setActiveWidgets = useCallback(
    (update: React.SetStateAction<Widget[]>) => {
      const current = latestWidgetsRef.current;
      const next = typeof update === 'function' ? update(current) : update;

      latestWidgetsRef.current = next;
      setActiveWidgetsState(next);
    },
    []
  );

  /* Run updates for one widget in order. */
  const widgetUpdateQueueRef = useRef<Map<number, Promise<void>>>(new Map());
  const removingWidgetIdsRef = useRef<Set<number>>(new Set());

  /****************************************************************************/
  /* Widget endpoint communication functions */

  /* Updates the parameters of a widget */
  const updateWidget = useCallback(
    async (
      widgetId: number,
      updater: WidgetUpdater,
      { showLoading = true, optimistic = false }: UpdateWidgetOptions = {}
    ) => {
      if (removingWidgetIdsRef.current.has(widgetId)) {
        return;
      }

      const previousRequest =
        widgetUpdateQueueRef.current.get(widgetId) ?? Promise.resolve();

      const thisRequest = previousRequest
        .catch(() => undefined)
        .then(async () => {
          const current = latestWidgetsRef.current.find(
            (widget) => widget.generalParams.id === widgetId
          );
          if (!current) {
            return;
          }

          try {
            const widgetItem = updater(current);
            if (widgetItem === current) {
              return;
            }

            if (optimistic) {
              setActiveWidgets((prevWidgets) =>
                prevWidgets.map((widget) =>
                  widget.generalParams.id === widgetId ? widgetItem : widget
                )
              );
            }

            if (showLoading) {
              setAppLoading(true);
            }
            const resp: ApiResponse = await apiUpdateWidget(widgetItem);
            if (showLoading) {
              setAppLoading(false);
            }
            if (resp.error) {
              playSound(warningSoundUrl);
              handleOpenAlert(resp.error.message, 'error');
              return;
            }
            /* If response contains updated generalParams, update the widget state */
            if (resp?.data?.generalParams) {
              const updatedWidget = { ...widgetItem, ...resp.data };
              setActiveWidgets((prevWidgets) =>
                prevWidgets.map((widget) =>
                  widget.generalParams.id === widgetId ? updatedWidget : widget
                )
              );
            }
          } catch (error) {
            if (showLoading) {
              setAppLoading(false);
            }
            playSound(warningSoundUrl);
            handleOpenAlert(`Widget ${widgetId} failed to update`, 'error');
            console.error('Error:', error);
          }
        });

      widgetUpdateQueueRef.current.set(widgetId, thisRequest);
      await thisRequest;
      if (widgetUpdateQueueRef.current.get(widgetId) === thisRequest) {
        widgetUpdateQueueRef.current.delete(widgetId);
      }
    },
    [handleOpenAlert, setAppLoading, setActiveWidgets]
  );

  /* Lists all currently active widgets and their parameter values. */
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

  /* Adds a new widget to the active widget state */
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
        /* Use the complete widget returned by the backend when available */
        if (resp?.data?.generalParams?.id != null) {
          const addedWidget = resp.data as Widget;
          /* Preserve existing widget objects and avoid adding the same ID twice */
          setActiveWidgets((currentWidgets) => {
            const alreadyExists = currentWidgets.some(
              (widget) =>
                widget.generalParams.id === addedWidget.generalParams.id
            );
            return alreadyExists
              ? currentWidgets
              : [...currentWidgets, addedWidget];
          });
        } else {
          /* Fall back to a full refresh for incomplete backend responses */
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
    [
      currentChannel,
      handleOpenAlert,
      listWidgets,
      setAppLoading,
      setActiveWidgets
    ]
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
        /* Use the complete widget returned by the backend when available */
        if (resp?.data?.generalParams?.id != null) {
          const addedWidget = resp.data as Widget;
          /* Preserve existing widget objects and avoid adding the same ID twice */
          setActiveWidgets((currentWidgets) => {
            const alreadyExists = currentWidgets.some(
              (widget) =>
                widget.generalParams.id === addedWidget.generalParams.id
            );
            return alreadyExists
              ? currentWidgets
              : [...currentWidgets, addedWidget];
          });
        } else {
          /* Fall back to a full refresh for incomplete backend responses */
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
    [listWidgets, handleOpenAlert, setAppLoading, setActiveWidgets]
  );

  /* Removes a specified widget */
  const removeWidget = useCallback(
    async (widgetID: number) => {
      removingWidgetIdsRef.current.add(widgetID);
      const pendingUpdate = widgetUpdateQueueRef.current.get(widgetID);
      if (pendingUpdate) {
        await pendingUpdate;
      }

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
      } finally {
        widgetUpdateQueueRef.current.delete(widgetID);
        removingWidgetIdsRef.current.delete(widgetID);
      }
    },
    [handleOpenAlert, setAppLoading]
  );

  /* Removes all currently active widgets */
  const removeAllWidgets = useCallback(async () => {
    const widgetIds = latestWidgetsRef.current.map(
      (widget) => widget.generalParams.id
    );
    widgetIds.forEach((id) => removingWidgetIdsRef.current.add(id));

    const pendingUpdates = widgetIds
      .map((id) => widgetUpdateQueueRef.current.get(id))
      .filter((request): request is Promise<void> => request !== undefined);
    if (pendingUpdates.length > 0) {
      await Promise.all(pendingUpdates);
    }

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
    } finally {
      widgetIds.forEach((id) => {
        widgetUpdateQueueRef.current.delete(id);
        removingWidgetIdsRef.current.delete(id);
      });
    }
    /* Refresh the active widget list after removing all */
    listWidgets();
    /* Reset dropdown state after all widgets are removed */
    setOpenWidgetId(null);
  }, [listWidgets, handleOpenAlert, setAppLoading]);

  /****************************************************************************/
  /* Provider */

  const dataValue: WidgetDataContextProps = useMemo(
    () => ({
      activeWidgets,
      widgetCapabilities,
      widgetSupported,
      selectedWidget
    }),
    [activeWidgets, widgetCapabilities, widgetSupported, selectedWidget]
  );

  const uiStateValue: WidgetUiStateContextProps = useMemo(
    () => ({
      activeDraggableWidget,
      openWidgetId
    }),
    [activeDraggableWidget, openWidgetId]
  );

  const uiSettersValue: WidgetUiSettersContextProps = useMemo(
    () => ({
      setActiveDraggableWidget,
      setOpenWidgetId,
      setSelectedWidget
    }),
    [setActiveDraggableWidget, setOpenWidgetId, setSelectedWidget]
  );

  const actionsValue: WidgetActionsContextProps = useMemo(
    () => ({
      setActiveWidgets,
      setWidgetCapabilities,
      setWidgetSupported,
      listWidgets,
      listWidgetCapabilities,
      addWidget,
      addCustomWidget,
      removeWidget,
      removeAllWidgets,
      updateWidget
    }),
    [
      setWidgetCapabilities,
      setWidgetSupported,
      listWidgets,
      listWidgetCapabilities,
      addWidget,
      addCustomWidget,
      removeWidget,
      removeAllWidgets,
      updateWidget
    ]
  );

  return (
    <WidgetActionsContext.Provider value={actionsValue}>
      <WidgetDataContext.Provider value={dataValue}>
        <WidgetUiSettersContext.Provider value={uiSettersValue}>
          <WidgetUiStateContext.Provider value={uiStateValue}>
            {children}
          </WidgetUiStateContext.Provider>
        </WidgetUiSettersContext.Provider>
      </WidgetDataContext.Provider>
    </WidgetActionsContext.Provider>
  );
};

function useRequiredWidgetContext<T>(
  context: React.Context<T | undefined>,
  name: string
): T {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used within a WidgetProvider`);
  }
  return value;
}

export const useWidgetData = (): WidgetDataContextProps =>
  useRequiredWidgetContext(WidgetDataContext, 'useWidgetData');

export const useWidgetUiSetters = (): WidgetUiSettersContextProps =>
  useRequiredWidgetContext(WidgetUiSettersContext, 'useWidgetUiSetters');

export const useWidgetUi = (): WidgetUiContextProps => {
  const state = useRequiredWidgetContext(WidgetUiStateContext, 'useWidgetUi');
  const setters = useWidgetUiSetters();
  return { ...state, ...setters };
};

export const useWidgetActions = (): WidgetActionsContextProps =>
  useRequiredWidgetContext(WidgetActionsContext, 'useWidgetActions');

export const useWidgetContext = (): WidgetContextProps => {
  const data = useWidgetData();
  const ui = useWidgetUi();
  const actions = useWidgetActions();
  return { ...data, ...ui, ...actions };
};
