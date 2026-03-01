/**
 * usePTZControl
 *
 * Custom React hook for PTZ (Pan-Tilt-Zoom) camera control via keyboard.
 *
 * Keyboard controls:
 *   Arrow keys: Pan/tilt movement (can be combined for diagonal movement)
 *   +/= keys: Zoom in
 *   -/_ keys: Zoom out
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppContext } from '../components/AppContext';
import { useOnScreenMessage } from '../components/OnScreenMessageContext';
import { serverGet } from './cgihelper';
/* MUI */
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';

/* PTZ speed value used for each arrow key direction (pan, tilt) */
const PTZ_SPEED = 30;

/* Zoom speed value for +/- keys */
const ZOOM_SPEED = 6000;

/* Map each arrow key to a [pan, tilt] speed tuple for continuouspantiltmove */
const PTZ_KEY_MAP: Record<string, [number, number]> = {
  ArrowLeft: [-PTZ_SPEED, 0],
  ArrowRight: [PTZ_SPEED, 0],
  ArrowUp: [0, PTZ_SPEED],
  ArrowDown: [0, -PTZ_SPEED]
};

/* Map zoom keys to speed values for continuouszoommove */
const ZOOM_KEY_MAP: Record<string, number> = {
  '+': ZOOM_SPEED,
  '=': ZOOM_SPEED,
  '-': -ZOOM_SPEED,
  _: -ZOOM_SPEED
};

/**
 * Send PTZ pan/tilt command
 */
export const sendPtzMove = (
  pan: number,
  tilt: number,
  currentChannel: string
): void => {
  serverGet(
    `/axis-cgi/com/ptz.cgi?camera=${currentChannel}&continuouspantiltmove=${pan},${tilt}`
  ).catch((err) => console.error('PTZ command failed:', err));
};

/**
 * Send PTZ zoom command
 */
export const sendPtzZoom = (speed: number, currentChannel: string): void => {
  serverGet(
    `/axis-cgi/com/ptz.cgi?camera=${currentChannel}&continuouszoommove=${speed}`
  ).catch((err) => console.error('PTZ zoom command failed:', err));
};

/**
 * Hook for PTZ camera keyboard control
 * Automatically gets currentChannel from AppContext
 * Shows an on-screen hint message on mount
 */
export const usePTZControl = () => {
  const location = useLocation();

  /* Global state */
  const { currentChannel } = useAppContext();
  const { showMessage } = useOnScreenMessage();

  /* Refs */
  const currentChannelRef = useRef(currentChannel);
  const messageShownRef = useRef(false);
  const initialPathRef = useRef(location.pathname);

  /* Sync currentChannel ref so handlers always use latest value */
  useEffect(() => {
    currentChannelRef.current = currentChannel;
  }, [currentChannel]);

  /* Show PTZ control hint message on mount (only once and only if initially loaded at root path) */
  useEffect(() => {
    if (!messageShownRef.current && initialPathRef.current === '/') {
      messageShownRef.current = true;
      showMessage({
        title: 'PTZ Controls',
        icon: <SportsEsportsIcon fontSize="small" />,
        content: (
          <div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Arrow Keys:</strong> Pan & Tilt
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>+ / -:</strong> Zoom In & Out
            </div>
            <div>
              <strong>P:</strong> Toggle PTZ crosshair control
            </div>
          </div>
        ),
        duration: 8000
      });
    }
  }, [showMessage]);

  /* PTZ keyboard control
   *
   * Arrow keys start continuous pan/tilt movement via "continuouspantiltmove".
   * The camera moves until a keyup sends the stop command (0,0).
   * +/- keys control zoom via "continuouszoommove".
   * Repeated keydown events (key held) are ignored - the device keeps moving
   * after the initial start command is issued.
   */
  useEffect(() => {
    const activeKeys = new Set<string>();
    let activeZoomKey: string | null = null;

    /* Compute combined pan/tilt vector from all active keys */
    const sendCombinedMove = () => {
      if (!currentChannelRef.current) {
        return;
      }
      let pan = 0;
      let tilt = 0;
      activeKeys.forEach((key) => {
        const move = PTZ_KEY_MAP[key];
        if (move) {
          pan += move[0];
          tilt += move[1];
        }
      });
      sendPtzMove(pan, tilt, currentChannelRef.current);
    };

    /* Start moving when key is pressed */
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!currentChannelRef.current) {
        return;
      }

      /* Ignore if typing in an input/textarea/select/contenteditable */
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
      /* Handle zoom keys */
      const zoomSpeed = ZOOM_KEY_MAP[event.key];
      if (zoomSpeed !== undefined) {
        event.preventDefault();
        /* Only send the zoom command on the first press, not on key-repeat */
        if (!activeZoomKey) {
          activeZoomKey = event.key;
          sendPtzZoom(zoomSpeed, currentChannelRef.current);
        }
        return;
      }
      /* Handle pan/tilt keys */
      const move = PTZ_KEY_MAP[event.key];
      if (!move) {
        return;
      }
      event.preventDefault();
      /* Only send the start command on the first press, not on key-repeat */
      if (!activeKeys.has(event.key)) {
        activeKeys.add(event.key);
        sendCombinedMove();
      }
    };

    /* Stop movement when key is released */
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (!currentChannelRef.current) {
        return;
      }
      /* Handle zoom key release */
      if (ZOOM_KEY_MAP[event.key] !== undefined) {
        if (activeZoomKey === event.key) {
          activeZoomKey = null;
          sendPtzZoom(0, currentChannelRef.current);
        }
        return;
      }
      /* Handle pan/tilt key release */
      if (!PTZ_KEY_MAP[event.key]) {
        return;
      }
      if (!activeKeys.has(event.key)) {
        return;
      }
      activeKeys.delete(event.key);
      /* Stop movement only when all PTZ keys are released */
      sendCombinedMove();
    };

    /* Stop movement when window loses focus */
    const handleBlur = () => {
      if (!currentChannelRef.current) {
        return;
      }
      if (activeKeys.size > 0) {
        activeKeys.clear();
        sendPtzMove(0, 0, currentChannelRef.current);
      }
      if (activeZoomKey) {
        activeZoomKey = null;
        sendPtzZoom(0, currentChannelRef.current);
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      /* Ensure the camera stops if the component unmounts while a key is held */
      if (currentChannelRef.current) {
        if (activeKeys.size > 0) {
          sendPtzMove(0, 0, currentChannelRef.current);
        }
        if (activeZoomKey) {
          sendPtzZoom(0, currentChannelRef.current);
        }
      }
    };
  }, []);

  /* Return control functions for programmatic use if needed */
  return {
    movePTZ: (pan: number, tilt: number) => {
      if (currentChannelRef.current) {
        sendPtzMove(pan, tilt, currentChannelRef.current);
      }
    },
    zoom: (speed: number) => {
      if (currentChannelRef.current) {
        sendPtzZoom(speed, currentChannelRef.current);
      }
    },
    stopMovement: () => {
      if (currentChannelRef.current) {
        sendPtzMove(0, 0, currentChannelRef.current);
      }
    },
    stopZoom: () => {
      if (currentChannelRef.current) {
        sendPtzZoom(0, currentChannelRef.current);
      }
    }
  };
};
