/*
 * OverlayContext: Provides state and API for dynamic overlays.
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode
} from 'react';
import { log } from '../../helpers/logger';
import { useTabVisibility } from '../../helpers/hooks.jsx';
import {
  ImageOverlay,
  TextOverlay,
  OverlayCapabilities
} from './overlayInterfaces';
import { useAppContext } from '../AppContext';
import { playSound } from '../../helpers/utils';
import newSoundUrl from '../../assets/audio/new.oga';
import warningSoundUrl from '../../assets/audio/warning.oga';
import trashSoundUrl from '../../assets/audio/trash.oga';
import {
  apiListOverlayCapabilities,
  apiListOverlays,
  apiAddImageOverlay,
  apiAddTextOverlay,
  apiRemoveOverlay,
  apiUpdateImageOverlay,
  apiUpdateTextOverlay
} from './overlayApi';

/* Interface defining the structure of the context */
interface OverlayContextProps {
  overlaySupported: boolean;
  overlayCapabilities: OverlayCapabilities | null;
  imageFiles: string[];
  activeOverlays: (ImageOverlay | TextOverlay)[];
  activeOverlayId: number | null;
  onSelectOverlay: (id: number | null) => void;
  listOverlayCapabilities: () => Promise<void>;
  listOverlays: () => Promise<void>;
  addImageOverlay: (params?: Partial<ImageOverlay>) => Promise<void>;
  addTextOverlay: (params?: Partial<TextOverlay>) => Promise<void>;
  removeOverlay: (id: number) => Promise<void>;
  removeAllOverlays: () => Promise<void>;
  updateImageOverlay: (overlay: ImageOverlay) => Promise<void>;
  updateTextOverlay: (overlay: TextOverlay) => Promise<void>;
  duplicateOverlay: (overlay: ImageOverlay | TextOverlay) => Promise<void>;
  activeDraggableOverlay: {
    id: number | null;
    active: boolean;
    highlight: boolean;
  };
  setActiveDraggableOverlay: React.Dispatch<
    React.SetStateAction<{
      id: number | null;
      active: boolean;
      highlight: boolean;
    }>
  >;
}

const OverlayContext = createContext<OverlayContextProps | undefined>(
  undefined
);

export const OverlayProvider: React.FC<{ children: ReactNode }> = ({
  children
}) => {
  /* Global context */
  const { handleOpenAlert, setWidgetLoading } = useAppContext();

  /* Local state */
  const [overlaySupported, setOverlaySupported] = useState(true);
  const [overlayCapabilities, setOverlayCapabilities] =
    useState<OverlayCapabilities | null>(null);
  const [activeOverlays, setActiveOverlays] = useState<
    (ImageOverlay | TextOverlay)[]
  >([]);
  const [imageFiles, setImageFiles] = useState<string[]>([]);
  const [activeOverlayId, setActiveOverlayId] = useState<number | null>(null);

  const [activeDraggableOverlay, setActiveDraggableOverlay] = useState<{
    id: number | null;
    active: boolean;
    highlight: boolean;
  }>({ id: null, active: false, highlight: false });

  const onSelectOverlay = useCallback((id: number | null) => {
    setActiveOverlayId(id);
  }, []);

  /* Response helper */
  const handleResponse = (json: any, successMsg: string | null = null) => {
    if (json?.error) {
      playSound(warningSoundUrl);
      handleOpenAlert(
        json.error.message || 'Overlay operation failed',
        'error'
      );
      console.error('Overlay API error:', json.error);
      return false;
    }

    if (successMsg) {
      handleOpenAlert(successMsg, 'success');
    }

    return true;
  };

  /****************************************************************************/
  /* API methods */

  /* List overlay capabilities */
  const listOverlayCapabilities = useCallback(async () => {
    try {
      setWidgetLoading(true);
      const resp = await apiListOverlayCapabilities();
      setWidgetLoading(false);

      if (resp) {
        log('[Overlay] getOverlayCapabilities:', resp);
      }

      if (resp?.error) {
        throw new Error(resp.error.message);
      }

      if (resp?.data) {
        setOverlayCapabilities(resp);
        setOverlaySupported(true);
      } else {
        setOverlaySupported(false);
      }
    } catch (error) {
      setOverlaySupported(false);
      setWidgetLoading(false);
      playSound(warningSoundUrl);
      handleOpenAlert('Failed to fetch overlay capabilities', 'error');
      console.error('Error:', error);
    }
  }, [handleOpenAlert, setWidgetLoading]);

  /* List overlays */
  const listOverlays = useCallback(async () => {
    try {
      setWidgetLoading(true);
      const resp = await apiListOverlays();
      setWidgetLoading(false);

      log('[Overlay] list:', resp);

      if (resp?.error) {
        throw new Error(resp.error.message);
      }

      setImageFiles(resp?.data?.imageFiles ?? []);
      const overlays = [
        ...(resp?.data?.imageOverlays ?? []),
        ...(resp?.data?.textOverlays ?? [])
      ];
      setActiveOverlays(overlays);
    } catch (err) {
      setWidgetLoading(false);
      console.error('Failed to list overlays:', err);
      playSound(warningSoundUrl);
      handleOpenAlert('Failed to list overlays', 'error');
    }
  }, [handleOpenAlert, setWidgetLoading]);

  /* List overlays on tab switch */
  useTabVisibility(listOverlays);

  /* Add an image overlay */
  const addImageOverlay = useCallback(
    async (params?: Partial<ImageOverlay>) => {
      try {
        setWidgetLoading(true);
        /* Adding an image overlay requires an overlayPath */
        if (!params?.overlayPath) {
          throw new Error('Missing overlayPath for image overlay');
        }
        const resp = await apiAddImageOverlay({
          camera: params.camera ?? 1,
          overlayPath: params.overlayPath,
          position:
            typeof params.position === 'string'
              ? params.position
              : 'bottomRight'
        });
        setWidgetLoading(false);

        log('[Overlay] addImage:', resp);

        if (!handleResponse(resp, 'Added image overlay')) {
          return;
        }
        playSound(newSoundUrl);

        await listOverlays();
      } catch (err) {
        setWidgetLoading(false);
        console.error('Failed to add image overlay:', err);
        playSound(warningSoundUrl);
        handleOpenAlert('Failed to add image overlay', 'error');
      }
    },
    [listOverlays, handleOpenAlert, setWidgetLoading]
  );

  /* Add a text overlay */
  const addTextOverlay = useCallback(
    async (params?: Partial<TextOverlay>) => {
      try {
        setWidgetLoading(true);
        const resp = await apiAddTextOverlay({
          camera: params?.camera ?? 1,
          text: params?.text ?? 'Hello World!',
          position:
            typeof params?.position === 'string' ? params.position : 'topLeft',
          textColor: params?.textColor ?? 'white',
          textBGColor: params?.textBGColor ?? 'transparent',
          textOLColor: params?.textOLColor ?? 'black',
          ...(params?.fontSize ? { fontSize: params.fontSize } : {}),
          reference: params?.reference ?? 'channel'
        });
        setWidgetLoading(false);

        log('[Overlay] addText:', resp);

        if (!handleResponse(resp, 'Added text overlay')) {
          return;
        }
        playSound(newSoundUrl);

        await listOverlays();
      } catch (err) {
        setWidgetLoading(false);
        console.error('Failed to add text overlay:', err);
        playSound(warningSoundUrl);
        handleOpenAlert('Failed to add text overlay', 'error');
      }
    },
    [listOverlays, handleOpenAlert, setWidgetLoading]
  );

  /* Remove an overlay */
  const removeOverlay = useCallback(
    async (id: number) => {
      try {
        setWidgetLoading(true);
        const resp = await apiRemoveOverlay(id);
        setWidgetLoading(false);

        log('[Overlay] remove:', resp);

        if (resp?.error) {
          handleOpenAlert(resp.error.message, 'error');
          playSound(warningSoundUrl);
          return;
        }

        playSound(trashSoundUrl);
        handleOpenAlert(`Removed overlay #${id}`, 'success');

        await listOverlays();
      } catch (err) {
        setWidgetLoading(false);
        console.error('Failed to remove overlay:', err);
        playSound(warningSoundUrl);
        handleOpenAlert(`Failed to remove overlay #${id}`, 'error');
      }
    },
    [listOverlays, handleOpenAlert, setWidgetLoading]
  );

  /* Remove all overlays (by looping removeOverlay) */
  const removeAllOverlays = useCallback(async () => {
    try {
      log('[Overlay] removeAllOverlays');
      setWidgetLoading(true);
      for (const overlay of activeOverlays) {
        await removeOverlay(overlay.identity);
      }
      setWidgetLoading(false);
      setActiveOverlays([]);
      playSound(trashSoundUrl);
      handleOpenAlert('Removed all overlays', 'success');
    } catch (err) {
      setWidgetLoading(false);
      console.error('Failed to remove all overlays:', err);
      playSound(warningSoundUrl);
      handleOpenAlert('Failed to remove all overlays', 'error');
    }
  }, [activeOverlays, removeOverlay, handleOpenAlert, setWidgetLoading]);

  /* Update an image overlay */
  const updateImageOverlay = useCallback(
    async (overlay: ImageOverlay) => {
      try {
        setWidgetLoading(true);
        const resp = await apiUpdateImageOverlay(overlay);
        setWidgetLoading(false);

        log('[Overlay] setImage:', resp);

        if (!handleResponse(resp)) {
          return;
        }

        await listOverlays();
      } catch (err) {
        setWidgetLoading(false);
        console.error('Failed to update image overlay:', err);
        playSound(warningSoundUrl);
        handleOpenAlert(
          `Failed to update image overlay #${overlay.identity}`,
          'error'
        );
      }
    },
    [listOverlays, handleOpenAlert, setWidgetLoading]
  );

  /* Update a text overlay */
  const updateTextOverlay = useCallback(
    async (overlay: TextOverlay) => {
      try {
        setWidgetLoading(true);
        const json = await apiUpdateTextOverlay(overlay);
        setWidgetLoading(false);

        log('[Overlay] setText:', json);

        if (!handleResponse(json)) {
          return;
        }

        await listOverlays();
      } catch (err) {
        setWidgetLoading(false);
        console.error('Failed to update text overlay:', err);
        playSound(warningSoundUrl);
        handleOpenAlert(
          `Failed to update text overlay #${overlay.identity}`,
          'error'
        );
      }
    },
    [listOverlays, handleOpenAlert, setWidgetLoading]
  );

  /* Duplicates an existing overlay (using accepted fields) */
  const duplicateOverlay = useCallback(
    async (overlay: ImageOverlay | TextOverlay) => {
      try {
        /* Image overlay */
        if ('overlayPath' in overlay) {
          await addImageOverlay({
            camera: overlay.camera,
            overlayPath: overlay.overlayPath,
            position: overlay.position
          });
          return;
        }

        /* Text overlay */
        await addTextOverlay({
          camera: overlay.camera,
          text: overlay.text,
          position: overlay.position,
          textColor: overlay.textColor,
          fontSize: overlay.fontSize,
          reference: overlay.reference
        });
      } catch (err) {
        console.error('Failed to duplicate overlay:', err);
      }
    },
    [addImageOverlay, addTextOverlay]
  );

  /****************************************************************************/
  /* Provider */

  const value: OverlayContextProps = {
    overlaySupported,
    overlayCapabilities,
    imageFiles,
    activeOverlays,
    activeOverlayId,
    onSelectOverlay,
    listOverlayCapabilities,
    listOverlays,
    addImageOverlay,
    addTextOverlay,
    removeOverlay,
    removeAllOverlays,
    updateImageOverlay,
    updateTextOverlay,
    activeDraggableOverlay,
    setActiveDraggableOverlay,
    duplicateOverlay
  };

  return (
    <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
  );
};

/* Hook to use the OverlayContext, with an error if used outside the provider */
export const useOverlayContext = (): OverlayContextProps => {
  const context = useContext(OverlayContext);
  if (!context) {
    throw new Error('useOverlayContext must be used within OverlayProvider');
  }
  return context;
};
