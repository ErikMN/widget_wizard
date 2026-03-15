/* DrawContext
 *
 * Shared state for draw mode.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Dimensions } from '../appInterface';
import { useAlertActionsContext } from '../context/AppContext';
import { loadIndexedDbDrawState, saveIndexedDbDrawState } from './drawStorage';
import { DrawStroke, DrawTool } from './drawInterfaces';
import {
  DEFAULT_BRUSH_SIZE,
  DEFAULT_DRAW_COLOR,
  renderDrawStrokes
} from './drawUtils';

interface DrawContextProps {
  strokes: DrawStroke[];
  activeTool: DrawTool;
  setActiveTool: React.Dispatch<React.SetStateAction<DrawTool>>;
  brushColor: string;
  setBrushColor: React.Dispatch<React.SetStateAction<string>>;
  brushSize: number;
  setBrushSize: React.Dispatch<React.SetStateAction<number>>;
  surfaceDimensions: Dimensions | null;
  setSurfaceDimensions: React.Dispatch<React.SetStateAction<Dimensions | null>>;
  registerDraftController: (controller: DrawDraftController | null) => void;
  addStroke: (stroke: DrawStroke) => void;
  clearDrawing: () => void;
  saveDrawingAsPng: () => Promise<void>;
  hasDrawing: boolean;
}

const DrawContext = createContext<DrawContextProps | undefined>(undefined);

interface DrawStorageState {
  strokes: DrawStroke[];
  activeTool: DrawTool;
  brushColor: string;
  brushSize: number;
}

interface DrawDraftController {
  hasDraft: () => boolean;
  discardDraft: () => void;
}

const DEFAULT_DRAW_STORAGE_STATE: DrawStorageState = {
  strokes: [],
  activeTool: 'brush',
  brushColor: DEFAULT_DRAW_COLOR,
  brushSize: DEFAULT_BRUSH_SIZE
};

const getTimestampLabel = (): string => {
  return new Date().toISOString().replace(/[:.]/g, '-');
};

/* Persisted storage is user-controlled, so validate before trusting loaded data */
const isDrawTool = (value: unknown): value is DrawTool => {
  return value === 'brush' || value === 'eraser';
};

const isDrawStroke = (value: unknown): value is DrawStroke => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const stroke = value as DrawStroke;

  return (
    typeof stroke.id === 'number' &&
    isDrawTool(stroke.tool) &&
    typeof stroke.color === 'string' &&
    typeof stroke.size === 'number' &&
    Array.isArray(stroke.points) &&
    stroke.points.every(
      (point) =>
        point &&
        typeof point === 'object' &&
        typeof point.x === 'number' &&
        typeof point.y === 'number'
    )
  );
};

const sanitizeDrawStorage = (value: unknown): DrawStorageState => {
  if (!value || typeof value !== 'object') {
    return {
      strokes: [],
      activeTool: 'brush',
      brushColor: DEFAULT_DRAW_COLOR,
      brushSize: DEFAULT_BRUSH_SIZE
    };
  }

  const candidate = value as Partial<DrawStorageState>;

  return {
    strokes: Array.isArray(candidate.strokes)
      ? candidate.strokes.filter(isDrawStroke)
      : [],
    activeTool: isDrawTool(candidate.activeTool)
      ? candidate.activeTool
      : 'brush',
    brushColor:
      typeof candidate.brushColor === 'string'
        ? candidate.brushColor
        : DEFAULT_DRAW_COLOR,
    brushSize:
      typeof candidate.brushSize === 'number'
        ? candidate.brushSize
        : DEFAULT_BRUSH_SIZE
  };
};

export const DrawProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  /* Global state */
  const { handleOpenAlert } = useAlertActionsContext();

  /* Local state */
  const [drawState, setDrawState] = useState<DrawStorageState>(
    DEFAULT_DRAW_STORAGE_STATE
  );
  const [storageReady, setStorageReady] = useState(false);
  const [surfaceDimensions, setSurfaceDimensions] = useState<Dimensions | null>(
    null
  );

  /* Refs */
  const draftControllerRef = useRef<DrawDraftController | null>(null);
  const persistQueueRef = useRef(Promise.resolve());
  const loadErrorShownRef = useRef(false);
  const saveErrorShownRef = useRef(false);

  const { strokes, activeTool, brushColor, brushSize } = drawState;

  /* Restore saved draw state from IndexedDB on startup */
  useEffect(() => {
    let isCancelled = false;
    const loadSavedDrawState = async () => {
      try {
        const storedState = await loadIndexedDbDrawState();
        if (isCancelled) {
          return;
        }
        setDrawState(
          storedState
            ? sanitizeDrawStorage(storedState)
            : DEFAULT_DRAW_STORAGE_STATE
        );
        setStorageReady(true);
      } catch (error) {
        console.error('Failed to load draw state from IndexedDB:', error);

        if (!loadErrorShownRef.current) {
          handleOpenAlert('Failed to load saved draw state', 'warning');
          loadErrorShownRef.current = true;
        }
        if (!isCancelled) {
          setStorageReady(false);
        }
      }
    };
    loadSavedDrawState();

    return () => {
      isCancelled = true;
    };
  }, [handleOpenAlert]);

  /* Save draw-state changes after the initial IndexedDB load.
   * Writes are queued to keep IndexedDB updates ordered.
   */
  useEffect(() => {
    if (!storageReady) {
      return;
    }

    persistQueueRef.current = persistQueueRef.current
      .then(async () => {
        await saveIndexedDbDrawState(drawState);
      })
      .catch((error) => {
        console.error('Failed to save draw state to IndexedDB:', error);

        if (!saveErrorShownRef.current) {
          handleOpenAlert('Failed to save draw state', 'warning');
          saveErrorShownRef.current = true;
        }
      });
  }, [drawState, handleOpenAlert, storageReady]);

  /* DrawCanvas keeps the in-progress stroke local for performance but exposes
   * a tiny controller so actions like undo/clear can handle unfinished edits.
   */
  const registerDraftController = useCallback(
    (controller: DrawDraftController | null) => {
      draftControllerRef.current = controller;
    },
    []
  );

  /* Append completed brush strokes to the persisted drawing */
  const addStroke = useCallback((stroke: DrawStroke) => {
    setDrawState((prevState) => {
      return {
        ...prevState,
        strokes: [...prevState.strokes, stroke]
      };
    });
  }, []);

  /* Clear only the drawing, not the selected tool or brush settings */
  const clearDrawing = useCallback(() => {
    draftControllerRef.current?.discardDraft();

    setDrawState((prevState) => {
      return {
        ...prevState,
        strokes: []
      };
    });
  }, []);

  const setActiveTool = useCallback(
    (valueOrFn: React.SetStateAction<DrawTool>) => {
      setDrawState((prevState) => {
        const nextValue =
          typeof valueOrFn === 'function'
            ? valueOrFn(prevState.activeTool)
            : valueOrFn;

        return {
          ...prevState,
          activeTool: nextValue
        };
      });
    },
    []
  );

  const setBrushColor = useCallback(
    (valueOrFn: React.SetStateAction<string>) => {
      setDrawState((prevState) => {
        const nextValue =
          typeof valueOrFn === 'function'
            ? valueOrFn(prevState.brushColor)
            : valueOrFn;

        return {
          ...prevState,
          brushColor: nextValue
        };
      });
    },
    []
  );

  const setBrushSize = useCallback(
    (valueOrFn: React.SetStateAction<number>) => {
      setDrawState((prevState) => {
        const nextValue =
          typeof valueOrFn === 'function'
            ? valueOrFn(prevState.brushSize)
            : valueOrFn;

        return {
          ...prevState,
          brushSize: nextValue
        };
      });
    },
    []
  );

  const saveDrawingAsPng = useCallback(async () => {
    /* Export is generated from native coordinates onto a transparent canvas */
    if (
      !surfaceDimensions ||
      surfaceDimensions.videoWidth <= 0 ||
      surfaceDimensions.videoHeight <= 0
    ) {
      handleOpenAlert(
        'Native video resolution is not available yet',
        'warning'
      );
      return;
    }

    if (strokes.length === 0) {
      handleOpenAlert('There is no drawing to save yet', 'warning');
      return;
    }

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = surfaceDimensions.videoWidth;
    exportCanvas.height = surfaceDimensions.videoHeight;

    const context = exportCanvas.getContext('2d');
    if (!context) {
      handleOpenAlert('Failed to initialize PNG export canvas', 'error');
      return;
    }

    renderDrawStrokes({
      context,
      strokes,
      renderWidth: exportCanvas.width,
      renderHeight: exportCanvas.height,
      sourceWidth: surfaceDimensions.videoWidth,
      sourceHeight: surfaceDimensions.videoHeight
    });

    const blob = await new Promise<Blob | null>((resolve) => {
      exportCanvas.toBlob((value) => resolve(value), 'image/png');
    });

    if (!blob) {
      handleOpenAlert('Failed to encode drawing as PNG', 'error');
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `draw_${surfaceDimensions.videoWidth}x${surfaceDimensions.videoHeight}_${getTimestampLabel()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    handleOpenAlert('Drawing saved as PNG', 'success');
  }, [handleOpenAlert, strokes, surfaceDimensions]);

  const value = useMemo(
    () => ({
      strokes,
      activeTool,
      setActiveTool,
      brushColor,
      setBrushColor,
      brushSize,
      setBrushSize,
      surfaceDimensions,
      setSurfaceDimensions,
      registerDraftController,
      addStroke,
      clearDrawing,
      saveDrawingAsPng,
      hasDrawing: strokes.length > 0
    }),
    [
      strokes,
      activeTool,
      brushColor,
      brushSize,
      surfaceDimensions,
      registerDraftController,
      addStroke,
      clearDrawing,
      saveDrawingAsPng
    ]
  );

  return <DrawContext.Provider value={value}>{children}</DrawContext.Provider>;
};

/* Small helper hook so consumers never need to handle undefined context values */
export const useDrawContext = (): DrawContextProps => {
  const value = useContext(DrawContext);

  if (!value) {
    throw new Error('useDrawContext must be used within DrawProvider');
  }

  return value;
};
