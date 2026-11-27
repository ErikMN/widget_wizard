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
  apiListPrivacyMasks,
  apiRemovePrivacyMask,
  apiRenamePrivacyMask,
  apiSetPrivacyMaskAppearance,
  apiSetPrivacyMaskEnabled,
  apiUpdatePrivacyMask
} from './privacyMaskApi';
import {
  MIN_MASK_CORNERS,
  createDefaultPolygon,
  generateMaskName,
  getMaxResolution,
  normalizeRotation,
  parseResolution,
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
  /* Stream size reported by the canvas, used for aspect ratio warnings */
  streamSize: { width: number; height: number } | null;
  setStreamSize: (size: { width: number; height: number } | null) => void;
  listMasks: () => Promise<void>;
  addMask: (points?: MaskPoint[], name?: string) => Promise<boolean>;
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
  const [streamSize, setStreamSize] = useState<{
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
   * With source rotation the stream rotation parameter is ignored by the
   * device and the source rotation applies to every stream.
   */
  const rotation = useMemo<StreamRotation>(() => {
    if (parameters?.[`root.ImageSource.I${source}.SourceRotation`] === 'yes') {
      return normalizeRotation(
        parameters?.[`root.ImageSource.I${source}.Rotation`]
      );
    }
    try {
      const vapix = JSON.parse(window.localStorage.getItem('vapix') ?? '{}');
      if (vapix?.rotation !== undefined && vapix.rotation !== '') {
        return normalizeRotation(vapix.rotation);
      }
    } catch {
      /* Ignore invalid stored stream settings */
    }
    return normalizeRotation(
      parameters?.[`root.Image.I${source}.Appearance.Rotation`]
    );
  }, [parameters, source]);

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

  useEffect(() => {
    if (!capabilities.supported) {
      return;
    }
    let cancelled = false;
    apiGetMosaicScaleRange(source).then((range) => {
      if (!cancelled && range) {
        setMosaicRange(range);
      }
    });
    return () => {
      cancelled = true;
    };
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

  const addMask = useCallback(
    async (points?: MaskPoint[], name?: string) => {
      if (!frame) {
        return false;
      }
      if (masks.length >= capabilities.maxMasks) {
        handleOpenAlert(
          `Maximum number of privacy masks (${capabilities.maxMasks}) reached`,
          'warning'
        );
        return false;
      }
      const maskName = name ?? generateMaskName(masks.map((m) => m.name));
      const maskPoints = points ?? createDefaultPolygon(frame);
      const ok = await runMutation(
        () => apiAddPrivacyMask(frame, maskName, maskPoints),
        'Failed to add privacy mask',
        `Added privacy mask "${maskName}"`
      );
      if (ok) {
        playSound(newSoundUrl);
        pendingSelectNameRef.current = maskName;
      }
      return ok;
    },
    [frame, masks, capabilities.maxMasks, handleOpenAlert, runMutation]
  );

  const duplicateMask = useCallback(
    async (mask: PrivacyMask) => {
      if (!frame) {
        return false;
      }
      const names = masks.map((m) => m.name);
      let name = `${mask.name} copy`.slice(0, MAX_MASK_NAME_LENGTH);
      for (let i = 2; names.includes(name); i++) {
        name = `${mask.name} copy ${i}`.slice(0, MAX_MASK_NAME_LENGTH);
      }
      const offset = Math.round(Math.min(frame.width, frame.height) * 0.03);
      return addMask(
        translatePolygon(mask.points, offset, offset, frame),
        name
      );
    },
    [frame, masks, addMask]
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
      /* Optimistic update so the polygon does not jump back while saving */
      setMasks((current) =>
        current.map((m) => (m.id === id ? { ...m, points } : m))
      );
      /* Serialize writes per mask to keep the last edit authoritative */
      const previous = updateQueueRef.current.get(id) ?? Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(() =>
          runMutation(
            () => apiUpdatePrivacyMask(frame, mask.name, points),
            'Failed to update privacy mask'
          )
        );
      updateQueueRef.current.set(id, next);
      const ok = await next;
      if (updateQueueRef.current.get(id) === next) {
        updateQueueRef.current.delete(id);
      }
      return ok;
    },
    [frame, masks, capabilities.maxCorners, handleOpenAlert, runMutation]
  );

  const removeMask = useCallback(
    async (id: number) => {
      const mask = masks.find((m) => m.id === id);
      if (!mask) {
        return false;
      }
      await updateQueueRef.current.get(id)?.catch(() => undefined);
      const ok = await runMutation(
        () => apiRemovePrivacyMask(mask.name),
        'Failed to remove privacy mask',
        `Removed privacy mask "${mask.name}"`
      );
      if (ok) {
        playSound(trashSoundUrl);
        setSelectedMaskId((current) => (current === id ? null : current));
      }
      return ok;
    },
    [masks, runMutation]
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
      await updateQueueRef.current.get(id)?.catch(() => undefined);
      return runMutation(
        () => apiRenamePrivacyMask(source, id, trimmed),
        'Failed to rename privacy mask'
      );
    },
    [masks, source, validateMaskName, handleOpenAlert, runMutation]
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
      listMasks,
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
