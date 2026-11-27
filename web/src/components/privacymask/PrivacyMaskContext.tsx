/*
 * PrivacyMaskContext: Provides state and API for privacy masks.
 *
 * Masks are kept in the reference frame (full unrotated sensor resolution).
 * Consumers map to the displayed stream with the exposed frame and rotation.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode
} from 'react';
import { log } from '../../helpers/logger';
import { playSound } from '../../helpers/utils';
import newSoundUrl from '../../assets/audio/new.oga';
import trashSoundUrl from '../../assets/audio/trash.oga';
import {
  useAlertActionsContext,
  useAppStatusContext,
  useChannelContext
} from '../context/AppContext';
import { useParameters } from '../context/ParametersContext';
import {
  MASK_COLORS,
  MaskColor,
  MaskPoint,
  MaskReferenceFrame,
  PrivacyMask,
  PrivacyMaskAppearance,
  PrivacyMaskCapabilities,
  StreamRotation
} from './privacyMaskInterfaces';
import {
  apiAddPrivacyMask,
  apiGetMosaicScaleRange,
  apiGetPrivacyMaskAppearance,
  apiGetSourceRotation,
  apiListPrivacyMasks,
  apiRemovePrivacyMask,
  apiRenamePrivacyMask,
  apiSetPrivacyMaskAppearance,
  apiSetPrivacyMaskEnabled,
  apiUpdatePrivacyMask
} from './privacyMaskApi';
import {
  MIN_MASK_CORNERS,
  clamp,
  createDefaultPolygon,
  generateMaskName,
  getMaxResolution,
  normalizeRotation,
  parseResolution,
  getFrameBounds,
  getVisibleBounds,
  translatePolygon
} from './privacyMaskUtils';

export const MAX_MASK_NAME_LENGTH = 64;

interface PrivacyMaskContextProps {
  capabilities: PrivacyMaskCapabilities;
  frame: MaskReferenceFrame | null;
  rotation: StreamRotation;
  appearance: PrivacyMaskAppearance;
  masks: PrivacyMask[];
  selectedMaskId: number | null;
  setSelectedMaskId: (id: number | null) => void;
  /* Stream size reported by the canvas */
  streamSize: { width: number; height: number } | null;
  setStreamSize: (size: { width: number; height: number } | null) => void;
  listMasks: () => Promise<void>;
  /* Re-read masks and the stream rotation from the device */
  refresh: () => Promise<void>;
  addMask: (
    points?: MaskPoint[],
    nameFor?: (takenNames: string[]) => string
  ) => Promise<boolean>;
  duplicateMask: (mask: PrivacyMask) => Promise<boolean>;
  updateMaskPoints: (id: number, points: MaskPoint[]) => Promise<boolean>;
  removeMask: (id: number) => Promise<boolean>;
  removeAllMasks: () => Promise<void>;
  renameMask: (id: number, name: string) => Promise<boolean>;
  setMaskEnabled: (id: number, enabled: boolean) => Promise<boolean>;
  setAppearance: (values: {
    color?: MaskColor;
    mosaicScale?: number;
  }) => Promise<boolean>;
  validateMaskName: (name: string, id?: number) => string | null;
}

const PrivacyMaskContext = createContext<PrivacyMaskContextProps | undefined>(
  undefined
);

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

export const PrivacyMaskProvider: React.FC<{ children: ReactNode }> = ({
  children
}) => {
  /* Global context */
  const { handleOpenAlert } = useAlertActionsContext();
  const { setAppLoading } = useAppStatusContext();
  const { currentChannel } = useChannelContext();
  const { parameters } = useParameters();

  /* Local state */
  const [masks, setMasks] = useState<PrivacyMask[]>([]);
  const [selectedMaskId, setSelectedMaskId] = useState<number | null>(null);
  const [streamSize, setStreamSizeState] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [color, setColor] = useState<MaskColor>('black');
  const [mosaicScale, setMosaicScale] = useState<number>(5);
  const [mosaicRange, setMosaicRange] = useState({ min: 5, max: 8 });

  /* Refs
   * mutationCounterRef: bumped on every write so that list responses started
   * before a write cannot overwrite the optimistic state.
   */
  const mutationCounterRef = useRef(0);
  const listRequestIdRef = useRef(0);
  const updateQueueRef = useRef<Map<number, Promise<unknown>>>(new Map());
  /* Name of a newly added mask to select once it appears in the list */
  const pendingSelectNameRef = useRef<string | null>(null);
  /* Adds are serialized and pick names from the latest known list plus names
   * reserved by adds not yet seen in a list, so rapid clicks cannot reuse a
   * name (the device rejects duplicates).
   */
  const masksRef = useRef<PrivacyMask[]>([]);
  const reservedNamesRef = useRef<Set<string>>(new Set());
  const addQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const setStreamSize = useCallback(
    (size: { width: number; height: number } | null) => {
      setStreamSizeState((current) =>
        current?.width === size?.width && current?.height === size?.height
          ? current
          : size
      );
    },
    []
  );

  /* Image source index for the selected channel (channels are 1-based) */
  const source = Math.max(0, (parseInt(currentChannel, 10) || 1) - 1);

  const capabilities = useMemo<PrivacyMaskCapabilities>(
    () => ({
      supported:
        parameters?.['root.Properties.PrivacyMask.PrivacyMask'] === 'yes' &&
        parameters?.['root.Properties.PrivacyMask.Polygon'] === 'yes',
      maxMasks:
        parseInt(
          parameters?.['root.Properties.PrivacyMask.MaxNbrOfPrivacyMasks'] ??
            '',
          10
        ) || 32,
      maxCorners:
        parseInt(
          parameters?.['root.Properties.PrivacyMask.MaxNbrOfCorners'] ?? '',
          10
        ) || 10
    }),
    [parameters]
  );

  /* Reference frame: largest resolution of the source (unrotated sensor) */
  const frame = useMemo<MaskReferenceFrame | null>(() => {
    const resolution =
      getMaxResolution(
        parameters?.[`root.Properties.Image.I${source}.Resolution`]
      ) ??
      getMaxResolution(parameters?.['root.Properties.Image.Resolution']) ??
      parseResolution(
        parameters?.[`root.Image.I${source}.Appearance.Resolution`]
      );
    return resolution ? { source, ...resolution } : null;
  }, [parameters, source]);

  /* Rotation of the displayed stream relative to the reference frame.
   *
   * Re-read from the device whenever the stream changes: the source rotation
   * can be changed outside this app and the startup parameters go stale.
   * With SourceRotation=yes the device ignores the stream rotation parameter.
   */
  const [rotation, setRotation] = useState<StreamRotation>(0);
  const rotationRequestIdRef = useRef(0);

  const refreshRotation = useCallback(async () => {
    const requestId = ++rotationRequestIdRef.current;
    const info = (await apiGetSourceRotation(source)) ?? {
      sourceRotation:
        parameters?.[`root.ImageSource.I${source}.SourceRotation`] === 'yes',
      rotation: parameters?.[`root.ImageSource.I${source}.Rotation`] ?? '0'
    };
    if (requestId !== rotationRequestIdRef.current) {
      return;
    }
    if (info.sourceRotation) {
      setRotation(normalizeRotation(info.rotation));
      return;
    }
    let streamRotation: unknown =
      parameters?.[`root.Image.I${source}.Appearance.Rotation`];
    try {
      const vapix = JSON.parse(window.localStorage.getItem('vapix') ?? '{}');
      if (vapix?.rotation !== undefined && vapix.rotation !== '') {
        streamRotation = vapix.rotation;
      }
    } catch {
      /* Ignore invalid stored stream settings */
    }
    setRotation(normalizeRotation(streamRotation));
  }, [parameters, source]);

  const streamWidth = streamSize?.width ?? 0;
  const streamHeight = streamSize?.height ?? 0;

  useEffect(() => {
    if (capabilities.supported && streamWidth > 0 && streamHeight > 0) {
      refreshRotation();
    }
  }, [capabilities.supported, refreshRotation, streamWidth, streamHeight]);

  /* Sync appearance from parameters */
  useEffect(() => {
    const group = `root.Image.I${source}.Overlay.MaskWindows`;
    const paramColor = parameters?.[`${group}.Color`] as MaskColor | undefined;
    if (paramColor && MASK_COLORS.includes(paramColor)) {
      setColor(paramColor);
    }
    const paramScale = parseInt(parameters?.[`${group}.MosaicScale`] ?? '', 10);
    if (Number.isFinite(paramScale)) {
      setMosaicScale(paramScale);
    }
  }, [parameters, source]);

  /* Fetched on demand (not at app start) since the provider wraps the app */
  const appearanceRequestIdRef = useRef(0);
  const loadAppearance = useCallback(async () => {
    if (!capabilities.supported) {
      return;
    }
    const requestId = ++appearanceRequestIdRef.current;
    const [current, range] = await Promise.all([
      apiGetPrivacyMaskAppearance(source),
      apiGetMosaicScaleRange(source)
    ]);
    if (requestId !== appearanceRequestIdRef.current) {
      return;
    }
    if (current && MASK_COLORS.includes(current.color as MaskColor)) {
      setColor(current.color as MaskColor);
      setMosaicScale(current.mosaicScale);
    }
    if (range) {
      setMosaicRange(range);
    }
  }, [capabilities.supported, source]);

  const appearance = useMemo<PrivacyMaskAppearance>(
    () => ({
      color,
      mosaicScale,
      mosaicScaleMin: mosaicRange.min,
      mosaicScaleMax: mosaicRange.max
    }),
    [color, mosaicScale, mosaicRange]
  );

  useEffect(() => {
    const pendingName = pendingSelectNameRef.current;
    if (!pendingName) {
      return;
    }
    const added = masks.find((mask) => mask.name === pendingName);
    if (added) {
      pendingSelectNameRef.current = null;
      setSelectedMaskId(added.id);
    }
  }, [masks]);

  /* Masks belong to the source, so drop stale state when it changes */
  useEffect(() => {
    masksRef.current = [];
    reservedNamesRef.current.clear();
    setMasks([]);
    setSelectedMaskId(null);
  }, [source]);

  /****************************************************************************/
  /* API methods */

  const listMasks = useCallback(async () => {
    if (!frame || !capabilities.supported) {
      return;
    }
    const requestId = ++listRequestIdRef.current;
    const mutationAtStart = mutationCounterRef.current;
    try {
      const list = await apiListPrivacyMasks(frame);
      if (
        requestId !== listRequestIdRef.current ||
        mutationAtStart !== mutationCounterRef.current
      ) {
        return;
      }
      log('[PrivacyMask] list:', list);
      masksRef.current = list;
      list.forEach((mask) => reservedNamesRef.current.delete(mask.name));
      setMasks(list);
      setSelectedMaskId((current) =>
        current !== null && list.some((mask) => mask.id === current)
          ? current
          : null
      );
    } catch (err) {
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      console.error('Failed to list privacy masks:', err);
      handleOpenAlert(
        errorMessage(err, 'Failed to list privacy masks'),
        'error'
      );
    }
  }, [frame, capabilities.supported, handleOpenAlert]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshRotation(), listMasks(), loadAppearance()]);
  }, [refreshRotation, listMasks, loadAppearance]);

  /* Run a write and refresh afterwards. Returns true on success. */
  const runMutation = useCallback(
    async (
      action: () => Promise<void>,
      failMessage: string,
      successMessage?: string
    ): Promise<boolean> => {
      mutationCounterRef.current++;
      try {
        setAppLoading(true);
        await action();
        if (successMessage) {
          handleOpenAlert(successMessage, 'success');
        }
        return true;
      } catch (err) {
        console.error(`${failMessage}:`, err);
        handleOpenAlert(`${failMessage}: ${errorMessage(err, '')}`, 'error');
        return false;
      } finally {
        setAppLoading(false);
        mutationCounterRef.current++;
        await listMasks();
      }
    },
    [handleOpenAlert, listMasks, setAppLoading]
  );

  const validateMaskName = useCallback(
    (name: string, id?: number): string | null => {
      const trimmed = name.trim();
      if (!trimmed) {
        return 'Name is required';
      }
      if (trimmed.length > MAX_MASK_NAME_LENGTH) {
        return `Name must be at most ${MAX_MASK_NAME_LENGTH} characters`;
      }
      if (masks.some((mask) => mask.name === trimmed && mask.id !== id)) {
        return 'Name is already in use';
      }
      return null;
    },
    [masks]
  );

  /* Part of the image visible in the current stream (whole image if unknown) */
  const visibleBounds = useMemo(
    () =>
      frame
        ? streamSize
          ? getVisibleBounds(
              frame,
              rotation,
              streamSize.width,
              streamSize.height
            )
          : getFrameBounds(frame)
        : null,
    [frame, rotation, streamSize]
  );

  const addMask = useCallback(
    (
      points?: MaskPoint[],
      nameFor: (takenNames: string[]) => string = generateMaskName
    ): Promise<boolean> => {
      const task = async () => {
        if (!frame || !visibleBounds) {
          return false;
        }
        const reserved = reservedNamesRef.current;
        const takenNames = [
          ...masksRef.current.map((mask) => mask.name),
          ...reserved
        ];
        if (takenNames.length >= capabilities.maxMasks) {
          handleOpenAlert(
            `Maximum number of privacy masks (${capabilities.maxMasks}) reached`,
            'warning'
          );
          return false;
        }
        const maskName = nameFor(takenNames);
        const maskPoints = points ?? createDefaultPolygon(visibleBounds);
        reserved.add(maskName);
        const ok = await runMutation(
          () => apiAddPrivacyMask(frame, maskName, maskPoints),
          'Failed to add privacy mask',
          `Added privacy mask "${maskName}"`
        );
        if (ok) {
          playSound(newSoundUrl);
          pendingSelectNameRef.current = maskName;
        } else {
          reserved.delete(maskName);
        }
        return ok;
      };
      const next = addQueueRef.current.catch(() => undefined).then(task);
      addQueueRef.current = next;
      return next;
    },
    [frame, visibleBounds, capabilities.maxMasks, handleOpenAlert, runMutation]
  );

  const duplicateMask = useCallback(
    async (mask: PrivacyMask) => {
      if (!frame || !visibleBounds) {
        return false;
      }
      const offset = Math.round(Math.min(frame.width, frame.height) * 0.03);
      return addMask(
        translatePolygon(mask.points, offset, offset, visibleBounds),
        (takenNames) => {
          let name = `${mask.name} copy`.slice(0, MAX_MASK_NAME_LENGTH);
          for (let i = 2; takenNames.includes(name); i++) {
            name = `${mask.name} copy ${i}`.slice(0, MAX_MASK_NAME_LENGTH);
          }
          return name;
        }
      );
    },
    [frame, visibleBounds, addMask]
  );

  /* Serialize writes per mask. Name-based CGI calls resolve the name when
   * they run, since a queued rename may have changed it in the meantime.
   */
  const enqueueForMask = useCallback(
    (id: number, task: () => Promise<boolean>): Promise<boolean> => {
      const previous = updateQueueRef.current.get(id) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(task);
      updateQueueRef.current.set(id, next);
      next.finally(() => {
        if (updateQueueRef.current.get(id) === next) {
          updateQueueRef.current.delete(id);
        }
      });
      return next;
    },
    []
  );

  const currentMaskName = useCallback(
    (id: number, fallback: string): string =>
      masksRef.current.find((m) => m.id === id)?.name ?? fallback,
    []
  );

  const updateMaskPoints = useCallback(
    async (id: number, points: MaskPoint[]) => {
      const mask = masks.find((m) => m.id === id);
      if (!frame || !mask) {
        return false;
      }
      if (
        points.length < MIN_MASK_CORNERS ||
        points.length > capabilities.maxCorners
      ) {
        handleOpenAlert(
          `A mask needs ${MIN_MASK_CORNERS}-${capabilities.maxCorners} corners`,
          'warning'
        );
        return false;
      }
      /* The device rejects points outside the image */
      const bounded = points.map((p) => ({
        x: clamp(Math.round(p.x), 0, frame.width - 1),
        y: clamp(Math.round(p.y), 0, frame.height - 1)
      }));
      /* Optimistic update so the polygon does not jump back while saving */
      setMasks((current) =>
        current.map((m) => (m.id === id ? { ...m, points: bounded } : m))
      );
      return enqueueForMask(id, () =>
        runMutation(
          () =>
            apiUpdatePrivacyMask(
              frame,
              currentMaskName(id, mask.name),
              bounded
            ),
          'Failed to update privacy mask'
        )
      );
    },
    [
      frame,
      masks,
      capabilities.maxCorners,
      handleOpenAlert,
      runMutation,
      enqueueForMask,
      currentMaskName
    ]
  );

  const removeMask = useCallback(
    async (id: number) => {
      const mask = masks.find((m) => m.id === id);
      if (!mask) {
        return false;
      }
      const ok = await enqueueForMask(id, () => {
        const name = currentMaskName(id, mask.name);
        return runMutation(
          () => apiRemovePrivacyMask(name),
          'Failed to remove privacy mask',
          `Removed privacy mask "${name}"`
        );
      });
      if (ok) {
        playSound(trashSoundUrl);
        setSelectedMaskId((current) => (current === id ? null : current));
      }
      return ok;
    },
    [masks, runMutation, enqueueForMask, currentMaskName]
  );

  const removeAllMasks = useCallback(async () => {
    const names = masks.map((mask) => mask.name);
    if (names.length === 0) {
      return;
    }
    const ok = await runMutation(
      async () => {
        for (const name of names) {
          await apiRemovePrivacyMask(name);
        }
      },
      'Failed to remove all privacy masks',
      'Removed all privacy masks'
    );
    if (ok) {
      playSound(trashSoundUrl);
      setSelectedMaskId(null);
    }
  }, [masks, runMutation]);

  const renameMask = useCallback(
    async (id: number, name: string) => {
      const mask = masks.find((m) => m.id === id);
      const trimmed = name.trim();
      if (!mask || mask.name === trimmed) {
        return false;
      }
      const validationError = validateMaskName(trimmed, id);
      if (validationError) {
        handleOpenAlert(validationError, 'warning');
        return false;
      }
      return enqueueForMask(id, () =>
        runMutation(
          () => apiRenamePrivacyMask(source, id, trimmed),
          'Failed to rename privacy mask'
        )
      );
    },
    [
      masks,
      source,
      validateMaskName,
      handleOpenAlert,
      runMutation,
      enqueueForMask
    ]
  );

  const setMaskEnabled = useCallback(
    async (id: number, enabled: boolean) => {
      setMasks((current) =>
        current.map((m) => (m.id === id ? { ...m, enabled } : m))
      );
      return runMutation(
        () => apiSetPrivacyMaskEnabled(source, id, enabled),
        `Failed to ${enabled ? 'enable' : 'disable'} privacy mask`
      );
    },
    [source, runMutation]
  );

  const setAppearance = useCallback(
    async (values: { color?: MaskColor; mosaicScale?: number }) => {
      try {
        setAppLoading(true);
        await apiSetPrivacyMaskAppearance(source, values);
        if (values.color !== undefined) {
          setColor(values.color);
        }
        if (values.mosaicScale !== undefined) {
          setMosaicScale(values.mosaicScale);
        }
        return true;
      } catch (err) {
        console.error('Failed to update mask appearance:', err);
        handleOpenAlert(
          `Failed to update mask appearance: ${errorMessage(err, '')}`,
          'error'
        );
        return false;
      } finally {
        setAppLoading(false);
      }
    },
    [source, handleOpenAlert, setAppLoading]
  );

  const value = useMemo(
    () => ({
      capabilities,
      frame,
      rotation,
      appearance,
      masks,
      selectedMaskId,
      setSelectedMaskId,
      streamSize,
      setStreamSize,
      listMasks,
      refresh,
      addMask,
      duplicateMask,
      updateMaskPoints,
      removeMask,
      removeAllMasks,
      renameMask,
      setMaskEnabled,
      setAppearance,
      validateMaskName
    }),
    [
      capabilities,
      frame,
      rotation,
      appearance,
      masks,
      selectedMaskId,
      streamSize,
      setStreamSize,
      listMasks,
      refresh,
      addMask,
      duplicateMask,
      updateMaskPoints,
      removeMask,
      removeAllMasks,
      renameMask,
      setMaskEnabled,
      setAppearance,
      validateMaskName
    ]
  );

  return (
    <PrivacyMaskContext.Provider value={value}>
      {children}
    </PrivacyMaskContext.Provider>
  );
};

export const usePrivacyMaskContext = (): PrivacyMaskContextProps => {
  const context = useContext(PrivacyMaskContext);
  if (!context) {
    throw new Error(
      'usePrivacyMaskContext must be used within a PrivacyMaskProvider'
    );
  }
  return context;
};
