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
import {
  useAlertActionsContext,
  useChannelContext
} from '../context/AppContext';
import { loadIndexedDbDrawState, saveIndexedDbDrawState } from './drawStorage';
import { DrawHistoryEntry, DrawStroke, DrawTool } from './drawInterfaces';
import {
  DEFAULT_BRUSH_SIZE,
  DEFAULT_DRAW_COLOR,
  renderDrawStrokes,
  scaleDrawStrokes
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
  undoLastEdit: () => void;
  redoLastEdit: () => void;
  clearDrawing: () => void;
  createDrawingPngExport: (
    options?: DrawPngExportOptions
  ) => Promise<DrawPngExport | null>;
  saveDrawingAsPng: (options?: DrawPngExportOptions) => Promise<void>;
  hasDrawing: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const DrawContext = createContext<DrawContextProps | undefined>(undefined);

interface DrawStorageState {
  strokes: DrawStroke[];
  undoHistory: DrawHistoryEntry[];
  redoHistory: DrawHistoryEntry[];
  activeTool: DrawTool;
  brushColor: string;
  brushSize: number;
  sourceWidth: number;
  sourceHeight: number;
}

interface DrawDraftController {
  hasDraft: () => boolean;
  discardDraft: () => void;
}

interface DrawPngExport {
  blob: Blob;
  videoWidth: number;
  videoHeight: number;
  includesVideoImage: boolean;
}

interface DrawPngExportOptions {
  includeVideoImage?: boolean;
}

const MAX_UNDO_HISTORY = 100;

const DEFAULT_DRAW_STORAGE_STATE: DrawStorageState = {
  strokes: [],
  undoHistory: [],
  redoHistory: [],
  activeTool: 'brush',
  brushColor: DEFAULT_DRAW_COLOR,
  brushSize: DEFAULT_BRUSH_SIZE,
  sourceWidth: 0,
  sourceHeight: 0
};

const getTimestampLabel = (): string => {
  return new Date().toISOString().replace(/[:.]/g, '-');
};

/* Build the still image request for the active stream size. */
const getVideoImageUrl = ({
  camera,
  width,
  height
}: {
  camera: string;
  width: number;
  height: number;
}): string => {
  const params = new URLSearchParams({
    camera,
    resolution: `${width}x${height}`
  });

  return `/axis-cgi/jpg/image.cgi?${params.toString()}`;
};

/* Load the still image through the same origin path used by the web UI. */
const loadVideoImage = async ({
  camera,
  width,
  height
}: {
  camera: string;
  width: number;
  height: number;
}): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();

    /* Use normal image loading so the browser handles the image response. */
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load video image'));
    image.src = getVideoImageUrl({ camera, width, height });
  });
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
      undoHistory: [],
      redoHistory: [],
      activeTool: 'brush',
      brushColor: DEFAULT_DRAW_COLOR,
      brushSize: DEFAULT_BRUSH_SIZE,
      sourceWidth: 0,
      sourceHeight: 0
    };
  }

  const candidate = value as Partial<DrawStorageState>;
  const undoHistory = Array.isArray(candidate.undoHistory)
    ? candidate.undoHistory
        .filter(
          (entry): entry is DrawHistoryEntry =>
            !!entry &&
            typeof entry === 'object' &&
            Array.isArray(entry.strokes) &&
            entry.strokes.every(isDrawStroke)
        )
        .map((entry) => ({
          strokes: entry.strokes.map((stroke) => ({
            ...stroke,
            points: [...stroke.points]
          }))
        }))
    : [];
  const redoHistory = Array.isArray(candidate.redoHistory)
    ? candidate.redoHistory
        .filter(
          (entry): entry is DrawHistoryEntry =>
            !!entry &&
            typeof entry === 'object' &&
            Array.isArray(entry.strokes) &&
            entry.strokes.every(isDrawStroke)
        )
        .map((entry) => ({
          strokes: entry.strokes.map((stroke) => ({
            ...stroke,
            points: [...stroke.points]
          }))
        }))
    : [];

  return {
    strokes: Array.isArray(candidate.strokes)
      ? candidate.strokes.filter(isDrawStroke)
      : [],
    undoHistory,
    redoHistory,
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
        : DEFAULT_BRUSH_SIZE,
    sourceWidth:
      typeof candidate.sourceWidth === 'number' ? candidate.sourceWidth : 0,
    sourceHeight:
      typeof candidate.sourceHeight === 'number' ? candidate.sourceHeight : 0
  };
};

export const DrawProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  /* Global state */
  const { handleOpenAlert } = useAlertActionsContext();
  const { currentChannel } = useChannelContext();

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

  const {
    strokes,
    undoHistory,
    redoHistory,
    activeTool,
    brushColor,
    brushSize
  } = drawState;

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

  /* Keep stored strokes in the current native video coordinate space so
   * changing stream resolution preserves the same relative drawing.
   */
  useEffect(() => {
    const nextSourceWidth = surfaceDimensions?.videoWidth ?? 0;
    const nextSourceHeight = surfaceDimensions?.videoHeight ?? 0;

    if (nextSourceWidth <= 0 || nextSourceHeight <= 0) {
      return;
    }

    setDrawState((prevState) => {
      if (
        prevState.sourceWidth === nextSourceWidth &&
        prevState.sourceHeight === nextSourceHeight
      ) {
        return prevState;
      }

      if (draftControllerRef.current?.hasDraft()) {
        draftControllerRef.current.discardDraft();
      }

      if (prevState.sourceWidth <= 0 || prevState.sourceHeight <= 0) {
        return {
          ...prevState,
          sourceWidth: nextSourceWidth,
          sourceHeight: nextSourceHeight
        };
      }

      return {
        ...prevState,
        strokes: scaleDrawStrokes(
          prevState.strokes,
          prevState.sourceWidth,
          prevState.sourceHeight,
          nextSourceWidth,
          nextSourceHeight
        ),
        undoHistory: prevState.undoHistory.map((entry) => ({
          strokes: scaleDrawStrokes(
            entry.strokes,
            prevState.sourceWidth,
            prevState.sourceHeight,
            nextSourceWidth,
            nextSourceHeight
          )
        })),
        redoHistory: prevState.redoHistory.map((entry) => ({
          strokes: scaleDrawStrokes(
            entry.strokes,
            prevState.sourceWidth,
            prevState.sourceHeight,
            nextSourceWidth,
            nextSourceHeight
          )
        })),
        sourceWidth: nextSourceWidth,
        sourceHeight: nextSourceHeight
      };
    });
  }, [surfaceDimensions?.videoHeight, surfaceDimensions?.videoWidth]);

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
        undoHistory: [
          ...prevState.undoHistory.slice(-(MAX_UNDO_HISTORY - 1)),
          { strokes: prevState.strokes }
        ],
        redoHistory: [],
        strokes: [...prevState.strokes, stroke]
      };
    });
  }, []);

  /* Undo removes the current draft first, otherwise it restores the previous saved step */
  const undoLastEdit = useCallback(() => {
    if (draftControllerRef.current?.hasDraft()) {
      draftControllerRef.current.discardDraft();
      return;
    }

    setDrawState((prevState) => {
      if (prevState.undoHistory.length === 0) {
        return prevState;
      }

      const previousEntry =
        prevState.undoHistory[prevState.undoHistory.length - 1];

      return {
        ...prevState,
        strokes: previousEntry.strokes,
        undoHistory: prevState.undoHistory.slice(0, -1),
        redoHistory: [
          ...prevState.redoHistory.slice(-(MAX_UNDO_HISTORY - 1)),
          { strokes: prevState.strokes }
        ]
      };
    });
  }, []);

  /* Redo reapplies the next stored history step */
  const redoLastEdit = useCallback(() => {
    setDrawState((prevState) => {
      if (prevState.redoHistory.length === 0) {
        return prevState;
      }

      const nextEntry = prevState.redoHistory[prevState.redoHistory.length - 1];

      return {
        ...prevState,
        strokes: nextEntry.strokes,
        undoHistory: [
          ...prevState.undoHistory.slice(-(MAX_UNDO_HISTORY - 1)),
          { strokes: prevState.strokes }
        ],
        redoHistory: prevState.redoHistory.slice(0, -1)
      };
    });
  }, []);

  /* Clear only the drawing, not the selected tool or brush settings */
  const clearDrawing = useCallback(() => {
    draftControllerRef.current?.discardDraft();

    setDrawState((prevState) => {
      if (prevState.strokes.length === 0) {
        return prevState;
      }

      return {
        ...prevState,
        undoHistory: [
          ...prevState.undoHistory.slice(-(MAX_UNDO_HISTORY - 1)),
          { strokes: prevState.strokes }
        ],
        redoHistory: [],
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

  /*
   * Build the PNG used by Save and Upload.
   * The normal export contains only the drawing on a transparent background.
   * When requested, a current video still image is drawn first and the drawing layer
   * is composited on top.
   */
  const createDrawingPngExport = useCallback(
    async (options?: DrawPngExportOptions) => {
      const includeVideoImage = options?.includeVideoImage === true;

      /* The export canvas uses native video coordinates. */
      const videoWidth = surfaceDimensions?.videoWidth ?? 0;
      const videoHeight = surfaceDimensions?.videoHeight ?? 0;

      if (videoWidth <= 0 || videoHeight <= 0) {
        handleOpenAlert(
          'Native video resolution is not available yet',
          'warning'
        );
        return null;
      }

      if (strokes.length === 0) {
        handleOpenAlert('There is no drawing to save yet', 'warning');
        return null;
      }

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = videoWidth;
      exportCanvas.height = videoHeight;

      const context = exportCanvas.getContext('2d');
      if (!context) {
        handleOpenAlert('Failed to initialize PNG export canvas', 'error');
        return null;
      }

      /* Default export draws strokes directly onto a transparent PNG. */
      let strokeContext = context;
      let strokeCanvas: HTMLCanvasElement | null = null;

      if (includeVideoImage) {
        try {
          /* Draw the still image before compositing the drawing layer. */
          const videoImage = await loadVideoImage({
            camera: currentChannel || '1',
            width: videoWidth,
            height: videoHeight
          });

          /* The still image is a snapshot taken when the export starts. */
          context.drawImage(
            videoImage,
            0,
            0,
            exportCanvas.width,
            exportCanvas.height
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown image error';
          handleOpenAlert(`Failed to load video image: ${message}`, 'error');
          return null;
        }

        /* Eraser strokes must affect only the drawing, not the video image. */
        strokeCanvas = document.createElement('canvas');
        strokeCanvas.width = exportCanvas.width;
        strokeCanvas.height = exportCanvas.height;
        const layerContext = strokeCanvas.getContext('2d');
        if (!layerContext) {
          handleOpenAlert('Failed to initialize drawing export layer', 'error');
          return null;
        }
        strokeContext = layerContext;
      }

      renderDrawStrokes({
        context: strokeContext,
        strokes,
        renderWidth: exportCanvas.width,
        renderHeight: exportCanvas.height,
        sourceWidth: videoWidth,
        sourceHeight: videoHeight
      });

      if (strokeCanvas) {
        /* Merge the transparent drawing layer over the video snapshot. */
        context.drawImage(strokeCanvas, 0, 0);
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        exportCanvas.toBlob((value) => resolve(value), 'image/png');
      });

      if (!blob) {
        handleOpenAlert('Failed to encode drawing as PNG', 'error');
        return null;
      }

      return {
        blob,
        videoWidth,
        videoHeight,
        includesVideoImage: includeVideoImage
      };
    },
    [currentChannel, handleOpenAlert, strokes, surfaceDimensions]
  );

  /*
   * Save the generated PNG by creating a temporary download link.
   * The actual image content is built by createDrawingPngExport so Save and
   * Upload always use the same export rules.
   */
  const saveDrawingAsPng = useCallback(
    async (options?: DrawPngExportOptions) => {
      const pngExport = await createDrawingPngExport(options);
      if (!pngExport) {
        return;
      }

      const url = URL.createObjectURL(pngExport.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${
        pngExport.includesVideoImage ? 'draw_video' : 'draw'
      }_${pngExport.videoWidth}x${
        pngExport.videoHeight
      }_${getTimestampLabel()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      handleOpenAlert('Drawing saved as PNG', 'success');
    },
    [createDrawingPngExport, handleOpenAlert]
  );

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
      undoLastEdit,
      redoLastEdit,
      clearDrawing,
      createDrawingPngExport,
      saveDrawingAsPng,
      hasDrawing: strokes.length > 0,
      canUndo: undoHistory.length > 0,
      canRedo: redoHistory.length > 0
    }),
    [
      strokes,
      undoHistory,
      redoHistory,
      activeTool,
      brushColor,
      brushSize,
      surfaceDimensions,
      registerDraftController,
      addStroke,
      undoLastEdit,
      redoLastEdit,
      clearDrawing,
      createDrawingPngExport,
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
