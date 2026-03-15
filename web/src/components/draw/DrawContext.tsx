/* DrawContext
 *
 * Shared state for draw mode.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from 'react';
import { useLocalStorage } from '../../helpers/hooks.jsx';
import { Dimensions } from '../appInterface';
import { useAlertActionsContext } from '../context/AppContext';
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
const DRAW_STORAGE_KEY = 'drawState';

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

const getTimestampLabel = (): string => {
  return new Date().toISOString().replace(/[:.]/g, '-');
};

/* Storage is user-controlled, so validate before trusting localStorage contents */
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
  /* Alert API */
  const { handleOpenAlert } = useAlertActionsContext();

  /* Persisted draw state */
  const [storedDrawState, setStoredDrawState] = useLocalStorage(
    DRAW_STORAGE_KEY,
    {
      strokes: [],
      activeTool: 'brush',
      brushColor: DEFAULT_DRAW_COLOR,
      brushSize: DEFAULT_BRUSH_SIZE
    }
  );
  const drawState = sanitizeDrawStorage(storedDrawState);
  const { strokes, activeTool, brushColor, brushSize } = drawState;
  const draftControllerRef = useRef<DrawDraftController | null>(null);

  /* Live video surface dimensions used for export sizing */
  const [surfaceDimensions, setSurfaceDimensions] = useState<Dimensions | null>(
    null
  );

  /* DrawCanvas keeps the in-progress stroke local for performance but exposes
   * a tiny controller so actions like undo/clear can handle unfinished edits.
   */
  const registerDraftController = useCallback(
    (controller: DrawDraftController | null) => {
      draftControllerRef.current = controller;
    },
    []
  );

  /* Append completed strokes to the persisted drawing */
  const addStroke = useCallback(
    (stroke: DrawStroke) => {
      setStoredDrawState((prevState: unknown) => {
        const safeState = sanitizeDrawStorage(prevState);

        return {
          ...safeState,
          strokes: [...safeState.strokes, stroke]
        };
      });
    },
    [setStoredDrawState]
  );

  /* Clear only the drawing, not the selected tool or brush settings */
  const clearDrawing = useCallback(() => {
    draftControllerRef.current?.discardDraft();

    setStoredDrawState((prevState: unknown) => {
      const safeState = sanitizeDrawStorage(prevState);

      return {
        ...safeState,
        strokes: []
      };
    });
  }, [setStoredDrawState]);

  const setActiveTool = useCallback(
    (valueOrFn: React.SetStateAction<DrawTool>) => {
      setStoredDrawState((prevState: unknown) => {
        const safeState = sanitizeDrawStorage(prevState);
        const nextValue =
          typeof valueOrFn === 'function'
            ? valueOrFn(safeState.activeTool)
            : valueOrFn;

        return {
          ...safeState,
          activeTool: nextValue
        };
      });
    },
    [setStoredDrawState]
  );

  const setBrushColor = useCallback(
    (valueOrFn: React.SetStateAction<string>) => {
      setStoredDrawState((prevState: unknown) => {
        const safeState = sanitizeDrawStorage(prevState);
        const nextValue =
          typeof valueOrFn === 'function'
            ? valueOrFn(safeState.brushColor)
            : valueOrFn;

        return {
          ...safeState,
          brushColor: nextValue
        };
      });
    },
    [setStoredDrawState]
  );

  const setBrushSize = useCallback(
    (valueOrFn: React.SetStateAction<number>) => {
      setStoredDrawState((prevState: unknown) => {
        const safeState = sanitizeDrawStorage(prevState);
        const nextValue =
          typeof valueOrFn === 'function'
            ? valueOrFn(safeState.brushSize)
            : valueOrFn;

        return {
          ...safeState,
          brushSize: nextValue
        };
      });
    },
    [setStoredDrawState]
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
