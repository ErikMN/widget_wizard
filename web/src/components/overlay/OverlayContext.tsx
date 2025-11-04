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
import { O_CGI } from '../constants';
import { log } from '../../helpers/logger';
import { jsonRequest } from '../../helpers/cgihelper.jsx';
import { useTabVisibility } from '../../helpers/hooks.jsx';
import {
  ImageOverlay,
  TextOverlay,
  OverlayCapabilities
} from './overlayInterfaces';
import { useGlobalContext } from '../GlobalContext';
import { playSound } from '../../helpers/utils';
import newSoundUrl from '../../assets/audio/new.oga';
import warningSoundUrl from '../../assets/audio/warning.oga';
import trashSoundUrl from '../../assets/audio/trash.oga';

const API_VERSION = '1.8';

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
  activeDraggableOverlay: { id: number | null; active: boolean };
  setActiveDraggableOverlay: React.Dispatch<
    React.SetStateAction<{ id: number | null; active: boolean }>
  >;
}

const OverlayContext = createContext<OverlayContextProps | undefined>(
  undefined
);

export const OverlayProvider: React.FC<{ children: ReactNode }> = ({
  children
}) => {
  /* Global context */
  const { handleOpenAlert, setWidgetLoading } = useGlobalContext();

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
  }>({ id: null, active: false });

  const onSelectOverlay = useCallback((id: number | null) => {
    setActiveOverlayId(id);
  }, []);

  /* Response helper */
  const handleResponse = (json: any, successMsg: string) => {
    if (json?.error) {
      playSound(warningSoundUrl);
      handleOpenAlert(
        json.error.message || 'Overlay operation failed',
        'error'
      );
      console.error('Overlay API error:', json.error);
      return false;
    }
    handleOpenAlert(successMsg, 'success');

    return true;
  };

  /****************************************************************************/
  /* API methods */

  /* List overlay capabilities */
  const listOverlayCapabilities = useCallback(async () => {
    try {
      setWidgetLoading(true);
      const payload = {
        apiVersion: API_VERSION,
        method: 'getOverlayCapabilities'
      };
      const resp = await jsonRequest(O_CGI, payload);
      setWidgetLoading(false);

      log('[Overlay] getOverlayCapabilities:', resp);

      if (resp?.error) {
        throw new Error(resp.error.message);
      }

      if (resp?.data) {
        setOverlayCapabilities(resp.data);
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
  }, [handleOpenAlert]);

  /* List overlays */
  const listOverlays = useCallback(async () => {
    try {
      setWidgetLoading(true);
      const payload = {
        apiVersion: API_VERSION,
        method: 'list',
        params: {}
      };
      const resp = await jsonRequest(O_CGI, payload);
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
  }, [handleOpenAlert]);

  /* List overlays on tab switch */
  useTabVisibility(listOverlays);

  /* Add an image overlay */
  const addImageOverlay = useCallback(
    async (params?: Partial<ImageOverlay>) => {
      try {
        setWidgetLoading(true);
        const payload = {
          apiVersion: API_VERSION,
          method: 'addImage',
          params: {
            camera: params?.camera ?? 1,
            /* Adding an image overlay required an overlayPath */
            overlayPath: params?.overlayPath,
            position: params?.position ?? 'bottomRight'
          }
        };

        /* Prevent invalid requests if missing overlayPath */
        if (!payload.params.overlayPath) {
          throw new Error('Missing overlayPath for image overlay');
        }

        const resp = await jsonRequest(O_CGI, payload);
        setWidgetLoading(false);

        log('[Overlay] addImage:', resp);

        if (!handleResponse(resp, 'Image overlay added')) {
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
    [listOverlays, handleOpenAlert]
  );

  /* Add a text overlay */
  const addTextOverlay = useCallback(
    async (params?: Partial<TextOverlay>) => {
      try {
        setWidgetLoading(true);
        const payload = {
          apiVersion: API_VERSION,
          method: 'addText',
          params: {
            camera: params?.camera ?? 1,
            text: params?.text ?? 'Hello World!',
            position: params?.position ?? 'topLeft',
            textColor: params?.textColor ?? 'white',
            ...(params?.fontSize ? { fontSize: params.fontSize } : {}),
            reference: params?.reference ?? 'channel'
          }
        };
        const resp = await jsonRequest(O_CGI, payload);
        setWidgetLoading(false);

        log('[Overlay] addText:', resp);

        if (!handleResponse(resp, 'Text overlay added')) {
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
    [listOverlays, handleOpenAlert]
  );

  /* Remove an overlay */
  const removeOverlay = useCallback(
    async (id: number) => {
      try {
        setWidgetLoading(true);
        const payload = {
          apiVersion: API_VERSION,
          method: 'remove',
          params: { identity: id }
        };
        const resp = await jsonRequest(O_CGI, payload);
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
    [listOverlays, handleOpenAlert]
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
  }, [activeOverlays, removeOverlay, handleOpenAlert]);

  /* Update an image overlay */
  const updateImageOverlay = useCallback(
    async (overlay: ImageOverlay) => {
      try {
        setWidgetLoading(true);
        const payload = {
          apiVersion: API_VERSION,
          method: 'setImage',
          params: {
            identity: overlay.identity,
            overlayPath: overlay.overlayPath,
            position: overlay.position
          }
        };
        const resp = await jsonRequest(O_CGI, payload);
        setWidgetLoading(false);

        log('[Overlay] setImage:', resp);

        if (
          !handleResponse(resp, `Updated image overlay #${overlay.identity}`)
        ) {
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
    [listOverlays, handleOpenAlert]
  );

  /* Update a text overlay */
  const updateTextOverlay = useCallback(
    async (overlay: TextOverlay) => {
      try {
        setWidgetLoading(true);
        const payload = {
          apiVersion: API_VERSION,
          method: 'setText',
          params: {
            identity: overlay.identity,
            text: overlay.text,
            position: overlay.position,
            textColor: overlay.textColor,
            textBGColor: overlay.textBGColor,
            textOLColor: overlay.textOLColor,
            fontSize: overlay.fontSize,
            reference: overlay.reference,
            rotation: overlay.rotation,
            indicator: overlay.indicator ?? '',
            indicatorColor: overlay.indicatorColor ?? 'white',
            indicatorBG: overlay.indicatorBG ?? 'transparent',
            indicatorOL: overlay.indicatorOL ?? 'black',
            indicatorSize: overlay.indicatorSize ?? overlay.fontSize ?? 100,
            zoomInterval: overlay.zoomInterval?.join(',') ?? '1,19999'
          }
        };
        const json = await jsonRequest(O_CGI, payload);
        setWidgetLoading(false);

        log('[Overlay] setText:', json);

        if (
          !handleResponse(json, `Updated text overlay #${overlay.identity}`)
        ) {
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
    [listOverlays, handleOpenAlert]
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
    setActiveDraggableOverlay
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
