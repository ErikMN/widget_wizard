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

/* Options for updateWidget, allowing callers (e.g. drag operations) to skip
 * the global loading indicator and apply an optimistic local update before
 * the backend response arrives. */
interface UpdateWidgetOptions {
  showLoading?: boolean;
  optimistic?: boolean;
}

/* Builds the next widget from the latest known widget. Return the same
 * widget to send nothing. */
type WidgetUpdater = (current: Widget) => Widget;

/* Interfaces defining the three split context slices.
 * Splitting the previously-monolithic context means a component that only
 * reads e.g. actions (stable callbacks) will not rerender just because
 * activeWidgets or UI selection state changed elsewhere.
 */

/* Widget data: the widget list and capability/support info. Changes whenever
 * widgets are added, removed, updated, or capabilities are (re)loaded. */
interface WidgetDataContextProps {
  activeWidgets: Widget[];
  widgetCapabilities: WidgetCapabilities | null;
  widgetSupported: boolean;
  selectedWidget: string;
}

/* Widget UI selection/drag state. Changes on hover/select/drag, independent
 * of the widget data itself. */
interface WidgetUiStateContextProps {
  activeDraggableWidget: {
    id: number | null;
    active: boolean;
    clickBBox: boolean;
    highlight: boolean;
  };
  openWidgetId: number | null;
}

/* Widget UI setters. `useState` setters keep a stable identity for the
 * lifetime of the component, so this context value never changes across
 * renders. Consumers that only need to *write* UI state (e.g. `WidgetBox`,
 * which receives its own active/open status as primitive props instead)
 * can subscribe to just this context and never rerender because of other
 * widgets' active/open state changing.
 */
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

type WidgetUiContextProps = WidgetUiStateContextProps &
  WidgetUiSettersContextProps;

/* Widget operations. Stable callback identities that do not change when
 * widget data or UI selection state changes. */
interface WidgetActionsContextProps {
  setActiveWidgets: React.Dispatch<React.SetStateAction<Widget[]>>;
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

/* Combined shape, used only by the backward-compatible useWidgetContext(). */
type WidgetContextProps = WidgetDataContextProps &
  WidgetUiContextProps &
  WidgetActionsContextProps;

/* The three split contexts, plus a dedicated setters-only UI context */
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

  /* Latest widget list, kept in sync with activeWidgets so a queued
   * update can read the current widget instead of an old prop value. */
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

  /* One request chain per widget id, so updates for the same widget run
   * in call order. Updates for different widgets run independently. */
  const widgetUpdateQueueRef = useRef<Map<number, Promise<void>>>(new Map());

  /* Widget ids currently being removed. A new update is rejected once its
   * widget id is in this set. */
  const removingWidgetIdsRef = useRef<Set<number>>(new Set());

  /****************************************************************************/
  /* Widget endpoint communication functions */

  /* Updates a widget. The updater receives the latest known widget and
   * returns the widget to send. Return the same widget to send nothing. */
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

      const thisRequest = previousRequest.then(async () => {
        const current = latestWidgetsRef.current.find(
          (widget) => widget.generalParams.id === widgetId
        );
        if (!current) {
          return;
        }

        const widgetItem = updater(current);
        if (widgetItem === current) {
          return;
        }

        if (optimistic) {
          /* Apply the change locally right away, e.g. for drag operations,
           * so the UI doesn't wait on a round-trip to the backend. */
          setActiveWidgets((prevWidgets) =>
            prevWidgets.map((widget) =>
              widget.generalParams.id === widgetId ? widgetItem : widget
            )
          );
        }

        try {
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
      /* Mark as removing first, so no new update for this widget can be
       * queued while we wait below. */
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
    /* Mark every widget as removing first, so no new update can be
     * queued while we wait below. */
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
      /* Refresh the active widget list after removing all */
      listWidgets();
      /* Reset dropdown state after all widgets are removed */
      setOpenWidgetId(null);
    }
  }, [listWidgets, handleOpenAlert, setAppLoading]);

  /****************************************************************************/
  /* Provider */

  /* Memoize each context slice independently so a component subscribed to
   * only one slice (e.g. actions) doesn't rerender when another slice (e.g.
   * activeWidgets) changes.
   */
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

  /* Setter identities are stable (guaranteed by useState), so this value
   * never changes across renders and consumers of it alone never rerender
   * due to UI state changes. */
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
      listWidgets,
      listWidgetCapabilities,
      addWidget,
      addCustomWidget,
      removeWidget,
      removeAllWidgets,
      updateWidget
    }),
    [
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

/* Generic helper for reading one of the split contexts with a clear error
 * message if used outside the provider tree. */
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

/* Widget data: activeWidgets, capabilities, support flag, selected type */
export const useWidgetData = (): WidgetDataContextProps =>
  useRequiredWidgetContext(WidgetDataContext, 'useWidgetData');

/* Widget UI setters only. Reference-stable across renders, so prefer this
 * over useWidgetUi() for components (e.g. WidgetBox) that only dispatch UI
 * state changes and receive their own current state as props instead.
 */
export const useWidgetUiSetters = (): WidgetUiSettersContextProps =>
  useRequiredWidgetContext(WidgetUiSettersContext, 'useWidgetUiSetters');

/* Widget UI selection/drag state, combined with the setters. Rerenders
 * whenever activeDraggableWidget or openWidgetId changes anywhere.
 */
export const useWidgetUi = (): WidgetUiContextProps => {
  const state = useRequiredWidgetContext(WidgetUiStateContext, 'useWidgetUi');
  const setters = useWidgetUiSetters();
  return { ...state, ...setters };
};

/* Widget operations (add/remove/update/list) */
export const useWidgetActions = (): WidgetActionsContextProps =>
  useRequiredWidgetContext(WidgetActionsContext, 'useWidgetActions');

/* Backward-compatible combined hook. Prefer useWidgetData / useWidgetUi /
 * useWidgetActions in new or migrated code, since this pulls in all three
 * slices, so a consumer using it rerenders whenever any of them changes.
 */
export const useWidgetContext = (): WidgetContextProps => {
  const data = useWidgetData();
  const ui = useWidgetUi();
  const actions = useWidgetActions();
  return { ...data, ...ui, ...actions };
};
