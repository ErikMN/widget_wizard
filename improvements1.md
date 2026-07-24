# PERFORMANCE ISSUES

## The issue

Widgets work well when there is a hard upper backend limit of 15 widgets.
But we are supposed to have almost an infinit amount of widgets (at least several hundreds to start with).
And after just about 50 widgets the application becomes unusable and slow.
Widget bboxes are unmovable, the app eats A LOT of memory.

Why?

The browser is not struggling with **50 rectangles**. It is struggling because, in the current architecture, one widget means far more than one bbox.

At 50 widgets, Widget Wizard has mounted a large hidden editor tree, dozens of draggable components, many global listeners, and a context model that rerenders almost all of them whenever one widget changes.

## Primary cause: collapsed editors remain mounted

Every `WidgetItem` always renders its complete settings UI:

* `WidgetGeneralParams`
* `WidgetSpecificParams`
* `JsonEditor`
* its code editor
* dialogs, controls, icons, sliders, selects, and effects

They are placed inside MUI `Collapse`, but the collapses do not use `unmountOnExit`. Closing a row only hides its contents; it does not remove them from React or the DOM.

The nested widget-parameter and JSON collapses behave the same way.

That means 50 widgets produce 50 instances of the syntax-highlighted JSON code editor:

```tsx
<CodeEditor
  value={jsonInput}
  language="json"
  rehypePlugins={[[rehypePrism, { ignoreMissing: true }]]}
/>
```

They also produce 50 dynamically generated parameter forms. Each form walks the capability schema and creates MUI inputs for every supported parameter, even when that widget row has never been opened.

This is likely the biggest reason for the memory growth.

A collapsed widget row should ideally contain only its header. Its settings editor should not exist until the row is opened.

## Every widget stores and processes its own JSON copy

Each `WidgetItem` immediately creates a pretty-printed JSON string:

```tsx
const [jsonInput, setJsonInput] = useState<string>(
  JSON.stringify(widget, null, 2)
);
```

It then serializes, parses, modifies, and serializes the widget again whenever the widget object changes:

```tsx
const widgetCopy = safeParseJson(JSON.stringify(widget));
setJsonInput(JSON.stringify(widgetCopy, null, 2));
```

With many widgets, this creates:

* one additional JSON string per widget
* temporary serialization buffers
* parsed object copies
* syntax-highlighted representations inside the code editors

That work should happen lazily, when the user opens the JSON editor.

## Widget context updates invalidate almost the whole UI

`WidgetContext` contains all of these in one context:

* the complete widget array
* the active draggable widget
* the open widget ID
* selected widget type
* capabilities
* all API actions

Its provider value is also recreated on every provider render rather than being memoized:

```tsx
const value: WidgetContextProps = {
  activeDraggableWidget,
  activeWidgets,
  openWidgetId,
  // ...
};
```

Therefore, changing only:

```tsx
activeDraggableWidget.id
```

causes every component using `useWidgetContext()` to rerender, including:

* all `WidgetItem` components
* all `WidgetGeneralParams`
* all `WidgetSpecificParams`
* `WidgetHandler`
* `OverlaySurface`
* all widget bboxes

The `React.memo` around `WidgetBox` cannot protect it from context changes. `WidgetBox` itself consumes `WidgetContext`.

Additionally, `OverlaySurface` creates a new `registerRef` callback for every bbox on every render:

```tsx
registerRef={(el) => {
  if (el) {
    widgetRefs.current.set(widgetId, el);
  } else {
    widgetRefs.current.delete(widgetId);
  }
}}
```

That changing function prop also defeats `React.memo`.

## Dragging triggers global updates

At drag start, the bbox writes to shared context:

```tsx
setActiveDraggableWidget({
  id: widget.generalParams.id,
  active: true,
  // ...
});
```

That causes the large rerender fan-out described above.

At drag stop, the code:

1. Updates the entire `activeWidgets` array.

2. Calls the backend.

3. Changes the global loading state.

4. Updates `activeWidgets` again from the response.

5. Updates the active-draggable state.

`WidgetProvider` consumes the application-status context, even though it only needs `setAppLoading`. When `appLoading` changes, `WidgetProvider` rerenders and republishes its non-memoized widget context value.

So one drag can cause multiple full widget-tree render waves.

With 15 widgets this is difficult to notice. With 50 heavy widget editors and 50 bboxes, it becomes visible.

## Pointer movement also causes a render per event

During dragging, every mouse movement creates a fresh alignment-guide object:

```tsx
setAlignmentGuides({
  showVerticalCenter: flags.nearVerticalCenter,
  showHorizontalCenter: flags.nearHorizontalCenter,
  // ...
});
```

There is no equality check or `requestAnimationFrame` throttling. Even when the guide flags have not changed, React receives a new object and rerenders the dragged bbox.

This is only one bbox, but it runs on top of an already overloaded main thread.

## Every widget installs a global keyboard listener

Each individual `WidgetItem` runs:

```tsx
window.addEventListener('keydown', handleKeyDown);
```

At 50 widgets there are 50 window-level Delete-key listeners. Whenever the active widget ID changes, all 50 effects remove and reinstall their listeners because the ID is in the dependency array.

There should be one Delete-key handler in `WidgetHandler`, which looks up the selected widget.

## The list is neither lazy nor virtualized

All widget rows are rendered at once:

```tsx
activeWidgets
  .sort(...)
  .map((widget) => <WidgetItem ... />)
```

The `.sort()` also mutates the context-owned `activeWidgets` array directly. That is a correctness problem and adds repeated sorting work. It should at least be:

```tsx
[...activeWidgets].sort(...)
```

For hundreds of widgets, even lightweight headers should eventually be virtualized. But virtualization alone will not solve the current problem while every row contains a hidden code editor and parameter form.

## Recommended order of fixes

### 1. Lazily mount the settings editor

This is the highest-impact change:

```tsx
const isOpen = openWidgetId === widget.generalParams.id;

<Collapse in={isOpen} unmountOnExit>
  <WidgetEditor widget={widget} />
</Collapse>
```

Also use `unmountOnExit` for the nested parameter and JSON collapses, or conditionally render them:

```tsx
{jsonVisible && <CodeEditor ... />}
```

This should reduce memory dramatically because only one widget editor can currently be open.

### 2. Move JSON state into the lazily mounted editor

Do not create `jsonInput` for every widget header. Create it when the widget editor or JSON section opens.

### 3. Split the widget contexts

At minimum:

* `WidgetDataContext`: `activeWidgets`, capabilities
* `WidgetActionsContext`: add, remove, update
* `WidgetSelectionContext`: active ID, open ID

Then changing the active bbox will not rerender every settings form.

All provider values should be memoized.

### 4. Use one global keyboard handler

Remove the `keydown` effect from every `WidgetItem`. Handle Delete once in `WidgetHandler`.

### 5. Make inactive bboxes lightweight

Instead of 50 full `Draggable` instances, render ordinary bbox elements for inactive widgets and attach `Draggable` only to the active one. The inactive boxes only need pointer selection and basic styling.

### 6. Throttle drag-only visual work

Update alignment guides at most once per animation frame and skip state updates when the guide flags are unchanged.

### 7. Stabilize props and derived lists

Memoize:

* sorted widget list
* ref registration callbacks
* row components
* bbox bounds and style objects where useful

Also avoid calling `setDimensions` when the calculated dimensions have not actually changed. `VideoPlayer` currently always creates a new dimensions object, and `OverlaySurface` stores it again as `stableDimensions`, potentially producing additional bbox render passes.

## Bottom line

The old limit of 15 concealed an architectural scaling issue:

```text
One widget
  = one bbox
  + one Draggable
  + one full hidden form
  + one hidden syntax-highlighted editor
  + duplicated JSON state
  + several effects and timers
  + one global keyboard listener
```

Then shared context updates rerender nearly all of that when any one widget is selected or updated.

The first two changes, **unmounting closed editors** and **creating JSON editors lazily**, should produce the largest immediate improvement. Splitting the context is the next important step for making hundreds of widgets practical.

## How to fix

# Incremental performance plan for Widget Wizard

You can fix most of this without changing the app’s overall structure, backend API, routing, or user experience.

The work should be split into small commits. After each phase, test with 15, 50, and 100 widgets so you know which change delivered the improvement.

## Target architecture

Keep the existing model:

```text
WidgetProvider
  WidgetHandler
    WidgetItem[]
  OverlaySurface
    WidgetBox[]
```

But change the runtime behavior to:

```text
WidgetItem header x N
Widget editor x 0 or 1
JSON editor x 0 or 1
Global Delete listener x 1
Delete dialog x 1
WidgetBox x visible widgets
```

Currently, most of those expensive elements exist once per widget.

---

# Phase 1: Stop mounting closed widget editors

This is the highest-impact and lowest-risk change.

Currently, every `WidgetItem` renders:

* `WidgetGeneralParams`
* `WidgetSpecificParams`
* `JsonEditor`
* the syntax-highlighted `CodeEditor`
* a delete dialog
* many MUI inputs and icons

The outer `Collapse` only hides this tree. It does not remove it. The nested parameter and JSON collapses behave the same way.

## 1.1 Add `unmountOnExit` to the outer collapse

In `WidgetItem.tsx`, calculate the state once:

```tsx
const widgetId = widget.generalParams.id;
const isOpen = openWidgetId === widgetId;
```

Change:

```tsx
<Collapse in={openWidgetId === widget.generalParams.id}>
```

to:

```tsx
<Collapse in={isOpen} unmountOnExit>
```

That means closed rows retain only their header. Their settings controls, effects, timers, and editor DOM are removed.

The `WidgetItem` component itself remains mounted, so state declared directly inside `WidgetItem` can still be preserved.

## 1.2 Unmount widget-specific parameters when hidden

Change:

```tsx
<Collapse in={widgetParamsVisible}>
  <WidgetSpecificParams widget={widget} />
</Collapse>
```

to:

```tsx
<Collapse in={widgetParamsVisible} unmountOnExit>
  <WidgetSpecificParams widget={widget} />
</Collapse>
```

You can additionally conditionally render it:

```tsx
<Collapse in={widgetParamsVisible} unmountOnExit>
  {widgetParamsVisible && <WidgetSpecificParams widget={widget} />}
</Collapse>
```

The condition is not strictly required when `unmountOnExit` works correctly, but it makes the intended lifecycle explicit.

`WidgetSpecificParams` dynamically walks the complete parameter capability structure and creates MUI controls for each entry, so it is not something you want mounted 50 or 100 times while invisible.

## 1.3 Unmount the JSON editor when hidden

In `JsonEditor.tsx`, change:

```tsx
<Collapse in={jsonVisible}>
```

to:

```tsx
<Collapse in={jsonVisible} unmountOnExit>
```

The closed JSON editor currently retains the code editor and Prism-related rendering tree even while hidden.

Use:

```tsx
<Collapse in={jsonVisible} unmountOnExit>
  {jsonVisible && (
    <div>
      {/* Existing editor content */}
    </div>
  )}
</Collapse>
```

## 1.4 Defer JSON serialization until the widget is opened

Every widget currently creates and retains a formatted JSON string immediately:

```tsx
const [jsonInput, setJsonInput] = useState<string>(
  JSON.stringify(widget, null, 2)
);
```

Every changed widget is then serialized, parsed, copied, modified, and serialized again.

Change the initial value:

```tsx
const [jsonInput, setJsonInput] = useState('');
```

Then only generate it when the row opens:

```tsx
useEffect(() => {
  if (!isOpen) {
    return;
  }

  const widgetCopy = safeParseJson(JSON.stringify(widget));
  if (widgetCopy == null) {
    return;
  }

  if (widgetCopy.generalParams?.id != null) {
    delete widgetCopy.generalParams.id;
  }

  setWidgetState((prevState) => ({
    ...prevState,
    widgetId: widget.generalParams.id
  }));

  setJsonInput(JSON.stringify(widgetCopy, null, 2));
  setJsonError(null);
}, [isOpen, widget]);
```

This avoids generating and retaining large strings for widgets the user has never opened.

## 1.5 Remove unused parsed JSON state

`WidgetItem` declares:

```tsx
const [parsedJSON, setParsedJSON] = useState<any | null>(null);
```

But only the setter appears to be passed to `JsonEditor`; the value itself is not consumed.

Remove:

```tsx
const [parsedJSON, setParsedJSON] = useState<any | null>(null);
```

and remove:

```tsx
onParseJson={setParsedJSON}
```

unless there is planned functionality that needs it.

### Expected result from Phase 1

After this phase, 50 closed widgets should contain roughly:

```text
50 lightweight headers
0 WidgetGeneralParams
0 WidgetSpecificParams
0 CodeEditor instances
0 ReactJson trees
```

Only the opened widget has the editor tree.

---

# Phase 2: Replace per-widget global listeners and dialogs

Every `WidgetItem` currently adds its own `window.keydown` listener. At 50 widgets, that means 50 global listeners. They are also removed and re-added whenever the active widget ID changes.

Each widget also owns its own delete dialog.

Move both responsibilities to `WidgetHandler`.

## 2.1 Add one pending-delete state

In `WidgetHandler.tsx`:

```tsx
const [pendingDeleteWidgetId, setPendingDeleteWidgetId] =
  useState<number | null>(null);
```

## 2.2 Handle Delete once

Add one global effect in `WidgetHandler`:

```tsx
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;

    const isTyping =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    if (isTyping) {
      return;
    }

    // Shift + Delete is already used for remove-all.
    if (event.shiftKey || event.key !== 'Delete') {
      return;
    }

    const widgetId = activeDraggableWidget.id;
    if (widgetId == null) {
      return;
    }

    setPendingDeleteWidgetId(widgetId);
  };

  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}, [activeDraggableWidget.id]);
```

You already have a handler for Shift+Delete in `WidgetHandler`, so these can eventually be merged into one keyboard effect.

## 2.3 Pass a remove-request callback to each item

Update `WidgetItemProps`:

```tsx
interface WidgetItemProps {
  widget: Widget;
  toggleDropdown: (id: number) => void;
  onBackupRequested: () => void;
  onRemoveRequested: (id: number) => void;
}
```

Inside `WidgetItem`:

```tsx
const handleRemoveClick = () => {
  playSound(messageSoundUrl);
  onRemoveRequested(widget.generalParams.id);
};
```

Remove from every `WidgetItem`:

* `openDialog`
* `setOpenDialog`
* the `keydown` effect
* the complete delete `Dialog`
* local delete-confirmation handlers

## 2.4 Render one delete dialog in `WidgetHandler`

```tsx
<Dialog
  open={pendingDeleteWidgetId != null}
  onClose={(_, reason) => {
    if (reason !== 'backdropClick') {
      setPendingDeleteWidgetId(null);
    }
  }}
>
  <DialogTitle>Remove widget</DialogTitle>

  <DialogContent>
    <DialogContentText>
      Are you sure you want to remove widget {pendingDeleteWidgetId}?
      This action cannot be undone.
    </DialogContentText>
  </DialogContent>

  <DialogActions>
    <CustomButton
      variant="outlined"
      onClick={() => setPendingDeleteWidgetId(null)}
    >
      No
    </CustomButton>

    <CustomButton
      variant="contained"
      color="error"
      onClick={() => {
        if (pendingDeleteWidgetId != null) {
          void removeWidget(pendingDeleteWidgetId);
        }
        setPendingDeleteWidgetId(null);
      }}
    >
      Yes
    </CustomButton>
  </DialogActions>
</Dialog>
```

You now have a constant number of keyboard listeners and dialogs regardless of widget count.

---

# Phase 3: Stop repeated localStorage work

Every `WidgetItem` currently runs:

```tsx
const backupCount = loadWidgetBackups().length;
```

That means localStorage is read and parsed once per widget every time the list rerenders.

At 100 widgets, one render can parse the same backup data 100 times.

## 3.1 Calculate backup state once in `WidgetHandler`

You already have:

```tsx
const [backupList, setBackupList] = useState(loadWidgetBackups());
```

Add:

```tsx
const backupLimitReached = backupList.length >= MAX_LS_BACKUPS;
```

Pass it to every row:

```tsx
<WidgetItem
  widget={widget}
  backupLimitReached={backupLimitReached}
  onBackupRequested={handleBackupRequested}
/>
```

Add one stable callback:

```tsx
const handleBackupRequested = useCallback(() => {
  setBackupList(loadWidgetBackups());
}, []);
```

Do not use this inline callback:

```tsx
onBackupRequested={() => setBackupList(loadWidgetBackups())}
```

because it creates a new function for every widget on every render.

## 3.2 Update `WidgetItem`

Add:

```tsx
backupLimitReached: boolean;
```

Replace:

```tsx
disabled={backupCount >= MAX_LS_BACKUPS}
```

with:

```tsx
disabled={backupLimitReached}
```

Remove `loadWidgetBackups` and `MAX_LS_BACKUPS` from `WidgetItem` if they are no longer used there.

---

# Phase 4: Make the widget list memo-friendly

## 4.1 Do not mutate `activeWidgets` while sorting

The current list does:

```tsx
activeWidgets.sort(...).map(...)
```

`Array.sort()` changes the original array. In this case, that array belongs to context state.

Create a derived list:

```tsx
const sortedWidgets = useMemo(() => {
  return [...activeWidgets].sort((a, b) => {
    let result = 0;

    switch (appSettings.sortBy) {
      case 'id':
        result = a.generalParams.id - b.generalParams.id;
        break;

      case 'type':
        result = a.generalParams.type.localeCompare(
          b.generalParams.type
        );
        break;
    }

    return appSettings.sortAscending ? result : -result;
  });
}, [
  activeWidgets,
  appSettings.sortBy,
  appSettings.sortAscending
]);
```

Then:

```tsx
{sortedWidgets.map((widget) => (
  // ...
))}
```

## 4.2 Memoize `WidgetItem`

Change the export:

```tsx
export default React.memo(WidgetItem);
```

However, `React.memo` is not enough while `WidgetItem` consumes changing context values such as `openWidgetId` and `activeDraggableWidget`. Context updates bypass prop memoization.

For memoization to be useful, pass the relevant primitive state as props.

Change the item props to include:

```tsx
interface WidgetItemProps {
  widget: Widget;
  isOpen: boolean;
  isActive: boolean;
  backupLimitReached: boolean;
  onToggle: (widget: Widget, isOpen: boolean) => void;
  onRemoveRequested: (id: number) => void;
  onBackupRequested: () => void;
}
```

In `WidgetHandler`:

```tsx
<WidgetItem
  key={widget.generalParams.id}
  widget={widget}
  isOpen={openWidgetId === widget.generalParams.id}
  isActive={
    activeDraggableWidget.id === widget.generalParams.id &&
    activeDraggableWidget.active
  }
  backupLimitReached={backupLimitReached}
  onToggle={handleToggleWidget}
  onRemoveRequested={setPendingDeleteWidgetId}
  onBackupRequested={handleBackupRequested}
/>
```

Inside `WidgetItem`, remove these from `useWidgetContext()`:

```tsx
openWidgetId
setOpenWidgetId
activeDraggableWidget
```

Use `isOpen` and `isActive` instead.

This allows an active-widget change to rerender only:

* the previously active row
* the newly active row

instead of all rows.

## 4.3 Stabilize the toggle callback

The current `toggleDropdown` depends on `openWidgetId` and `activeWidgets`, so its function identity changes frequently.

Use:

```tsx
const handleToggleWidget = useCallback(
  (widget: Widget, isOpen: boolean) => {
    const newId = isOpen ? null : widget.generalParams.id;

    setActiveDraggableWidget({
      id: newId,
      active: false,
      highlight: false,
      clickBBox: false
    });

    setOpenWidgetId(newId);

    if (appSettings.widgetAutoBringFront && !isOpen) {
      setDepth('front', widget);
    }
  },
  [
    setActiveDraggableWidget,
    setOpenWidgetId,
    appSettings.widgetAutoBringFront,
    setDepth
  ]
);
```

The callback no longer needs to search `activeWidgets`, because the selected widget object is supplied directly.

---

# Phase 5: Memoize the widget context provider

`WidgetContext` currently creates a new provider value object every time `WidgetProvider` renders.

Wrap it in `useMemo`.

First import it:

```tsx
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo
} from 'react';
```

Then:

```tsx
const value = useMemo<WidgetContextProps>(
  () => ({
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
  }),
  [
    activeDraggableWidget,
    activeWidgets,
    widgetCapabilities,
    widgetSupported,
    selectedWidget,
    openWidgetId,
    listWidgets,
    listWidgetCapabilities,
    addWidget,
    addCustomWidget,
    removeWidget,
    removeAllWidgets,
    updateWidget
  ]
);
```

React state setters do not have to be included because their identities are stable, though including them is harmless.

This does not prevent rerenders when widget state genuinely changes. It prevents widget-context propagation when `WidgetProvider` rerenders because of an unrelated parent context.

---

# Phase 6: Split the large widget context

This is the largest recommended change, but it is still an incremental refactor contained mostly inside `WidgetContext.tsx`.

The current context mixes:

* widget data
* selected/open UI state
* drag UI state
* API operations

A change to any one value republishes the entire context.

Create three contexts in the same file.

## 6.1 Data context

```tsx
interface WidgetDataContextProps {
  activeWidgets: Widget[];
  widgetCapabilities: WidgetCapabilities | null;
  widgetSupported: boolean;
  selectedWidget: string;
}

const WidgetDataContext =
  createContext<WidgetDataContextProps | undefined>(undefined);
```

## 6.2 UI context

```tsx
interface WidgetUiContextProps {
  activeDraggableWidget: ActiveDraggableWidget;
  setActiveDraggableWidget: React.Dispatch<
    React.SetStateAction<ActiveDraggableWidget>
  >;
  openWidgetId: number | null;
  setOpenWidgetId: React.Dispatch<React.SetStateAction<number | null>>;
  setSelectedWidget: React.Dispatch<React.SetStateAction<string>>;
}

const WidgetUiContext =
  createContext<WidgetUiContextProps | undefined>(undefined);
```

## 6.3 Actions context

```tsx
interface WidgetActionsContextProps {
  setActiveWidgets: React.Dispatch<React.SetStateAction<Widget[]>>;
  listWidgets: () => Promise<void>;
  listWidgetCapabilities: () => Promise<void>;
  addWidget: (type: string) => Promise<void>;
  addCustomWidget: (widget: Widget) => Promise<void>;
  removeWidget: (id: number) => Promise<void>;
  removeAllWidgets: () => Promise<void>;
  updateWidget: (widget: Widget) => Promise<void>;
}

const WidgetActionsContext =
  createContext<WidgetActionsContextProps | undefined>(undefined);
```

Memoize each value independently:

```tsx
const dataValue = useMemo(
  () => ({
    activeWidgets,
    widgetCapabilities,
    widgetSupported,
    selectedWidget
  }),
  [
    activeWidgets,
    widgetCapabilities,
    widgetSupported,
    selectedWidget
  ]
);

const uiValue = useMemo(
  () => ({
    activeDraggableWidget,
    setActiveDraggableWidget,
    openWidgetId,
    setOpenWidgetId,
    setSelectedWidget
  }),
  [activeDraggableWidget, openWidgetId]
);

const actionsValue = useMemo(
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
```

Nest the providers:

```tsx
return (
  <WidgetActionsContext.Provider value={actionsValue}>
    <WidgetDataContext.Provider value={dataValue}>
      <WidgetUiContext.Provider value={uiValue}>
        {children}
      </WidgetUiContext.Provider>
    </WidgetDataContext.Provider>
  </WidgetActionsContext.Provider>
);
```

Expose hooks:

```tsx
export const useWidgetData = () =>
  useRequiredWidgetContext(WidgetDataContext, 'WidgetDataContext');

export const useWidgetUi = () =>
  useRequiredWidgetContext(WidgetUiContext, 'WidgetUiContext');

export const useWidgetActions = () =>
  useRequiredWidgetContext(WidgetActionsContext, 'WidgetActionsContext');
```

You can keep `useWidgetContext()` temporarily while migrating one component at a time.

Suggested migration order:

1. `WidgetInfo` uses data and actions.
2. `WidgetSpecificParams` uses data and actions.
3. `WidgetGeneralParams` uses actions and UI.
4. `WidgetHandler` uses all three.
5. `OverlaySurface` uses data and UI.
6. `WidgetBox` should ultimately receive UI primitives as props.

---

# Phase 7: Prevent all bboxes from rerendering together

`WidgetBox` is wrapped in `React.memo`, but it consumes the combined widget context directly. Therefore a changed active widget still rerenders every bbox.

The best incremental solution is to let `OverlaySurface` read the active state and pass only primitive values to each bbox.

## 7.1 Add primitive bbox props

```tsx
interface WidgetBoxProps {
  widget: Widget;
  dimensions: Dimensions;
  isActive: boolean;
  isHighlighted: boolean;
  isOpen: boolean;
  registerRef?: (id: number, el: HTMLElement | null) => void;
}
```

Render:

```tsx
<WidgetBox
  key={widgetId}
  widget={widget}
  dimensions={surfaceDimensions}
  isActive={activeDraggableWidget.id === widgetId}
  isHighlighted={
    activeDraggableWidget.id === widgetId &&
    activeDraggableWidget.highlight
  }
  isOpen={openWidgetId === widgetId}
  registerRef={registerWidgetRef}
/>
```

Unchanged bboxes then receive identical primitive props.

## 7.2 Stabilize ref registration

`OverlaySurface` currently creates a new `registerRef` callback for every widget during every render.

Replace it with one callback:

```tsx
const registerWidgetRef = useCallback(
  (widgetId: number, el: HTMLElement | null) => {
    if (el) {
      widgetRefs.current.set(widgetId, el);
    } else {
      widgetRefs.current.delete(widgetId);
    }
  },
  []
);
```

Inside `WidgetBox`:

```tsx
ref={(el) => {
  const element = el as HTMLElement | null;
  nodeRef.current = element;
  registerRef?.(widget.generalParams.id, element);
}}
```

Now `registerRef` has the same identity for every bbox and render.

## 7.3 Remove the changing `Draggable` key

The bbox currently uses:

```tsx
key={`${widget.generalParams.id}-${x}-${y}`}
```

on `Draggable`. This forces the draggable component to unmount and remount whenever its calculated position changes.

Remove the key entirely:

```tsx
<Draggable
  nodeRef={nodeRef as React.RefObject<HTMLElement>}
  position={{ x, y }}
  // ...
>
```

`WidgetBox` is already keyed by widget ID in the parent list.

## 7.4 Consider removing the per-bbox `Fade`

Every bbox is wrapped in a permanent `Fade` transition.

For a large widget count, replace:

```tsx
<Fade in={true} timeout={500}>
  <div>{/* bbox */}</div>
</Fade>
```

with:

```tsx
<div>{/* bbox */}</div>
```

This is not likely the main bottleneck, but it reduces component and transition overhead.

---

# Phase 8: Avoid redundant alignment-guide renders

During dragging, the active bbox creates a new alignment-guide object for every pointer event.

Even when all booleans are unchanged, this is a new object:

```tsx
setAlignmentGuides({
  showVerticalCenter: false,
  showHorizontalCenter: false,
  showTop: false,
  showBottom: false,
  showLeft: false,
  showRight: false
});
```

Use an equality check.

```tsx
type AlignmentGuides = {
  showVerticalCenter: boolean;
  showHorizontalCenter: boolean;
  showTop: boolean;
  showBottom: boolean;
  showLeft: boolean;
  showRight: boolean;
};

const guidesEqual = (
  left: AlignmentGuides,
  right: AlignmentGuides
): boolean =>
  left.showVerticalCenter === right.showVerticalCenter &&
  left.showHorizontalCenter === right.showHorizontalCenter &&
  left.showTop === right.showTop &&
  left.showBottom === right.showBottom &&
  left.showLeft === right.showLeft &&
  left.showRight === right.showRight;
```

Create a helper:

```tsx
const updateAlignmentGuides = useCallback(
  (next: AlignmentGuides) => {
    setAlignmentGuides((current) =>
      guidesEqual(current, next) ? current : next
    );
  },
  []
);
```

Replace all direct calls with:

```tsx
updateAlignmentGuides({
  showVerticalCenter: flags.nearVerticalCenter,
  showHorizontalCenter: flags.nearHorizontalCenter,
  showTop: flags.nearTop || flags.nearTopCenter,
  showBottom: flags.nearBottom || flags.nearBottomCenter,
  showLeft: flags.nearLeft || flags.nearCenterLeft,
  showRight: flags.nearRight || flags.nearCenterRight
});
```

If pointer movement still generates too much work, schedule guide updates through `requestAnimationFrame` so they occur at most once per rendered frame.

---

# Phase 9: Clean up debounced widget updates

`WidgetSpecificParams` creates a lodash debounced function and stores it for the component lifetime.

Once you start unmounting closed editors, make sure pending work is cleaned up:

```tsx
useEffect(() => {
  return () => {
    debouncedUpdate.cancel();
  };
}, [debouncedUpdate]);
```

There is a UX decision here:

* `cancel()` prevents a stale update after closing or removing a widget.
* `flush()` immediately sends a pending update when the editor closes.

For widget removal, `cancel()` is safer. For closing an editor, you may prefer to explicitly flush before toggling the section closed.

Also consider adding “dirty” guards to `WidgetGeneralParams`. Its effects should call `updateWidget` only after actual user input, not because a prop or local state was synchronized. The current `isReady` mechanism is fragile and the effect combines three unrelated fields.

A simple pattern is:

```tsx
const datasourceDirtyRef = useRef(false);

const handleDatasourceChange = (
  event: React.ChangeEvent<HTMLInputElement>
) => {
  datasourceDirtyRef.current = true;

  setWidgetState((current) => ({
    ...current,
    datasource: event.target.value
  }));
};

useEffect(() => {
  if (!datasourceDirtyRef.current) {
    return;
  }

  datasourceDirtyRef.current = false;

  void updateWidget({
    ...widget,
    generalParams: {
      ...widget.generalParams,
      datasource: debouncedDatasource
    }
  });
}, [debouncedDatasource, widget, updateWidget]);
```

Use separate effects or debounced callbacks for datasource, channel, and update time.

---

# Phase 10: Avoid redundant dimension broadcasts

`VideoPlayer` currently creates a new dimensions object whenever `logVideoDimensions()` runs, even if all six values are identical.

Because every bbox receives `dimensions`, a redundant dimensions update can rerender every bbox.

Change:

```tsx
setDimensions({
  videoWidth,
  videoHeight,
  pixelWidth,
  pixelHeight,
  offsetX,
  offsetY
});
```

to:

```tsx
const nextDimensions: Dimensions = {
  videoWidth,
  videoHeight,
  pixelWidth,
  pixelHeight,
  offsetX,
  offsetY
};

setDimensions((current) => {
  const unchanged =
    current.videoWidth === nextDimensions.videoWidth &&
    current.videoHeight === nextDimensions.videoHeight &&
    current.pixelWidth === nextDimensions.pixelWidth &&
    current.pixelHeight === nextDimensions.pixelHeight &&
    current.offsetX === nextDimensions.offsetX &&
    current.offsetY === nextDimensions.offsetY;

  return unchanged ? current : nextDimensions;
});
```

For subpixel values, use a small tolerance:

```tsx
const nearlyEqual = (a: number, b: number) =>
  Math.abs(a - b) < 0.01;
```

This prevents ResizeObserver callbacks that report unchanged geometry from propagating through every bbox.

---

# Phase 11: Make interactive updates less global

`updateWidget()` currently toggles the global application-loading state and updates the full widget array after the backend response. Dragging already performs an optimistic local array update before calling it.

Add options:

```tsx
interface UpdateWidgetOptions {
  showLoading?: boolean;
  optimistic?: boolean;
}
```

Change the context signature:

```tsx
updateWidget: (
  widgetItem: Widget,
  options?: UpdateWidgetOptions
) => Promise<void>;
```

Implementation outline:

```tsx
const updateWidget = useCallback(
  async (
    widgetItem: Widget,
    {
      showLoading = true,
      optimistic = false
    }: UpdateWidgetOptions = {}
  ) => {
    if (optimistic) {
      setActiveWidgets((current) =>
        current.map((widget) =>
          widget.generalParams.id === widgetItem.generalParams.id
            ? widgetItem
            : widget
        )
      );
    }

    try {
      if (showLoading) {
        setAppLoading(true);
      }

      const response = await apiUpdateWidget(widgetItem);

      if (response.error) {
        handleOpenAlert(response.error.message, 'error');
        return;
      }

      if (response.data?.generalParams) {
        const updatedId = response.data.generalParams.id;

        setActiveWidgets((current) =>
          current.map((widget) =>
            widget.generalParams.id === updatedId
              ? { ...widget, ...response.data }
              : widget
          )
        );
      }
    } finally {
      if (showLoading) {
        setAppLoading(false);
      }
    }
  },
  [handleOpenAlert, setAppLoading]
);
```

From bbox drag stop:

```tsx
void updateWidget(updatedWidget, {
  optimistic: true,
  showLoading: false
});
```

Then remove the separate `setActiveWidgets()` call from `WidgetBBox`.

That gives one centralized update path and prevents the global loading UI from changing for routine drag operations.

---

# Phase 12: Virtualize only after the previous changes

After the earlier changes, each closed row should be relatively lightweight. That may already make 100–300 widgets acceptable.

For much larger lists, the widget sidebar will still have one DOM row per widget. At that point, add list virtualization.

Because only one widget can be expanded at a time, two approaches work:

1. Virtualize the collapsed headers and render the selected widget editor separately below the list.
2. Use a variable-height virtual list and recalculate the open row when `openWidgetId` changes.

The first approach is simpler and more reliable, but it changes the visual layout slightly. Do not begin with virtualization. It can hide the existing mounting problem without solving the memory use caused by invisible editors.

As a smaller temporary enhancement, add:

```tsx
sx={{
  contentVisibility: 'auto',
  containIntrinsicSize: '56px'
}}
```

to closed row containers. This can reduce off-screen rendering work, but it does not unmount components or reduce retained React state.

---

# Recommended commit sequence

## Commit 1: Lazy widget editors

Files:

```text
WidgetItem.tsx
JsonEditor.tsx
WidgetSpecificParams.tsx
```

Changes:

* outer `Collapse` uses `unmountOnExit`
* parameter collapse uses `unmountOnExit`
* JSON collapse uses `unmountOnExit`
* JSON is generated only when opened
* debounce cleanup
* remove unused parsed JSON state

This should give the largest immediate memory reduction.

## Commit 2: Centralize item-wide resources

Files:

```text
WidgetHandler.tsx
WidgetItem.tsx
```

Changes:

* one Delete listener
* one delete confirmation dialog
* one backup count calculation
* stable backup callback
* remove per-item listeners and dialogs

## Commit 3: Cheap list rerenders

Files:

```text
WidgetHandler.tsx
WidgetItem.tsx
WidgetContext.tsx
```

Changes:

* copy before sorting
* memoized sorted list
* `React.memo(WidgetItem)`
* pass `isOpen` and `isActive`
* memoize provider value
* stabilize callbacks

## Commit 4: Bbox render isolation

Files:

```text
OverlaySurface.tsx
WidgetBBox.tsx
VideoPlayer.tsx
```

Changes:

* stable ref-registration callback
* pass primitive active state
* remove changing `Draggable` key
* avoid unchanged dimensions updates
* optionally remove `Fade`

## Commit 5: Drag-path optimization

Files:

```text
WidgetBBox.tsx
WidgetContext.tsx
```

Changes:

* skip unchanged alignment-guide state
* optional animation-frame throttling
* silent interactive updates
* centralize optimistic state updates

## Commit 6: Split contexts

Files:

```text
WidgetContext.tsx
WidgetHandler.tsx
WidgetItem.tsx
WidgetGeneralParams.tsx
WidgetSpecificParams.tsx
WidgetBBox.tsx
OverlaySurface.tsx
WidgetInfo.tsx
```

Migrate one consumer at a time. The old combined hook can remain temporarily until all consumers are moved.

---

# How to verify each phase

Use the same scenario every time:

1. Start a production build.
2. Load 15 widgets and record a baseline.
3. Load 50 widgets.
4. Drag one bbox continuously for several seconds.
5. Open and close several widget rows.
6. Repeat with 100 widgets.

Measure:

* browser heap after garbage collection
* DOM node count
* number of global `keydown` listeners
* React commit duration
* number of components rendered when selecting one bbox
* long tasks during drag
* FPS or visible pointer lag

The desired behavior after the main changes is:

```text
Opening one widget:
  mounts one editor tree

Closing one widget:
  unmounts that editor tree

Selecting one bbox:
  rerenders the old and new active rows/bboxes

Dragging:
  rerenders primarily the active bbox

Adding widget 101:
  adds one header and one bbox
  not another hidden code editor and full parameter form
```

The highest-priority combination is **lazy editor mounting, one global delete handler, memoized rows, stable bbox props, and unchanged-dimension suppression**. Those changes preserve the application’s existing behavior while removing most of the work that currently scales linearly with every widget.

## End notes

We should fix as many issues as possible without changing the behaviour of the app (as little as possible).
We should split each fix into a human reviewable commit which clearly explains what and why was changed.
Use no jargon or overcomplications. No emdashes or other weird characters.

